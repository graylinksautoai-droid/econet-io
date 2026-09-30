/**
 * Canonical Persistence Configuration
 *
 * Reads CANONICAL_PERSISTENCE from the environment and validates it at
 * import time. Every component that needs to choose between in-memory and
 * MongoDB adapters imports this module instead of reading process.env directly.
 *
 * Valid values:
 *   memory  — in-memory repositories (local development, CI, testing)
 *   mongo   — MongoDB-backed repositories (production)
 *
 * Rules enforced here:
 *  - If the value is anything other than 'memory' or 'mongo', startup fails
 *    with a clear error.
 *  - If CANONICAL_PERSISTENCE=mongo but no MongoDB URI is available, this
 *    module throws immediately so the process cannot start silently broken.
 *  - In-memory mode never requires a MongoDB URI.
 *  - Production (mongo mode) NEVER silently falls back to in-memory.
 */

export const PERSISTENCE_MEMORY = 'memory';
export const PERSISTENCE_MONGO  = 'mongo';

const raw = (process.env.CANONICAL_PERSISTENCE ?? PERSISTENCE_MEMORY).trim().toLowerCase();

if (raw !== PERSISTENCE_MEMORY && raw !== PERSISTENCE_MONGO) {
  throw new Error(
    `[canonical] CANONICAL_PERSISTENCE must be "memory" or "mongo"; received "${raw}". ` +
    `Set CANONICAL_PERSISTENCE=memory for local development or CANONICAL_PERSISTENCE=mongo for production.`
  );
}

export const CANONICAL_PERSISTENCE = raw;
export const IS_MONGO  = raw === PERSISTENCE_MONGO;
export const IS_MEMORY = raw === PERSISTENCE_MEMORY;

// Resolve MongoDB URI — accepts either CANONICAL_MONGODB_URI (preferred,
// keeps canonical config separate from legacy) or MONGODB_URI (shared with
// the legacy Mongoose connection when running on the same Atlas cluster).
const resolvedUri = process.env.CANONICAL_MONGODB_URI || process.env.MONGODB_URI || null;

// Hard failure when mongo mode is selected without a URI.
// This must never silently degrade to in-memory.
if (IS_MONGO && !resolvedUri) {
  throw new Error(
    '[canonical] CANONICAL_PERSISTENCE=mongo requires either CANONICAL_MONGODB_URI ' +
    'or MONGODB_URI to be set in the environment. ' +
    'Do not set CANONICAL_PERSISTENCE=mongo without a database URI — ' +
    'this would silently lose all canonical data.'
  );
}

export const CANONICAL_MONGODB_URI = resolvedUri;

/**
 * Human-readable description of the active persistence mode.
 * Used in startup log messages. Credentials are redacted.
 */
export function persistenceDescription() {
  if (IS_MONGO) {
    // Redact credentials from log output — show only the host/database portion.
    const safe = CANONICAL_MONGODB_URI.replace(/:\/\/[^@]+@/, '://<credentials>@');
    return `mongo (${safe})`;
  }
  return 'memory (ephemeral — state lost on restart)';
}
