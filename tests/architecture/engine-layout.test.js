import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CanonicalEngineRegistry } from '../../architecture/engine-registry/CanonicalEngineRegistry.js';

const enginesDirectory = path.resolve('engines');

test('every canonical engine has exactly one public, canon-owned lifecycle entrypoint', async () => {
  const registry = new CanonicalEngineRegistry();
  const definitions = registry.getAllEngines();
  const directoryNames = fs.readdirSync(enginesDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  assert.deepEqual(directoryNames, definitions.map(({ slug }) => slug).sort());

  for (const definition of definitions) {
    const entrypoint = path.join(enginesDirectory, definition.slug, 'index.js');
    assert.equal(fs.existsSync(entrypoint), true, `${definition.slug} must expose index.js`);

    const engineModule = await import(pathToFileURL(entrypoint).href);
    assert.equal(engineModule.ENGINE_ID, definition.id);
    assert.equal(engineModule.ENGINE_NAME, definition.name);
    assert.equal(engineModule.default.engineId, definition.id);
    assert.equal(engineModule.default.engineName, definition.name);
    for (const hook of ['initialize', 'healthCheck', 'shutdown']) {
      assert.equal(typeof engineModule.default[hook], 'function', `${definition.slug} must implement ${hook}()`);
    }
  }
});
