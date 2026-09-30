/**
 * Engine 21: Automation Engine — TaskType Value Object
 *
 * CANONICAL BASIS: The canonical registry description for Engine 21 names four
 * responsibilities: "Backend execution queues, background job processing, event
 * triggers, and worker pipelines." The task types below map directly to these:
 *
 *   background job processing → BACKGROUND_JOB (generic background work)
 *   event triggers            → EVENT_TRIGGER   (react to a domain event)
 *   worker pipelines          → PIPELINE_STEP   (step within a worker pipeline)
 *   execution queues          → SCHEDULED_JOB   (time-scheduled recurring job)
 *                               NOTIFICATION_JOB (operational notification dispatch)
 *                               INTEGRATION_JOB  (invoke an approved connector)
 *
 * SECURITY: TaskType controls which handler is selected. Callers supply a task
 * type string; they never supply executable code. The registry maps each type
 * to a registered worker function — nothing else can be executed.
 *
 * No additional types are invented. New task types require an approved canonical
 * specification change.
 */

export const TaskType = Object.freeze({
  /** Generic background job — the base type from the JobQueueContract */
  BACKGROUND_JOB: 'BACKGROUND_JOB',
  /** Reacts to a canonical DomainEvent from another engine */
  EVENT_TRIGGER: 'EVENT_TRIGGER',
  /** A step within a sequential worker pipeline */
  PIPELINE_STEP: 'PIPELINE_STEP',
  /** A time-scheduled recurring or one-shot job */
  SCHEDULED_JOB: 'SCHEDULED_JOB',
  /** Operational notification dispatch (uses Integration Engine connector ref) */
  NOTIFICATION_JOB: 'NOTIFICATION_JOB',
  /** Invokes an approved external connector via Integration Engine contract */
  INTEGRATION_JOB: 'INTEGRATION_JOB'
});

export function isValidTaskType(type) {
  return Object.values(TaskType).includes(type);
}

export function normalizeTaskType(type) {
  const normalized = String(type ?? '').trim().toUpperCase();
  if (!isValidTaskType(normalized)) {
    throw new Error(
      `Invalid task type: "${type}". Supported types: ${Object.values(TaskType).join(', ')}.`
    );
  }
  return normalized;
}
