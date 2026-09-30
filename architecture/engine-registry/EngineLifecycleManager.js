/**
 * EcoNet IO Engine Lifecycle Manager
 * Manages the lifecycle, health checks, and state transitions of all 24 Canonical Engines.
 */

import { canonicalRegistry, EngineStatus } from './CanonicalEngineRegistry.js';

export class EngineLifecycleManager {
  #instances = new Map();

  constructor(registry = canonicalRegistry) {
    this._registry = registry;
  }

  /**
   * Register a concrete engine instance.
   * @param {string} engineId - 2-digit canonical ID (e.g. '01')
   * @param {Object} instance - The engine module instance
   */
  registerInstance(engineId, instance) {
    const def = this._registry.getEngineById(engineId);
    if (!def) {
      throw new Error(`Cannot bind instance: Engine ID "${engineId}" does not exist in Canonical Registry.`);
    }
    if (!instance || typeof instance !== 'object') {
      throw new Error(`Cannot bind instance: Engine "${engineId}" must be an object.`);
    }
    for (const hook of ['initialize', 'healthCheck', 'shutdown']) {
      if (typeof instance[hook] !== 'function') {
        throw new Error(`Cannot bind instance: Engine "${engineId}" must implement ${hook}().`);
      }
    }
    if (instance.engineId !== def.id || instance.engineName !== def.name) {
      throw new Error(
        `Cannot bind instance: Engine "${engineId}" identity does not match canonical definition "${def.name}".`
      );
    }
    if (this.#instances.has(def.id)) {
      throw new Error(`Cannot bind instance: Engine "${def.id}" already has a registered instance.`);
    }

    this.#instances.set(def.id, instance);
    if (this._registry.getStatus(def.id) === EngineStatus.STOPPED) {
      this._registry.setStatus(def.id, EngineStatus.REGISTERED);
    }
  }

  /**
   * Get an engine instance by ID.
   * @param {string} engineId
   * @returns {Object|null}
   */
  getInstance(engineId) {
    const def = this._registry.getEngineById(engineId);
    return def ? this.#instances.get(def.id) || null : null;
  }

  /**
   * Initialize all registered engine instances.
   */
  async initializeAll() {
    const results = {};
    for (const engine of this._registry.getAllEngines()) {
      const id = engine.id;
      const instance = this.#instances.get(id);
      if (!instance) {
        results[id] = { status: this._registry.getStatus(id), name: engine.name };
        continue;
      }

      try {
        const currentStatus = this._registry.getStatus(id);
        if (currentStatus === EngineStatus.READY) {
          results[id] = { status: EngineStatus.READY, name: engine.name };
          continue;
        }
        if (currentStatus === EngineStatus.STOPPED) {
          this._registry.setStatus(id, EngineStatus.REGISTERED);
        }
        if (typeof instance.initialize === 'function') {
          await instance.initialize();
        }
        this._registry.setStatus(id, EngineStatus.INITIALIZED);
        this._registry.setStatus(id, EngineStatus.READY);
        results[id] = { status: EngineStatus.READY, name: engine.name };
      } catch (err) {
        this._registry.setStatus(id, EngineStatus.DEGRADED);
        results[id] = { status: EngineStatus.DEGRADED, error: err.message, name: engine.name };
      }
    }
    return results;
  }

  /**
   * Run health checks on all engines.
   */
  async checkHealth() {
    const healthReport = {
      systemStatus: 'HEALTHY',
      timestamp: new Date().toISOString(),
      engines: {}
    };

    let hasDegraded = false;

    for (const engine of this._registry.getAllEngines()) {
      const id = engine.id;
      const instance = this.#instances.get(id);
      const currentStatus = this._registry.getStatus(id);

      let checkHealthy = true;
      let isHealthy = currentStatus === EngineStatus.READY;
      let details = null;

      if (currentStatus !== EngineStatus.STOPPED && instance && typeof instance.healthCheck === 'function') {
        try {
          const check = await instance.healthCheck();
          checkHealthy = check.healthy !== false;
          details = check.details || null;
        } catch (err) {
          checkHealthy = false;
          details = { error: err.message };
        }
      }

      if (currentStatus === EngineStatus.DEGRADED && checkHealthy) {
        this._registry.setStatus(id, EngineStatus.READY);
        isHealthy = true;
      } else if (currentStatus === EngineStatus.READY) {
        isHealthy = checkHealthy;
      }
      if (!isHealthy && currentStatus !== EngineStatus.STOPPED) {
        if (currentStatus !== EngineStatus.DEGRADED) {
          this._registry.setStatus(id, EngineStatus.DEGRADED);
        }
        hasDegraded = true;
      }

      const status = this._registry.getStatus(id);

      healthReport.engines[id] = {
        name: engine.name,
        layer: engine.layer,
        status,
        details
      };
    }

    if (hasDegraded) {
      healthReport.systemStatus = 'DEGRADED';
    }

    return healthReport;
  }

  /**
   * Gracefully stop all engines.
   */
  async shutdownAll() {
    for (const engine of this._registry.getAllEngines()) {
      const id = engine.id;
      const instance = this.#instances.get(id);
      if (instance && typeof instance.shutdown === 'function') {
        try {
          await instance.shutdown();
        } catch {
          // Log shutdown failure but continue
        }
      }
      this._registry.setStatus(id, EngineStatus.STOPPED);
    }
  }
}

export const lifecycleManager = new EngineLifecycleManager();
