/**
 * EcoNet IO Canonical Command Bus
 * Routes imperative commands to their single authoritative engine handler.
 */

import { Command } from '../../contracts/commands/Command.js';

export class CommandBus {
  constructor() {
    this._handlers = new Map(); // commandType -> { handler, targetEngine }
    this._middlewares = []; // Array of middleware functions (command, next) => result
  }

  /**
   * Register the single authoritative handler for a command type.
   * @param {string} commandType - e.g. 'RegisterActor'
   * @param {Function} handler - Async function(command) => result
   * @param {string} targetEngine - e.g. '01-identity'
   */
  registerHandler(commandType, handler, targetEngine) {
    if (!commandType || typeof commandType !== 'string') {
      throw new Error('CommandBus requires a valid string commandType.');
    }
    if (typeof handler !== 'function') {
      throw new Error('CommandBus handler must be a function.');
    }
    if (this._handlers.has(commandType)) {
      const existing = this._handlers.get(commandType);
      throw new Error(`Handler conflict: Command "${commandType}" is already registered by Engine "${existing.targetEngine}". Each command must have exactly one handler.`);
    }

    this._handlers.set(commandType, { handler, targetEngine });
  }

  /**
   * Add middleware to the command processing pipeline.
   * @param {Function} middleware - async (command, next) => result
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('CommandBus middleware must be a function.');
    }
    this._middlewares.push(middleware);
  }

  /**
   * Dispatch a Command through the middleware pipeline to its registered handler.
   * @param {Command|Object} command
   * @returns {Promise<any>}
   */
  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);

    const handlerEntry = this._handlers.get(cmd.commandType);
    if (!handlerEntry) {
      throw new Error(`No handler registered for command type: "${cmd.commandType}".`);
    }

    // Build the middleware chain
    let index = 0;
    const next = async (currentCmd) => {
      if (index < this._middlewares.length) {
        const middleware = this._middlewares[index++];
        return middleware(currentCmd, next);
      }
      return handlerEntry.handler(currentCmd);
    };

    return next(cmd);
  }

  /**
   * Check if a handler is registered for a command type.
   * @param {string} commandType
   * @returns {boolean}
   */
  hasHandler(commandType) {
    return this._handlers.has(commandType);
  }

  /**
   * Clear all registered handlers (for testing).
   */
  clear() {
    this._handlers.clear();
    this._middlewares = [];
  }
}

// Global Singleton Instance
export const globalCommandBus = new CommandBus();
