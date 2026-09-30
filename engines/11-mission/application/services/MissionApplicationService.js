/**
 * Engine 11: Mission Engine — MissionApplicationService.
 * Orchestrates mission lifecycle and objective mutations with Engine 22
 * Governance pre-mutation gating, shared DomainEvent publication, Engine 23
 * audit metadata, and idempotency per established repository conventions.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { Mission } from '../../domain/entities/Mission.js';
import { MissionStatus } from '../../domain/value-objects/MissionStatus.js';
import { normalizeMissionPriority } from '../../domain/value-objects/MissionPriority.js';
import { createMissionCreatedEvent } from '../../domain/events/MissionCreated.js';
import { createMissionStatusChangedEvent } from '../../domain/events/MissionStatusChanged.js';
import { createObjectiveStatusChangedEvent } from '../../domain/events/ObjectiveStatusChanged.js';
import { InMemoryMissionRepository } from '../../infrastructure/repositories/InMemoryMissionRepository.js';

const ENGINE_SLUG = '11-mission';

const MUTATING_COMMANDS = new Set([
  'CreateMission',
  'ActivateMission',
  'AddObjective',
  'UpdateObjectiveStatus',
  'CompleteMission',
  'AbortMission',
  'SuspendMission',
  'ResumeMission'
]);

/**
 * Default authorized roles for mission management.
 * 'mission_lead' is the Engine 11-specific role confirmed by the test fixture.
 * 'system', 'admin', 'automation' are cross-engine roles consistent with
 * all other completed engines (E15, E18, E19, E20, E21, E22, E24).
 */
const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'mission_lead',
  'automation'
]);

