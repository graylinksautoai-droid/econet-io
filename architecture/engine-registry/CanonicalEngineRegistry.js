/**
 * EcoNet IO Canonical Engine Registry
 * Authority: EcoNet IO 24-Engine Canon (Revision 2026.4.0-CANONICAL)
 * 
 * Strict Invariants:
 * - Immutable registry of all 24 Canonical Engines (01 to 24).
 * - No engine may be added, renamed, merged, or removed.
 * - Engine IDs are two-digit strings ("01" through "24").
 */

export const EngineLayer = Object.freeze({
  INTERACTION: 'INTERACTION',
  SENSING_AND_CONTEXT: 'SENSING_AND_CONTEXT',
  ANALYTICAL_AND_PREDICTIVE: 'ANALYTICAL_AND_PREDICTIVE',
  INTEGRITY_AND_INCENTIVE: 'INTEGRITY_AND_INCENTIVE',
  OPERATIONAL_AND_INTEGRATION: 'OPERATIONAL_AND_INTEGRATION'
});

export const EngineStatus = Object.freeze({
  REGISTERED: 'REGISTERED',
  INITIALIZED: 'INITIALIZED',
  READY: 'READY',
  DEGRADED: 'DEGRADED',
  STOPPED: 'STOPPED'
});

const CANONICAL_ID_PATTERN = /^(?:0[1-9]|1\d|2[0-4])$/;

const VALID_STATUS_TRANSITIONS = Object.freeze({
  [EngineStatus.REGISTERED]: new Set([
    EngineStatus.INITIALIZED,
    EngineStatus.DEGRADED,
    EngineStatus.STOPPED
  ]),
  [EngineStatus.INITIALIZED]: new Set([
    EngineStatus.READY,
    EngineStatus.DEGRADED,
    EngineStatus.STOPPED
  ]),
  [EngineStatus.READY]: new Set([
    EngineStatus.DEGRADED,
    EngineStatus.STOPPED
  ]),
  [EngineStatus.DEGRADED]: new Set([
    EngineStatus.INITIALIZED,
    EngineStatus.READY,
    EngineStatus.STOPPED
  ]),
  [EngineStatus.STOPPED]: new Set([EngineStatus.REGISTERED])
});

/**
 * The permanent canonical definition list for all 24 engines.
 */
