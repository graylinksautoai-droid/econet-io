/**
 * Engine 16: Community Engine — CommunityRole Value Object
 * Community-scoped roles. These roles grant authority ONLY within the owning
 * community and never escalate to system/global privileges, identity
 * management, verification, reward, or governance authority.
 */

export const CommunityRole = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER'
});

export const ROLE_HIERARCHY = Object.freeze({
  [CommunityRole.OWNER]: 4,
  [CommunityRole.ADMIN]: 3,
  [CommunityRole.MODERATOR]: 2,
  [CommunityRole.MEMBER]: 1
});

export function isValidCommunityRole(role) {
  return Object.values(CommunityRole).includes(role);
}

export function normalizeCommunityRole(role) {
  const normalized = String(role ?? 'MEMBER').trim().toUpperCase();
  if (!isValidCommunityRole(normalized)) {
    throw new Error(`Invalid community role: "${role}". Must be OWNER, ADMIN, MODERATOR, or MEMBER.`);
  }
  return normalized;
}

/** Whether a role can administer (manage members/state) the community. */
export function canAdministerCommunity(role) {
  return ROLE_HIERARCHY[normalizeCommunityRole(role)] >= ROLE_HIERARCHY[CommunityRole.MODERATOR];
}

/** Whether a role can manage other members' roles/membership. */
export function canManageMembers(role) {
  return ROLE_HIERARCHY[normalizeCommunityRole(role)] >= ROLE_HIERARCHY[CommunityRole.MODERATOR];
}

/** Whether a role may change another actor's role (admin/owner only). */
export function canAssignRoles(role) {
  return ROLE_HIERARCHY[normalizeCommunityRole(role)] >= ROLE_HIERARCHY[CommunityRole.ADMIN];
}