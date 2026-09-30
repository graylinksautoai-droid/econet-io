/**
 * EcoNet IO Canonical Query Bus
 * Routes side-effect-free data queries to their authoritative engine query handler.
 */

import { Query } from '../../contracts/queries/Query.js';

export class QueryBus {
  constructor() {
    this._handlers = new Map(); // queryType -> { handler, targetEngine }
    this._middlewares = [];
  }

  /**
   * Register the single authoritative handler for a query type.
   * @param {string} queryType - e.g. 'GetActorById'
   * @param {Function} handler - Async function(query) => result
   * @param {string} targetEngine - e.g. '01-identity'
   */
  registerHandler(queryType, handler, targetEngine) {
    if (!queryType || typeof queryType !== 'string') {
      throw new Error('QueryBus requires a valid string queryType.');
    }
    if (typeof handler !== 'function') {
      throw new Error('QueryBus handler must be a function.');
    }
    if (this._handlers.has(queryType)) {
      const existing = this._handlers.get(queryType);
      throw new Error(`Handler conflict: Query "${queryType}" is already registered by Engine "${existing.targetEngine}". Each query must have exactly one handler.`);
    }

    this._handlers.set(queryType, { handler, targetEngine });
  }

  /**
   * Add middleware to the query processing pipeline.
   * @param {Function} middleware - async (query, next) => result
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('QueryBus middleware must be a function.');
    }
    this._middlewares.push(middleware);
  }

  /**
   * Execute a Query through the middleware pipeline.
   * @param {Query|Object} query
   * @returns {Promise<any>}
   */
  async execute(query) {
    const qry = query instanceof Query ? query : new Query(query);

    const handlerEntry = this._handlers.get(qry.queryType);
    if (!handlerEntry) {
      throw new Error(`No handler registered for query type: "${qry.queryType}".`);
    }

    let index = 0;
    const next = async (currentQry) => {
      if (index < this._middlewares.length) {
        const middleware = this._middlewares[index++];
        return middleware(currentQry, next);
      }
      return handlerEntry.handler(currentQry);
    };

    return next(qry);
  }

  /**
   * Check if a handler is registered for a query type.
   * @param {string} queryType
   * @returns {boolean}
   */
  hasHandler(queryType) {
    return this._handlers.has(queryType);
  }

  /**
   * Clear all registered query handlers (for testing).
   */
  clear() {
    this._handlers.clear();
    this._middlewares = [];
  }
}

// Global Singleton Instance
export const globalQueryBus = new QueryBus();