const CANONICAL_DEFINITIONS = Object.freeze([
  {
    id: '01',
    name: 'Identity Engine',
    slug: '01-identity',
    layer: EngineLayer.INTERACTION,
    description: 'Actor identity, cryptographic credentials, profiles, sessions, and security roles.'
  },
  {
    id: '02',
    name: 'Observation Engine',
    slug: '02-observation',
    layer: EngineLayer.SENSING_AND_CONTEXT,
    description: 'Ingestion, normalization, and lifecycle of raw environmental observations and media evidence.'
  },
  {
    id: '03',
    name: 'Knowledge Engine',
    slug: '03-knowledge',
    layer: EngineLayer.SENSING_AND_CONTEXT,
    description: 'Authoritative environmental domain ontologies, agency registries, taxonomic catalogs, and knowledge graphs.'
  },
  {
    id: '04',
    name: 'Dialogue Engine',
    slug: '04-dialogue',
    layer: EngineLayer.INTERACTION,
    description: 'Conversational interaction management, contextual dialogue sessions, and prompt grounding.'
  },
  {
    id: '05',
    name: 'Intelligence Engine',
    slug: '05-intelligence',
    layer: EngineLayer.ANALYTICAL_AND_PREDICTIVE,
    description: 'Deterministic heuristics, classification pipelines, feature extraction, and LLM inference orchestration.'
  },
  {
    id: '06',
    name: 'Context Engine',
    slug: '06-context',
    layer: EngineLayer.SENSING_AND_CONTEXT,
    description: 'Dynamic environmental situational context, localized conditions, regional baselines, and environmental state fusion.'
  },
  {
    id: '07',
    name: 'Geospatial Engine',
    slug: '07-geospatial',
    layer: EngineLayer.SENSING_AND_CONTEXT,
    description: 'Coordinates, spatial indexing, geometries, geofences, topology, and spatial relationship queries.'
  },
  {
    id: '08',
    name: 'Temporal Engine',
    slug: '08-temporal',
    layer: EngineLayer.SENSING_AND_CONTEXT,
    description: 'Time-series ingestion, interval analysis, temporal decay windows, scheduling metadata, and event timelines.'
  },
  {
    id: '09',
    name: 'Risk Engine',
    slug: '09-risk',
    layer: EngineLayer.ANALYTICAL_AND_PREDICTIVE,
    description: 'Multi-hazard risk evaluation, severity indexing, exposure assessment, and vulnerability modeling.'
  },
  {
    id: '10',
    name: 'Prediction Engine',
    slug: '10-prediction',
    layer: EngineLayer.ANALYTICAL_AND_PREDICTIVE,
    description: 'Environmental trend forecasting, hazard probability modeling, and early warning trajectories.'
  },
  {
    id: '11',
    name: 'Mission Engine',
    slug: '11-mission',
    layer: EngineLayer.OPERATIONAL_AND_INTEGRATION,
    description: 'Operational response task creation, field responder allocation, mission tracking, and operational lifecycle.'
  },
  {
    id: '12',
    name: 'Action Engine',
    slug: '12-action',
    layer: EngineLayer.OPERATIONAL_AND_INTEGRATION,
    description: 'External authority dispatch, notification routing, webhook delivery, and actuator triggers.'
  },
  {
    id: '13',
    name: 'Verification Engine',
    slug: '13-verification',
    layer: EngineLayer.INTEGRITY_AND_INCENTIVE,
    description: 'Multi-source credibility scoring, consensus voting, peer validation, and ground-truth confirmation.'
  },
  {
    id: '14',
    name: 'Reputation Engine',
    slug: '14-reputation',
    layer: EngineLayer.INTEGRITY_AND_INCENTIVE,
    description: 'Actor trust scoring, credibility decay, standing tiers, and contribution weighting.'
  },
  {
    id: '15',
    name: 'Reward Engine',
    slug: '15-reward',
    layer: EngineLayer.INTEGRITY_AND_INCENTIVE,
    description: 'Ecosystem incentives, point accounting, token balances, and double-entry reward distribution.'
  },
  {
    id: '16',
    name: 'Community Engine',
    slug: '16-community',
    layer: EngineLayer.INTERACTION,
    description: 'Social graph connections, peer interactions, comments, social feeds, and community groups.'
  },
  {
    id: '17',
    name: 'Agent Engine',
    slug: '17-agent',
    layer: EngineLayer.INTERACTION,
    description: 'Autonomous agent role specifications, execution constraints, tool contracts, and agent behaviors.'
  },
  {
    id: '18',
    name: 'Digital Twin Engine',
    slug: '18-digital-twin',
    layer: EngineLayer.ANALYTICAL_AND_PREDICTIVE,
    description: 'Environmental state virtualization, digital asset models, and sensor twin state replicas.'
  },
  {
    id: '19',
    name: 'Simulation Engine',
    slug: '19-simulation',
    layer: EngineLayer.ANALYTICAL_AND_PREDICTIVE,
    description: 'Disaster scenario modeling, atmospheric dispersion simulation, and what-if impact analysis.'
  },
  {
    id: '20',
    name: 'Integration Engine',
    slug: '20-integration',
    layer: EngineLayer.OPERATIONAL_AND_INTEGRATION,
    description: 'External connector management, 3rd-party satellite/weather API adaptors, and protocol gateways.'
  },
  {
    id: '21',
    name: 'Automation Engine',
    slug: '21-automation',
    layer: EngineLayer.OPERATIONAL_AND_INTEGRATION,
    description: 'Backend execution queues, background job processing, event triggers, and worker pipelines.'
  },
  {
    id: '22',
    name: 'Governance Engine',
    slug: '22-governance',
    layer: EngineLayer.INTEGRITY_AND_INCENTIVE,
    description: 'System policies, operational constraints, compliance checks, and decentralized rule enforcement.'
  },
  {
    id: '23',
    name: 'Audit Engine',
    slug: '23-audit',
    layer: EngineLayer.INTEGRITY_AND_INCENTIVE,
    description: 'Immutable event journals, operational audit trails, compliance logs, and verification history.'
  },
  {
    id: '24',
    name: 'Learning Engine',
    slug: '24-learning',
    layer: EngineLayer.ANALYTICAL_AND_PREDICTIVE,
    description: 'Historical outcome feedback loops, accuracy evaluation, and model adaptation tracking.'
  }
]);

