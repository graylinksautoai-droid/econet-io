import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BoundaryEnforcer } from '../../architecture/compliance/BoundaryEnforcer.js';

const workspaceEngines = path.resolve('engines');

const withFixture = async (files, run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'econet-boundary-'));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
    }
    await run(new BoundaryEnforcer(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('the current engine source contains no private cross-engine imports', () => {
  const violations = new BoundaryEnforcer(workspaceEngines).checkBoundaries();
  assert.deepEqual(violations, []);
});

test('boundary enforcement rejects private static, dynamic, and alias imports across engines', async () => {
  await withFixture({
    '01-identity/service.js': "import { model } from '../02-observation/domain/model.js';",
    '01-identity/multiline.ts': "import {\n  model\n} from\n  '../02-observation/persistence/repository.ts';",
    '01-identity/dynamic.mjs': "const module = await import('../02-observation/contracts/events.mjs');",
    '01-identity/alias.tsx': "const store = require('engines/02-observation/persistence/store.js');"
  }, async (enforcer) => {
    const violations = enforcer.checkBoundaries();
    assert.equal(violations.length, 4);
    assert.deepEqual(violations.map(({ file }) => file.replaceAll(path.sep, '/')).sort(), [
      '01-identity/alias.tsx',
      '01-identity/dynamic.mjs',
      '01-identity/multiline.ts',
      '01-identity/service.js'
    ]);
    assert.ok(violations.every(({ violation }) => violation.includes('Illegal cross-engine internal import')));
  });
});

test('boundary enforcement permits only another engine public entrypoint', async () => {
  await withFixture({
    '01-identity/public.js': [
      "import observation from '../02-observation';",
      "import typedObservation from '../02-observation/index.ts';",
      "const dynamicObservation = await import('engines/02-observation/index.js');",
      "// import privateModel from '../02-observation/domain/model.js';"
    ].join('\n')
  }, async (enforcer) => {
    assert.deepEqual(enforcer.checkBoundaries(), []);
  });
});
