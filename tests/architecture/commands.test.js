import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../contracts/commands/Command.js';

const commandInput = (overrides = {}) => ({
  commandType: 'SubmitObservation',
  targetEngine: '02-observation',
  payload: { reportId: 'report-1', media: [{ id: 'media-1' }] },
  actor: { actorId: 'actor-1', roles: ['observer'] },
  idempotencyKey: 'submit-report-1',
  ...overrides
});

test('Command has immutable canonical routing and trace metadata', () => {
  const input = commandInput();
  const command = new Command(input);

  assert.match(command.commandId, /^cmd_[0-9a-f]{32}$/);
  assert.match(command.correlationId, /^cor_[0-9a-f]{32}$/);
  assert.equal(command.targetEngine, '02-observation');
  assert.equal(command.idempotencyKey, 'submit-report-1');
  assert.ok(Object.isFrozen(command));
  assert.ok(Object.isFrozen(command.payload.media));
  assert.deepEqual(Object.keys(command.toJSON()), [
    'commandId', 'commandType', 'targetEngine', 'issuedAt', 'actor',
    'idempotencyKey', 'correlationId', 'payload'
  ]);

  input.payload.media[0].id = 'tampered';
  assert.equal(command.payload.media[0].id, 'media-1');
});

test('Command rejects non-canonical targets and malformed metadata', () => {
  assert.throws(() => new Command(commandInput({ targetEngine: '25-unknown' })), /canonical engine slug/);
  assert.throws(() => new Command(commandInput({ targetEngine: '02-OBSERVATION' })), /canonical engine slug/);
  assert.throws(() => new Command(commandInput({ commandType: ' ' })), /commandType/);
  assert.throws(() => new Command(commandInput({ payload: [] })), /payload/);
  assert.throws(() => new Command(commandInput({ actor: 'actor-1' })), /actor/);
  assert.throws(() => new Command(commandInput({ idempotencyKey: ' ' })), /idempotencyKey/);
  assert.throws(() => new Command(commandInput({ issuedAt: 'not-a-date' })), /issuedAt/);
});