export class CanonicalEngineRegistry {
  #entries = new Map();
  #statusMap = new Map();

  constructor() {
    this._initialize();
  }

  _initialize() {
    for (const def of CANONICAL_DEFINITIONS) {
      this.#entries.set(def.id, Object.freeze({ ...def }));
      this.#statusMap.set(def.id, EngineStatus.REGISTERED);
    }
  }

  /**
   * Returns all 24 canonical engine definitions.
   * @returns {Array<Object>}
   */
  getAllEngines() {
    return Object.freeze(Array.from(this.#entries.values()));
  }

  /**
   * Returns the count of registered engines (always 24).
   * @returns {number}
   */
  get totalEngines() {
    return this.#entries.size;
  }

  /**
   * Look up an engine by 2-digit ID string (e.g. '01', '14').
   * @param {string} id
   * @returns {Object|null}
   */
  getEngineById(id) {
    if (!CANONICAL_ID_PATTERN.test(id)) return null;
    return this.#entries.get(id) || null;
  }

  /**
   * Look up an engine by its canonical name (e.g. 'Identity Engine').
   * @param {string} name
   * @returns {Object|null}
   */
  getEngineByName(name) {
    if (typeof name !== 'string') return null;
    const normalized = name.trim().toLowerCase();
    for (const engine of this.#entries.values()) {
      if (engine.name.toLowerCase() === normalized) {
        return engine;
      }
    }
    return null;
  }

  /**
   * Look up an engine by its directory slug (e.g. '01-identity').
   * @param {string} slug
   * @returns {Object|null}
   */
  getEngineBySlug(slug) {
    if (typeof slug !== 'string') return null;
    const normalized = slug.trim().toLowerCase();
    for (const engine of this.#entries.values()) {
      if (engine.slug.toLowerCase() === normalized) {
        return engine;
      }
    }
    return null;
  }

  /**
   * Get all engines belonging to a specific architectural layer.
   * @param {string} layer
   * @returns {Array<Object>}
   */
  getEnginesByLayer(layer) {
    return this.getAllEngines().filter(e => e.layer === layer);
  }

  /**
   * Get current operational status for an engine.
   * @param {string} id
   * @returns {string}
   */
  getStatus(id) {
    if (!CANONICAL_ID_PATTERN.test(id)) return null;
    return this.#statusMap.get(id) || null;
  }

  /**
   * Update the operational status of an engine.
   * @param {string} id
   * @param {string} status
   */
  setStatus(id, status) {
    if (!CANONICAL_ID_PATTERN.test(id) || !this.#entries.has(id)) {
      throw new Error(`Cannot update status: Engine ID "${id}" is not in the Canonical Registry.`);
    }
    if (!Object.values(EngineStatus).includes(status)) {
      throw new Error(`Invalid EngineStatus: "${status}".`);
    }

    const currentStatus = this.#statusMap.get(id);
    if (currentStatus === status) return;

    if (!VALID_STATUS_TRANSITIONS[currentStatus].has(status)) {
      throw new Error(
        `Invalid lifecycle transition for Engine "${id}": ${currentStatus} -> ${status}.`
      );
    }

    this.#statusMap.set(id, status);
  }

  /**
   * Validates that an engine candidate adheres strictly to canonical identity.
   * @param {string} id
   * @param {string} name
   * @returns {boolean}
   */
  isCanonical(id, name) {
    const engine = this.getEngineById(id);
    if (!engine || typeof name !== 'string') return false;
    return engine.name.toLowerCase() === name.trim().toLowerCase();
  }
}

// Global Singleton Instance
export const canonicalRegistry = new CanonicalEngineRegistry();
