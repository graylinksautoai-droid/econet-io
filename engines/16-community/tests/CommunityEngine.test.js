import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  CommunityEngine,
  InMemoryCommunityRepository,
  Community,
  CommunityMembership,
  CommunityStatus,
  MembershipStatus,
  CommunityRole,
  CommunityVisibility,
  canTransitionCommunityStatus,
  canTransitionMembership,
  normalizeCommunityRole,
  canManageMembers,
  canAssignRoles,
  assertCommunityStatusTransition,
  assertMembershipTransition
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '16-community',
  payload,
  actor: actor || { actorId: 'owner-a', roles: ['community_manager'] },
  idempotencyKey: `com-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryCommunityRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new CommunityEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-09-01T08:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

test('Community value objects validate status/visibility/role vocabularies', () => {
  // Status transitions
  assert.equal(canTransitionCommunityStatus(CommunityStatus.ACTIVE, CommunityStatus.SUSPENDED), true);
  assert.equal(canTransitionCommunityStatus(CommunityStatus.ACTIVE, CommunityStatus.ARCHIVED), true);
  assert.equal(canTransitionCommunityStatus(CommunityStatus.SUSPENDED, CommunityStatus.ACTIVE), true);
  assert.equal(canTransitionCommunityStatus(CommunityStatus.SUSPENDED, CommunityStatus.CLOSED), true);
  assert.equal(canTransitionCommunityStatus(CommunityStatus.ARCHIVED, CommunityStatus.ACTIVE), true);
  assert.equal(canTransitionCommunityStatus(CommunityStatus.CLOSED, CommunityStatus.ACTIVE), false, 'CLOSED is terminal');
  assert.equal(canTransitionCommunityStatus(CommunityStatus.ACTIVE, CommunityStatus.DRAFT), false);
  assert.throws(() => assertCommunityStatusTransition(CommunityStatus.CLOSED, CommunityStatus.ACTIVE), /Invalid community lifecycle transition/);

  // Visibility
  assert.equal(CommunityVisibility.PUBLIC, 'PUBLIC');
  assert.equal(CommunityVisibility.PRIVATE, 'PRIVATE');

  // Roles
  assert.equal(normalizeCommunityRole('moderator'), CommunityRole.MODERATOR);
  assert.equal(canManageMembers(CommunityRole.MODERATOR), true);
  assert.equal(canManageMembers(CommunityRole.MEMBER), false);
  assert.equal(canAssignRoles(CommunityRole.ADMIN), true);
  assert.equal(canAssignRoles(CommunityRole.MODERATOR), false);
  assert.throws(() => normalizeCommunityRole('president'), /Invalid community role/);
});

test('Membership value object enforces lifecycle and distinguishes states', () => {
  assert.equal(canTransitionMembership(MembershipStatus.PENDING, MembershipStatus.ACTIVE), true);
  assert.equal(canTransitionMembership(MembershipStatus.PENDING, MembershipStatus.REJECTED), true);
  assert.equal(canTransitionMembership(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED), true);
  assert.equal(canTransitionMembership(MembershipStatus.ACTIVE, MembershipStatus.LEFT), true);
  assert.equal(canTransitionMembership(MembershipStatus.ACTIVE, MembershipStatus.REMOVED), true);
  assert.equal(canTransitionMembership(MembershipStatus.SUSPENDED, MembershipStatus.ACTIVE), true);
  assert.equal(canTransitionMembership(MembershipStatus.LEFT, MembershipStatus.ACTIVE), false);
  assert.equal(canTransitionMembership(MembershipStatus.PENDING, MembershipStatus.REMOVED), false);
  assert.throws(() => assertMembershipTransition(MembershipStatus.LEFT, MembershipStatus.ACTIVE), /Invalid membership lifecycle transition/);
});

test('Community entity requires owner, name, and validates visibility', () => {
  const community = new Community({ name: 'Flood Watch', ownerId: 'actor-1' });
  assert.match(community.communityId, /^com_/);
  assert.equal(community.status, CommunityStatus.ACTIVE);
  assert.equal(community.visibility, CommunityVisibility.PUBLIC);
  assert.equal(Object.isFrozen(community), true);

  assert.throws(() => new Community({ name: '', ownerId: 'a' }), /non-empty name/);
  assert.throws(() => new Community({ name: 'x', ownerId: '' }), /non-empty ownerId/);
  assert.throws(() => new Community({ name: 'x', ownerId: 'a', visibility: 'SECRET' }), /Invalid community visibility/);
  assert.throws(() => new Community({ name: 'x', ownerId: 'a', status: 'DRAFT' }), /Unknown community status/);
});

test('Community lifecycle transition and profile update are immutable', () => {
  const community = new Community({ name: 'Green Collective', ownerId: 'actor-1' });
  const suspended = community.transitionTo(CommunityStatus.SUSPENDED);
  assert.equal(suspended.status, CommunityStatus.SUSPENDED);
  assert.equal(suspended.communityId, community.communityId);

  const updated = community.updateProfile({ name: 'Green Collective NG' });
  assert.equal(updated.name, 'Green Collective NG');
  assert.equal(community.name, 'Green Collective', 'original aggregate is unchanged');
});

test('CreateCommunity requires an authorized creator role and emits created event', async () => {
  const { engine, eventBus } = createFixture();

  // Unauthorized actor cannot create a community
  await assert.rejects(
    engine.executeCommand(command('CreateCommunity', { name: 'Sneaky', ownerId: 'x' }, 'cr-0', { actorId: 'citizen-1', roles: ['observer'] })),
    /lacks an authorized creator role/
  );

  // Authorized creator
  const res = await engine.executeCommand(command('CreateCommunity', {
    name: 'Ihiala Flood Watch',
    description: 'Community flood monitoring',
    visibility: 'PUBLIC'
  }, 'cr-1'));

  assert.match(res.community.communityId, /^com_/);
  assert.equal(res.community.name, 'Ihiala Flood Watch');
  assert.equal(res.community.status, CommunityStatus.ACTIVE);
  assert.equal(res.community.ownerId, 'owner-a');

  // Owner became an ACTIVE OWNER membership
  assert.equal(res.ownerMembership.role, CommunityRole.OWNER);
  assert.equal(res.ownerMembership.status, MembershipStatus.ACTIVE);

  const events = eventBus.getHistory({ eventType: 'econet.community.created' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.16.community');
  assert.equal(events[0].subject.entityType, 'community');
});

test('Membership request → approve → leave flow works with proper authorization', async () => {
  const { engine } = createFixture();

  const created = await engine.executeCommand(command('CreateCommunity', {
    name: 'Group A', visibility: 'PRIVATE'
  }, 'ma-1'));
  const communityId = created.community.communityId;

  // Volunteer requests membership
  const req = await engine.executeCommand(command('RequestMembership', {
    communityId,
    actorId: 'volunteer-1'
  }, 'ma-2', { actorId: 'volunteer-1', roles: ['observer'] }));
  assert.equal(req.membership.status, MembershipStatus.PENDING);
  assert.equal(req.membership.role, CommunityRole.MEMBER);

  // Ordinary member cannot approve (fails because PENDING membership is not active)
  await assert.rejects(
    engine.executeCommand(command('ApproveMembership', {
      communityId,
      membershipId: req.membership.membershipId
    }, 'ma-3', { actorId: 'volunteer-1', roles: ['observer'] })),
    /is not active|cannot administer community/
  );

  // Owner approves
  const approved = await engine.executeCommand(command('ApproveMembership', {
    communityId,
    membershipId: req.membership.membershipId
  }, 'ma-4'));
  assert.equal(approved.membership.status, MembershipStatus.ACTIVE);

  // Volunteer leaves
  const left = await engine.executeCommand(command('LeaveCommunity', {
    communityId
  }, 'ma-5', { actorId: 'volunteer-1', roles: ['observer'] }));
  assert.equal(left.membership.status, MembershipStatus.LEFT);

  // After leaving, volunteer cannot leave again
  await assert.rejects(
    engine.executeCommand(command('LeaveCommunity', {
      communityId
    }, 'ma-6', { actorId: 'volunteer-1', roles: ['observer'] })),
    /Cannot leave membership in status "LEFT"/
  );
});

test('Membership duplicate protection prevents conflicting active membership', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('CreateCommunity', {
    name: 'Group B'
  }, 'md-1'));
  const communityId = created.community.communityId;

  // First request creates PENDING
  const first = await engine.executeCommand(command('RequestMembership', {
    communityId, actorId: 'actor-x'
  }, 'md-2', { actorId: 'actor-x', roles: ['observer'] }));
  assert.equal(first.duplicated, false);

  // Duplicate request while PENDING is idempotent
  const second = await engine.executeCommand(command('RequestMembership', {
    communityId, actorId: 'actor-x'
  }, 'md-3', { actorId: 'actor-x', roles: ['observer'] }));
  assert.equal(second.duplicated, true);
  assert.equal(second.membership.membershipId, first.membership.membershipId);

  // Approve, then a duplicate request while ACTIVE is also idempotent
  await engine.executeCommand(command('ApproveMembership', {
    communityId, membershipId: first.membership.membershipId
  }, 'md-4'));
  const third = await engine.executeCommand(command('RequestMembership', {
    communityId, actorId: 'actor-x'
  }, 'md-5', { actorId: 'actor-x', roles: ['observer'] }));
  assert.equal(third.duplicated, true);

  // Single membership record preserved
  const memberships = await engine.listCommunityMembers(communityId, { includeInactive: true });
  assert.equal(memberships.length, 2); // owner + actor-x
  assert.equal(eventBus.getHistory({ eventType: 'econet.community.membership_requested' }).length, 1);
});

test('Membership reject flow and re-request after rejection', async () => {
  const { engine } = createFixture();

  const created = await engine.executeCommand(command('CreateCommunity', {
    name: 'Group C'
  }, 'mr-1'));
  const communityId = created.community.communityId;

  const req = await engine.executeCommand(command('RequestMembership', {
    communityId, actorId: 'actor-y'
  }, 'mr-2', { actorId: 'actor-y', roles: ['observer'] }));

  const rejected = await engine.executeCommand(command('RejectMembership', {
    communityId, membershipId: req.membership.membershipId
  }, 'mr-3'));
  assert.equal(rejected.membership.status, MembershipStatus.REJECTED);

  // Re-request after rejection creates a fresh PENDING membership
  const again = await engine.executeCommand(command('RequestMembership', {
    communityId, actorId: 'actor-y'
  }, 'mr-4', { actorId: 'actor-y', roles: ['observer'] }));
  assert.equal(again.duplicated, false);
  assert.equal(again.membership.status, MembershipStatus.PENDING);
});

test('Remove, suspend, and restore membership flows', async () => {
  const { engine } = createFixture();

  const created = await engine.executeCommand(command('CreateCommunity', {
    name: 'Group D'
  }, 'ms-1'));
  const communityId = created.community.communityId;

  const req = await engine.executeCommand(command('RequestMembership', {
    communityId, actorId: 'actor-z'
  }, 'ms-2', { actorId: 'actor-z', roles: ['observer'] }));
  await engine.executeCommand(command('ApproveMembership', {
    communityId, membershipId: req.membership.membershipId
  }, 'ms-3'));

  // Suspend
  const suspended = await engine.executeCommand(command('SuspendMember', {
    communityId, membershipId: req.membership.membershipId
  }, 'ms-4'));
  assert.equal(suspended.membership.status, MembershipStatus.SUSPENDED);

  // Restore
  const restored = await engine.executeCommand(command('RestoreMembership', {
    communityId, membershipId: req.membership.membershipId
  }, 'ms-5'));
  assert.equal(restored.membership.status, MembershipStatus.ACTIVE);

  // Remove
  const removed = await engine.executeCommand(command('RemoveMember', {
    communityId, membershipId: req.membership.membershipId
  }, 'ms-6'));
  assert.equal(removed.membership.status, MembershipStatus.REMOVED);
});

test('Role assignment requires admin and honors scope', async () => {
  const { engine } = createFixture();

  const created = await engine.executeCommand(command('CreateCommunity', {
    name: 'Group E'
  }, 'ra-1'));
  const communityId = created.community.communityId;
  const ownerMembershipId = created.ownerMembership.membershipId;

  // Moderator (a second actor) cannot assign roles
  const modReq = await engine.executeCommand(command('RequestMembership', {
    communityId, actorId: 'moderator-1'
  }, 'ra-2', { actorId: 'moderator-1', roles: ['observer'] }));
  await engine.executeCommand(command('ApproveMembership', {
    communityId, membershipId: modReq.membership.membershipId
  }, 'ra-3'));
  const modPromote = await engine.executeCommand(command('AssignCommunityRole', {
    communityId, membershipId: modReq.membership.membershipId, role: 'MODERATOR'
  }, 'ra-4'));
  assert.equal(modPromote.membership.role, CommunityRole.MODERATOR);

  // Moderator can manage members but cannot assign roles
  await assert.rejects(
    engine.executeCommand(command('AssignCommunityRole', {
      communityId, membershipId: modReq.membership.membershipId, role: 'ADMIN'
    }, 'ra-5', { actorId: 'moderator-1', roles: ['observer'] })),
    /cannot assign community roles/
  );

  // Owner cannot be re-assigned via role change
  await assert.rejects(
    engine.executeCommand(command('AssignCommunityRole', {
      communityId, membershipId: ownerMembershipId, role: 'MEMBER'
    }, 'ra-6')),
    /owner role cannot be changed/
  );

  // Ownership cannot be granted via AssignCommunityRole
  await assert.rejects(
    engine.executeCommand(command('AssignCommunityRole', {
      communityId, membershipId: modReq.membership.membershipId, role: 'OWNER'
    }, 'ra-7')),
    /Ownership cannot be assigned/
  );
});

test('Community status transitions block membership mutation and enforce scope', async () => {
  const { engine } = createFixture();

  const created = await engine.executeCommand(command('CreateCommunity', {
    name: 'Group F', visibility: 'PUBLIC'
  }, 'st-1'));
  const communityId = created.community.communityId;

  // Suspend the community
  const suspended = await engine.executeCommand(command('ChangeCommunityStatus', {
    communityId, status: CommunityStatus.SUSPENDED
  }, 'st-2'));
  assert.equal(suspended.community.status, CommunityStatus.SUSPENDED);

  // Membership request while suspended is rejected
  await assert.rejects(
    engine.executeCommand(command('RequestMembership', {
      communityId, actorId: 'actor-w'
    }, 'st-3', { actorId: 'actor-w', roles: ['observer'] })),
    /Membership operations are not permitted/
  );

  // CLOSED is terminal
  const closed = await engine.executeCommand(command('ChangeCommunityStatus', {
    communityId, status: CommunityStatus.CLOSED
  }, 'st-4'));
  assert.equal(closed.community.status, CommunityStatus.CLOSED);
  await assert.rejects(
    engine.executeCommand(command('ChangeCommunityStatus', {
      communityId, status: CommunityStatus.ACTIVE
    }, 'st-5')),
    /Invalid community lifecycle transition/
  );
});

test('Governance denial blocks community mutation with no state change or event', async () => {
  const repository = new InMemoryCommunityRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new CommunityEngine({
    repository,
    eventBus,
    idempotencyManager,
    governance: {
      async evaluatePolicy({ commandType }) {
        if (commandType === 'CreateCommunity') {
          return { allowed: false, reason: 'COMMUNITY_CREATION_SUSPENDED' };
        }
        return { allowed: true };
      }
    }
  });

  await assert.rejects(
    engine.executeCommand(command('CreateCommunity', {
      name: 'Blocked Group'
    }, 'gv-1')),
    /Governance policy denial: COMMUNITY_CREATION_SUSPENDED/
  );

  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.community.created' }).length, 0);
});

test('Idempotent duplicate commands do not double-create communities', async () => {
  const { engine, repository } = createFixture();
  const cmd = command('CreateCommunity', { name: 'Idem Group' }, 'idem-1');

  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(second.community.communityId, first.community.communityId);
  assert.equal(await repository.count(), 1);
});

test('Community scopes prevent cross-community privilege escalation', async () => {
  const { engine } = createFixture();

  // Owner creates two communities
  const a = await engine.executeCommand(command('CreateCommunity', { name: 'Alpha' }, 'x-1'));
  const b = await engine.executeCommand(command('CreateCommunity', { name: 'Beta' }, 'x-2'));
  const aId = a.community.communityId;
  const bId = b.community.communityId;

  // User requests membership and is approved in Alpha only
  await engine.executeCommand(command('RequestMembership', {
    communityId: aId, actorId: 'cross-1'
  }, 'x-3', { actorId: 'cross-1', roles: ['observer'] }));
  const aMemberships = await engine.listCommunityMembers(aId, { includeInactive: true });
  const reqMember = aMemberships.find(m => m.actorId === 'cross-1');
  await engine.executeCommand(command('ApproveMembership', {
    communityId: aId, membershipId: reqMember.membershipId
  }, 'x-4'));

  // That user cannot administer Beta (no membership there)
  await assert.rejects(
    engine.executeCommand(command('ApproveMembership', {
      communityId: bId, membershipId: 'mem-x'
    }, 'x-5', { actorId: 'cross-1', roles: ['observer'] })),
    /not a member of community/
  );

  // They cannot act as admin in Beta
  await assert.rejects(
    engine.executeCommand(command('ChangeCommunityStatus', {
      communityId: bId, status: CommunityStatus.ARCHIVED
    }, 'x-6', { actorId: 'cross-1', roles: ['observer'] })),
    /not a member of community/
  );
});

test('Queries return communities, memberships, and respect visibility filtering', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(command('CreateCommunity', { name: 'Public One', visibility: 'PUBLIC' }, 'q-1'));
  await engine.executeCommand(command('CreateCommunity', { name: 'Private One', visibility: 'PRIVATE' }, 'q-2'));

  const all = await engine.listCommunities();
  assert.equal(all.length, 2);

  const publicOnly = await engine.listCommunities({ visibility: 'PUBLIC' });
  assert.equal(publicOnly.length, 1);

  const activeOnly = await engine.listCommunities({ status: CommunityStatus.ACTIVE });
  assert.equal(activeOnly.length, 2);

  assert.equal(await engine.countMemberships(all[0].communityId), 1, 'each community has its owner');
});

test('CommunityEngine exposes canonical lifecycle contract', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '16');
  assert.equal(engine.engineName, 'Community Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_COMMUNITY_ADAPTER');
  assert.equal(health.details.totalCommunities, 0);

  await engine.executeCommand(command('CreateCommunity', { name: 'Health Group' }, 'h-1'));
  const health2 = await engine.healthCheck();
  assert.equal(health2.details.totalCommunities, 1);

  await engine.shutdown();
});