export class MissionApplicationService {
  constructor({
    repository = new InMemoryMissionRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedRoles = Array.isArray(authorizedRoles)
      ? [...authorizedRoles]
      : [...DEFAULT_AUTHORIZED_ROLES];
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Mission command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Mission command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Mission commands require an authenticated actor.');
    }

    // Authorization before idempotency and mutation — canonical E15/18/19/20/21/22/24 pattern.
    // Missing, null, non-array, or empty roles are denied.
    this._assertAuthorized(cmd);

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async getMissionById(missionId) {
    if (!missionId) {
      throw new Error('missionId is required.');
    }
    const mission = await this.repository.findById(missionId);
    return mission ? mission.toJSON() : null;
  }

  /**
   * List missions in the ACTIVE lifecycle state, optionally filtered by
   * mission priority. Priority filtering is justified by Engine 11's owned
   * priority-weighting responsibility.
   * @param {{ priority?: string }} [filter]
   * @returns {Promise<Array<Object>>}
   */
  async listActiveMissions({ priority = null } = {}) {
    let missions = await this.repository.findActive();
    if (priority) {
      const normalized = normalizeMissionPriority(priority);
      missions = missions.filter(mission => mission.priority === normalized);
    }
    return missions.map(mission => mission.toJSON());
  }

  async _dispatch(command) {
    switch (command.commandType) {
      case 'CreateMission':
        return this._handleCreateMission(command);
      case 'ActivateMission':
        return this._handleMissionTransition(command, MissionStatus.ACTIVE, 'ActivateMission');
      case 'SuspendMission':
        return this._handleMissionTransition(command, MissionStatus.SUSPENDED, 'SuspendMission');
      case 'CompleteMission':
        return this._handleCompleteMission(command);
      case 'AbortMission':
        return this._handleMissionTransition(command, MissionStatus.ABORTED, 'AbortMission');
      case 'ResumeMission':
        return this._handleMissionTransition(command, MissionStatus.ACTIVE, 'ResumeMission');
      case 'AddObjective':
        return this._handleAddObjective(command);
      case 'UpdateObjectiveStatus':
        return this._handleUpdateObjectiveStatus(command);
      default:
        throw new Error(`Unhandled Mission command: ${command.commandType}`);
    }
  }

  async _handleCreateMission(command) {
    const now = this._now();
    const mission = new Mission({
      ...command.payload,
      createdAt: now,
      updatedAt: now,
      // version 1: first persisted state. version 0 is the "not yet saved"
      // sentinel used by the optimistic concurrency guard in the MongoDB
      // adapter to detect the initial insert vs subsequent mutations.
      version: 1
    });
    await this.repository.save(mission);
    await this._publish(createMissionCreatedEvent({
      mission: mission.toJSON(),
      actor: command.actor,
      correlationId: command.correlationId
    }));
    return { mission: mission.toJSON(), missionChanged: true };
  }

  /**
   * Generic mission lifecycle transition handler. The domain aggregate owns
   * the deterministic transition table; the service never repairs states.
   */
  async _handleMissionTransition(command, nextStatus, commandType) {
    const { missionId, reason = null } = command.payload;
    const current = await this._requireMission(missionId);
    if (current.status === nextStatus) {
      return {
        mission: current.toJSON(),
        missionChanged: false,
        previousStatus: nextStatus,
        newStatus: nextStatus
      };
    }
    const transitioned = current.transitionTo(nextStatus, this._now());
    await this.repository.save(transitioned);
    await this._publish(createMissionStatusChangedEvent({
      mission: transitioned.toJSON(),
      previousStatus: current.status,
      reason,
      actor: command.actor,
      correlationId: command.correlationId,
      metadata: { triggerCommand: commandType }
    }));
    return {
      mission: transitioned.toJSON(),
      missionChanged: true,
      previousStatus: current.status,
      newStatus: nextStatus
    };
  }

  /**
   * Completion invariant (implementation baseline): the mission must be ACTIVE
   * and every objective must be in a terminal state (COMPLETED or FAILED).
   * The canonical specification is silent on required/optional objectives, so
   * no required/optional classification is enforced.
   */
  async _handleCompleteMission(command) {
    const { missionId, reason = null } = command.payload;
    const current = await this._requireMission(missionId);
    if (!current.canBeCompleted()) {
      throw new Error(
        `Mission "${missionId}" cannot be completed: the mission must be ACTIVE and all objectives must be in a terminal state.`
      );
    }
    return this._handleMissionTransition(command, MissionStatus.COMPLETED, 'CompleteMission');
  }

  async _handleAddObjective(command) {
    const { missionId, objectiveId, description } = command.payload;
    const current = await this._requireMission(missionId);
    const updated = current.addObjective({ objectiveId, description }, this._now());
    await this.repository.save(updated);
    return { mission: updated.toJSON(), missionChanged: true, objectiveId };
  }

  async _handleUpdateObjectiveStatus(command) {
    const { missionId, objectiveId, status, reason = null } = command.payload;
    const current = await this._requireMission(missionId);
    const updated = current.updateObjectiveStatus(objectiveId, status, this._now());
    if (updated === current) {
      return { mission: current.toJSON(), missionChanged: false, objectiveId, objectiveChanged: false };
    }
    await this.repository.save(updated);
    await this._publish(createObjectiveStatusChangedEvent({
      mission: updated.toJSON(),
      objectiveId,
      previousStatus: current.objectives.find(o => o.objectiveId === objectiveId).status,
      reason,
      actor: command.actor,
      correlationId: command.correlationId
    }));
    return {
      mission: updated.toJSON(),
      missionChanged: true,
      objectiveId,
      objectiveChanged: true,
      objectiveStatus: status
    };
  }

  async _requireMission(missionId) {
    if (!missionId) {
      throw new Error('missionId is required.');
    }
    const mission = await this.repository.findById(missionId);
    if (!mission) {
      throw new Error(`Mission not found: "${missionId}".`);
    }
    return mission;
  }

  /**
   * Authorization — canonical E15/18/19/20/21/22/24 pattern.
   * Missing, null, non-array, or empty roles are treated as no roles and denied.
   * actor and actor.actorId are guaranteed non-null by the execute() guard above.
   */
  _assertAuthorized(cmd) {
    const roles = Array.isArray(cmd.actor.roles) ? cmd.actor.roles : [];
    const allowed = roles.some(role => this.authorizedRoles.includes(role));
    if (!allowed) {
      throw new Error(
        `Mission command "${cmd.commandType}" denied: actor "${cmd.actor.actorId}" lacks an authorized mission role.`
      );
    }
  }

  async _assertGovernance(command) {
    if (!this.governance) return;
    const decision = await this.governance.evaluatePolicy({
      engine: ENGINE_SLUG,
      commandType: command.commandType,
      actor: command.actor,
      payload: command.payload
    });
    if (!decision.allowed) {
      throw new Error(`Governance policy denial: ${decision.reason || 'Command denied by policy.'}`);
    }
  }

  async _publish(event) {
    await this.eventBus.publish(event);
    return event;
  }

  _now() {
    return this.clock().toISOString();
  }
}

