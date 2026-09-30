import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  RiskEngine,
  RiskApplicationService,
  InMemoryRiskRepository,
  RiskAssessment,
  RiskAssessmentStatus,
  RiskLevel,
  HazardType,
  calculateRiskScore,
  riskLevelFromScore,
  isThresholdBreached,
  isRiskEscalation,
  isRiskDeescalation,
  canTransitionRiskStatus,
  clampRiskScore,
  GLOBAL_THRESHOLD_KEY,
  DEFAULT_MINIMUM_LEVEL_BY_HAZARD,
  RISK_ASSESSMENT_EVALUATED
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '09-risk',
  payload,
  actor: actor || { actorId: 'risk-analyst-7', roles: ['analyst'] },
  idempotencyKey: `rsk-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryRiskRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new RiskEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-07-01T09:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const sampleFactors = (magnitude = 1, name = 'rainfallIntensity') => ([
  { name, magnitude, weight: 1 }
]);

const engineDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Engine 09 exposes the canonical-plan-required ownership documentation', () => {
  const readmePath = path.join(engineDirectory, 'README.md');

  assert.equal(fs.existsSync(readmePath), true, 'Engine 09 must retain its canonical ownership README.');

  const readme = fs.readFileSync(readmePath, 'utf8');

  assert.match(readme, /## Canonical ownership/);
  assert.match(readme, /Engine 22 Governance/);
  assert.match(readme, /Engine 23 Audit/);
  assert.match(readme, /Canonical event vocabulary status/);
  assert.match(readme, /Decision pending\./);
  assert.match(readme, /econet\.risk\.evaluated/);
});

test('calculateRiskScore applies the deterministic weighted hazard formula', () => {
  // FLOOD weight 1.0, full intensity, full exposure => 100
  assert.equal(calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }), 100);

  // FLOOD: 100 * 1.0 * 0.5 * (0.5 + 0.25) = 37.5 => 38
  assert.equal(calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(0.5),
    exposureIndex: 0.5
  }), 38);

  // OTHER weight 0.5, full intensity, full exposure => 50
  assert.equal(calculateRiskScore({
    hazardType: HazardType.OTHER,
    factors: sampleFactors(1),
    exposureIndex: 1
  }), 50);

  // Equal-weight averaging of two factors => intensity 0.5
  assert.equal(calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: [
      { name: 'a', magnitude: 1, weight: 1 },
      { name: 'b', magnitude: 0, weight: 1 }
    ],
    exposureIndex: 1
  }), 50);

  // Weighted averaging: (0.5*3 + 1.0*1) / 4 = 0.625 => 62.5 => 63
  assert.equal(calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: [
      { name: 'a', magnitude: 0.5, weight: 3 },
      { name: 'b', magnitude: 1.0, weight: 1 }
    ],
    exposureIndex: 1
  }), 63);
});

test('calculateRiskScore rejects malformed factor and exposure input', () => {
  assert.throws(() => calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: [],
    exposureIndex: 1
  }), /requires at least one hazard factor/);

  assert.throws(() => calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: [{ name: 'rainfall', magnitude: 1.4 }],
    exposureIndex: 1
  }), /Invalid factor magnitude/);

  assert.throws(() => calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: [{ name: 'rainfall', magnitude: 0.5, weight: 0 }],
    exposureIndex: 1
  }), /Invalid factor weight/);

  assert.throws(() => calculateRiskScore({
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(0.5),
    exposureIndex: 2
  }), /Invalid exposureIndex/);

  assert.throws(() => calculateRiskScore({
    hazardType: 'NUCLEAR_WINTER',
    factors: sampleFactors(0.5),
    exposureIndex: 1
  }), /Invalid hazard type/);
});

test('riskLevelFromScore maps canonical tier boundaries', () => {
  assert.equal(riskLevelFromScore(0), RiskLevel.LOW);
  assert.equal(riskLevelFromScore(19), RiskLevel.LOW);
  assert.equal(riskLevelFromScore(20), RiskLevel.MODERATE);
  assert.equal(riskLevelFromScore(39), RiskLevel.MODERATE);
  assert.equal(riskLevelFromScore(40), RiskLevel.HIGH);
  assert.equal(riskLevelFromScore(59), RiskLevel.HIGH);
  assert.equal(riskLevelFromScore(60), RiskLevel.SEVERE);
  assert.equal(riskLevelFromScore(79), RiskLevel.SEVERE);
  assert.equal(riskLevelFromScore(80), RiskLevel.CATASTROPHIC);
  assert.equal(riskLevelFromScore(100), RiskLevel.CATASTROPHIC);
  assert.throws(() => riskLevelFromScore(101), /Invalid risk score/);
  assert.throws(() => riskLevelFromScore(-1), /Invalid risk score/);
});

test('clampRiskScore and threshold comparison helpers behave canonically', () => {
  assert.equal(clampRiskScore(140), 100);
  assert.equal(clampRiskScore(-20), 0);
  assert.equal(clampRiskScore(37.5), 38);

  assert.equal(isThresholdBreached(RiskLevel.HIGH, RiskLevel.HIGH), true);
  assert.equal(isThresholdBreached(RiskLevel.SEVERE, RiskLevel.HIGH), true);
  assert.equal(isThresholdBreached(RiskLevel.MODERATE, RiskLevel.HIGH), false);
  assert.equal(isRiskEscalation(RiskLevel.LOW, RiskLevel.SEVERE), true);
  assert.equal(isRiskEscalation(RiskLevel.SEVERE, RiskLevel.LOW), false);
  assert.equal(isRiskDeescalation(RiskLevel.SEVERE, RiskLevel.LOW), true);
});

test('RiskAssessment entity validates required fields and boundaries', () => {
  assert.throws(() => new RiskAssessment({
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1)
  }), /requires a non-empty subjectId/);

  assert.throws(() => new RiskAssessment({
    subjectId: 'region-1',
    hazardType: 'VOLCANIC_ASH',
    factors: sampleFactors(1)
  }), /Invalid hazard type/);

  assert.throws(() => new RiskAssessment({
    subjectId: 'region-1',
    hazardType: HazardType.FLOOD,
    factors: []
  }), /requires at least one hazard factor/);

  assert.throws(() => new RiskAssessment({
    subjectId: 'region-1',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1.5
  }), /Invalid exposureIndex/);

  assert.throws(() => new RiskAssessment({
    subjectId: 'region-1',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    minimumLevel: 'EXTREME'
  }), /Invalid risk level/);

  assert.throws(() => new RiskAssessment({
    subjectId: 'region-1',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    status: 'ARCHIVED'
  }), /Unknown risk assessment status/);
});

test('RiskAssessment derives score, level, and breach state deterministically', () => {
  const critical = new RiskAssessment({
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  });
  assert.match(critical.assessmentId, /^rsk_[0-9a-f]{32}$/);
  assert.equal(critical.score, 100);
  assert.equal(critical.rawScore, 100);
  assert.equal(critical.riskLevel, RiskLevel.CATASTROPHIC);
  assert.equal(critical.minimumLevel, RiskLevel.HIGH);
  assert.equal(critical.thresholdBreached, true);
  assert.equal(critical.isCritical, true);
  assert.equal(critical.factorIntensity, 1);
  assert.equal(critical.status, RiskAssessmentStatus.ACTIVE);
  assert.equal(critical.mitigationReduction, 0);

  const benign = new RiskAssessment({
    subjectId: 'lagos-ikeja',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(0.1),
    exposureIndex: 0
  });
  assert.equal(benign.score, 5);
  assert.equal(benign.riskLevel, RiskLevel.LOW);
  assert.equal(benign.thresholdBreached, false);
  assert.equal(benign.isCritical, false);
});

test('RiskAssessment markMitigated and close enforce lifecycle transitions', () => {
  const assessment = new RiskAssessment({
    subjectId: 'region-1',
    hazardType: HazardType.STORM,
    factors: sampleFactors(0.4)
  });

  assert.equal(canTransitionRiskStatus(RiskAssessmentStatus.ACTIVE, RiskAssessmentStatus.MITIGATED), true);
  assert.equal(canTransitionRiskStatus(RiskAssessmentStatus.CLOSED, RiskAssessmentStatus.ACTIVE), false);

  const mitigated = assessment.markMitigated();
  assert.equal(mitigated.status, RiskAssessmentStatus.MITIGATED);

  const closed = mitigated.close('Season ended');
  assert.equal(closed.status, RiskAssessmentStatus.CLOSED);
  assert.equal(closed.closedReason, 'Season ended');

  // CLOSED is terminal
  assert.throws(() => closed.markMitigated(), /Invalid risk assessment lifecycle transition/);
  assert.throws(() => closed.close(), /Invalid risk assessment lifecycle transition/);
  assert.throws(() => closed.reassess(), /Cannot reassess a CLOSED risk assessment/);
  assert.throws(() => closed.addMitigation({ action: 'x' }), /Cannot add mitigation to a CLOSED risk assessment/);

  // ACTIVE -> ACTIVE is not a legal transition
  assert.throws(() => assessment.markMitigated().markMitigated(), /Invalid risk assessment lifecycle transition/);
});

test('RiskAssessment mitigation tracking reduces score and de-escalates level', () => {
  const assessment = new RiskAssessment({
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  });
  assert.equal(assessment.score, 100);
  assert.equal(assessment.riskLevel, RiskLevel.CATASTROPHIC);

  const half = assessment.addMitigation({
    action: 'Emergency drainage activation',
    appliedBy: 'civil-defence-1',
    effectiveness: 0.5
  });
  assert.equal(half.score, 50);
  assert.equal(half.rawScore, 100);
  assert.equal(half.mitigationReduction, 0.5);
  assert.equal(half.riskLevel, RiskLevel.HIGH);
  assert.equal(half.mitigations.length, 1);
  assert.equal(half.mitigations[0].action, 'Emergency drainage activation');
  assert.equal(half.mitigations[0].appliedBy, 'civil-defence-1');
  assert.equal(half.isEscalationFrom(RiskLevel.CATASTROPHIC), false);

  const fully = half.addMitigation({ action: 'Full evacuation', effectiveness: 0.5 });
  assert.equal(fully.mitigationReduction, 1);
  assert.equal(fully.score, 0);
  assert.equal(fully.riskLevel, RiskLevel.LOW);
  assert.equal(fully.thresholdBreached, false);

  // Cumulative reduction never exceeds 100%
  const over = fully.addMitigation({ action: 'Extra sandbags', effectiveness: 0.9 });
  assert.equal(over.mitigationReduction, 1);
  assert.equal(over.score, 0);

  assert.throws(() => assessment.addMitigation({ action: '', effectiveness: 0.1 }), /non-empty action/);
  assert.throws(() => assessment.addMitigation({ action: 'bad', effectiveness: 1.4 }), /Invalid mitigation effectiveness/);
});

test('RiskAssessment reassess re-evaluates factors and withThreshold retunes breach state', () => {
  const assessment = new RiskAssessment({
    subjectId: 'region-1',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(0.3),
    exposureIndex: 0.5
  });
  assert.equal(assessment.score, 23);
  assert.equal(assessment.riskLevel, RiskLevel.MODERATE);
  assert.equal(assessment.thresholdBreached, false);

  const escalated = assessment.reassess({
    factors: sampleFactors(0.95),
    exposureIndex: 1,
    metadata: { source: 'observation-batch-7' }
  });
  assert.equal(escalated.score, 95);
  assert.equal(escalated.riskLevel, RiskLevel.CATASTROPHIC);
  assert.equal(escalated.assessmentId, assessment.assessmentId);
  assert.equal(escalated.metadata.source, 'observation-batch-7');
  assert.equal(escalated.isEscalationFrom(assessment.riskLevel), true);

  // Lowering the minimum level makes the same score count as a breach
  const retuned = escalated.withThreshold(RiskLevel.SEVERE);
  assert.equal(retuned.minimumLevel, RiskLevel.SEVERE);
  assert.equal(retuned.thresholdBreached, true);
  assert.equal(retuned.score, escalated.score);

  // Same threshold is a no-op returning the identical instance
  assert.equal(retuned.withThreshold(RiskLevel.SEVERE), retuned);
  assert.throws(() => retuned.withThreshold('EXTREME'), /Invalid risk level/);
});

test('RiskAssessment toJSON exposes a complete immutable snapshot', () => {
  const assessment = new RiskAssessment({
    subjectId: 'region-1',
    hazardType: HazardType.WILDFIRE,
    factors: [{ name: 'vegetationDryness', magnitude: 0.8, weight: 2 }],
    exposureIndex: 0.4,
    minimumLevel: RiskLevel.MODERATE,
    metadata: { region: 'Cross River' }
  });

  const json = assessment.toJSON();
  assert.equal(json.subjectId, 'region-1');
  assert.equal(json.hazardType, HazardType.WILDFIRE);
  assert.equal(json.minimumLevel, RiskLevel.MODERATE);
  assert.equal(json.factors.length, 1);
  assert.equal(json.factors[0].name, 'vegetationDryness');
  assert.equal(typeof json.rawScore, 'number');
  assert.equal(typeof json.score, 'number');
  assert.equal(typeof json.riskLevel, 'string');
  assert.equal(typeof json.thresholdBreached, 'boolean');
  assert.equal(typeof json.isCritical, 'boolean');

  // Frozen aggregate cannot be mutated
  assert.equal(Object.isFrozen(assessment), true);
});

test('AssessRisk persists the assessment and emits a canonical evaluated event', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    subjectType: 'region',
    hazardType: HazardType.FLOOD,
    factors: [{ name: 'rainfallIntensity', magnitude: 0.95, weight: 1 }],
    exposureIndex: 0.9,
    metadata: { source: 'context-engine-06' }
  }, 'assess-1'));

  assert.match(res.assessment.assessmentId, /^rsk_[0-9a-f]{32}$/);
  assert.equal(res.assessment.subjectId, 'anambra-ihiala');
  assert.equal(res.assessment.hazardType, HazardType.FLOOD);
  assert.equal(res.assessment.score, 90);
  assert.equal(res.assessment.riskLevel, RiskLevel.CATASTROPHIC);
  // Canonical default threshold for FLOOD is HIGH
  assert.equal(res.assessment.minimumLevel, RiskLevel.HIGH);
  assert.equal(res.thresholdBreached, true);
  assert.equal(await repository.count(), 1);

  const evaluated = eventBus.getHistory({ eventType: RISK_ASSESSMENT_EVALUATED });
  assert.equal(evaluated.length, 1);
  assert.equal(evaluated[0].producer, 'engine.09.risk');
  assert.equal(evaluated[0].subject.entityId, res.assessment.assessmentId);
  assert.equal(evaluated[0].payload.reason, 'INITIAL_ASSESSMENT');
  assert.equal(evaluated[0].payload.score, 90);
  assert.equal(evaluated[0].payload.previousLevel, null);
  assert.equal(evaluated[0].payload.thresholdBreached, true);
  assert.equal(evaluated[0].metadata.audit.criticalMutation, true);
});

test('AssessRisk below threshold does not emit a breach event', async () => {
  const { engine, eventBus } = createFixture();

  const res = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'lagos-ikeja',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(0.2),
    exposureIndex: 0.2
  }, 'assess-low'));

  assert.equal(res.assessment.score, 12);
  assert.equal(res.assessment.riskLevel, RiskLevel.LOW);
  assert.equal(res.thresholdBreached, false);

  const events = eventBus.getHistory();
  assert.equal(events.filter(e => e.eventType === RISK_ASSESSMENT_EVALUATED).length, 1);
  assert.equal(events.filter(e => e.eventType === 'econet.risk.threshold_breached').length, 0);
});

test('AssessRisk breach emits threshold_breached carrying the escalation payload', async () => {
  const { engine, eventBus } = createFixture();

  const res = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'assess-breach'));

  const breachEvents = eventBus.getHistory({ eventType: 'econet.risk.threshold_breached' });
  assert.equal(breachEvents.length, 1);
  assert.equal(breachEvents[0].payload.assessmentId, res.assessment.assessmentId);
  assert.equal(breachEvents[0].payload.riskLevel, RiskLevel.CATASTROPHIC);
  assert.equal(breachEvents[0].payload.minimumLevel, RiskLevel.HIGH);
  assert.equal(breachEvents[0].payload.reason, 'INITIAL_ASSESSMENT');
  assert.equal(breachEvents[0].metadata.audit.criticalMutation, true);
  assert.equal(breachEvents[0].metadata.audit.isEscalation, true);
  assert.equal(breachEvents[0].producer, 'engine.09.risk');
});

test('AssessRisk honours an explicit minimumLevel override on the command', async () => {
  const { engine } = createFixture();

  const res = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'plateau-jos',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(0.6),
    exposureIndex: 0.5,
    minimumLevel: RiskLevel.CATASTROPHIC
  }, 'assess-override'));

  assert.equal(res.assessment.score, 45);
  assert.equal(res.assessment.riskLevel, RiskLevel.HIGH);
  assert.equal(res.assessment.minimumLevel, RiskLevel.CATASTROPHIC);
  assert.equal(res.thresholdBreached, false);
});

test('ReassessRisk escalates level and emits transition metadata', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(0.3),
    exposureIndex: 0.5
  }, 're-1'));
  const assessmentId = created.assessment.assessmentId;
  assert.equal(created.assessment.riskLevel, RiskLevel.MODERATE);

  const res = await engine.executeCommand(command('ReassessRisk', {
    assessmentId,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 're-2'));

  assert.equal(res.previousLevel, RiskLevel.MODERATE);
  assert.equal(res.newLevel, RiskLevel.CATASTROPHIC);
  assert.equal(res.levelChanged, true);
  assert.equal(res.isEscalation, true);
  assert.equal(res.isDeescalation, false);
  assert.equal(res.thresholdBreached, true);
  assert.equal(res.assessment.assessmentId, assessmentId);

  const evaluated = eventBus.getHistory({ eventType: RISK_ASSESSMENT_EVALUATED });
  assert.equal(evaluated.length, 2);
  assert.equal(evaluated[1].payload.reason, 'RE_EVALUATION');
  assert.equal(evaluated[1].payload.previousLevel, RiskLevel.MODERATE);
  assert.equal(evaluated[1].payload.riskLevel, RiskLevel.CATASTROPHIC);
  assert.equal(evaluated[1].payload.isEscalation, true);

  // Newly breached => breach event with RE_ESCALATION reason
  const breachEvents = eventBus.getHistory({ eventType: 'econet.risk.threshold_breached' });
  assert.equal(breachEvents.length, 1);
  assert.equal(breachEvents[0].payload.reason, 'RE_ESCALATION');
  assert.equal(breachEvents[0].payload.previousLevel, RiskLevel.MODERATE);
});

test('ReassessRisk de-escalation emits threshold_cleared when breach resolves', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'clear-1'));
  assert.equal(created.thresholdBreached, true);

  const res = await engine.executeCommand(command('ReassessRisk', {
    assessmentId: created.assessment.assessmentId,
    factors: sampleFactors(0.1),
    exposureIndex: 0
  }, 'clear-2'));

  assert.equal(res.newLevel, RiskLevel.LOW);
  assert.equal(res.isDeescalation, true);
  assert.equal(res.thresholdBreached, false);

  const cleared = eventBus.getHistory({ eventType: 'econet.risk.threshold_cleared' });
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].payload.reason, 'RE_EVALUATION');
  assert.equal(cleared[0].payload.riskLevel, RiskLevel.LOW);
  assert.equal(cleared[0].metadata.audit.criticalMutation, false);
});

test('AddRiskMitigation records mitigation, de-escalates, and clears the breach', async () => {
  const { engine, repository, eventBus } = createFixture();

  const created = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'mit-1'));

  const res = await engine.executeCommand(command('AddRiskMitigation', {
    assessmentId: created.assessment.assessmentId,
    action: 'Deploy emergency drainage pumps',
    appliedBy: 'civil-defence-1',
    effectiveness: 0.85
  }, 'mit-2'));

  assert.equal(res.previousLevel, RiskLevel.CATASTROPHIC);
  assert.equal(res.newLevel, RiskLevel.LOW);
  assert.equal(res.levelChanged, true);
  assert.equal(res.isDeescalation, true);
  assert.equal(res.thresholdBreached, false);
  assert.equal(res.assessment.mitigations.length, 1);
  assert.equal(res.assessment.mitigations[0].appliedBy, 'civil-defence-1');

  // Persisted state reflects the mitigation
  const persisted = await repository.findById(created.assessment.assessmentId);
  assert.equal(persisted.mitigations.length, 1);
  assert.equal(persisted.riskLevel, RiskLevel.LOW);

  const evaluated = eventBus.getHistory({ eventType: RISK_ASSESSMENT_EVALUATED });
  assert.equal(evaluated.length, 2);
  assert.equal(evaluated[1].payload.reason, 'MITIGATION_APPLIED');
  assert.equal(evaluated[1].metadata.mitigationAction, 'Deploy emergency drainage pumps');

  const cleared = eventBus.getHistory({ eventType: 'econet.risk.threshold_cleared' });
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].payload.reason, 'MITIGATION_APPLIED');
});

test('AddRiskMitigation to an unknown assessment throws', async () => {
  const { engine } = createFixture();
  await assert.rejects(
    engine.executeCommand(command('AddRiskMitigation', {
      assessmentId: 'rsk_missing',
      action: 'nope',
      effectiveness: 0.5
    }, 'mit-missing')),
    /RiskAssessment not found/
  );
});

test('UpdateRiskThreshold sets per-hazard override and emits an audited policy event', async () => {
  const { engine, eventBus } = createFixture();

  assert.equal(await engine.resolveThreshold(HazardType.FLOOD), RiskLevel.HIGH);

  const res = await engine.executeCommand(command('UpdateRiskThreshold', {
    hazardType: HazardType.FLOOD,
    minimumLevel: RiskLevel.SEVERE
  }, 'thr-1'));

  assert.equal(res.thresholdKey, HazardType.FLOOD);
  assert.equal(res.isGlobal, false);
  assert.equal(res.previousMinimumLevel, null);
  assert.equal(res.minimumLevel, RiskLevel.SEVERE);
  assert.equal(await engine.resolveThreshold(HazardType.FLOOD), RiskLevel.SEVERE);
  // Other hazards keep their canonical defaults
  assert.equal(await engine.resolveThreshold(HazardType.WILDFIRE), RiskLevel.HIGH);

  const events = eventBus.getHistory({ eventType: 'econet.risk.threshold_updated' });
  assert.equal(events.length, 1);
  assert.equal(events[0].subject.entityId, HazardType.FLOOD);
  assert.equal(events[0].payload.previousMinimumLevel, null);
  assert.equal(events[0].payload.minimumLevel, RiskLevel.SEVERE);
  assert.equal(events[0].metadata.audit.criticalMutation, true);
  assert.equal(events[0].producer, 'engine.09.risk');
});

test('UpdateRiskThreshold global scope overrides canonical hazard defaults', async () => {
  const { engine } = createFixture();

  // EPIDEMIC canonical default is SEVERE
  assert.equal(await engine.resolveThreshold(HazardType.EPIDEMIC), RiskLevel.SEVERE);

  const res = await engine.executeCommand(command('UpdateRiskThreshold', {
    scope: 'GLOBAL',
    minimumLevel: RiskLevel.MODERATE
  }, 'thr-global'));

  assert.equal(res.thresholdKey, GLOBAL_THRESHOLD_KEY);
  assert.equal(res.isGlobal, true);
  assert.equal(await engine.resolveThreshold(HazardType.EPIDEMIC), RiskLevel.MODERATE);
  assert.equal(await engine.resolveThreshold(HazardType.DROUGHT), RiskLevel.MODERATE);
});

test('threshold precedence: hazard override beats global override beats canonical default', async () => {
  const { engine } = createFixture();

  // 1. Canonical default
  assert.equal(await engine.resolveThreshold(HazardType.STORM), RiskLevel.MODERATE);

  // 2. Global override wins over canonical default
  await engine.executeCommand(command('UpdateRiskThreshold', {
    scope: 'GLOBAL',
    minimumLevel: RiskLevel.SEVERE
  }, 'prec-1'));
  assert.equal(await engine.resolveThreshold(HazardType.STORM), RiskLevel.SEVERE);
  assert.equal(await engine.resolveThreshold(HazardType.FLOOD), RiskLevel.SEVERE);

  // 3. Per-hazard override wins over global override
  await engine.executeCommand(command('UpdateRiskThreshold', {
    hazardType: HazardType.FLOOD,
    minimumLevel: RiskLevel.LOW
  }, 'prec-2'));
  assert.equal(await engine.resolveThreshold(HazardType.FLOOD), RiskLevel.LOW);
  assert.equal(await engine.resolveThreshold(HazardType.STORM), RiskLevel.SEVERE);
});

test('UpdateRiskThreshold merges overrides into the threshold table', async () => {
  const { engine } = createFixture();

  const initial = await engine.listThresholds();
  const floodInitial = initial.find(t => t.thresholdKey === HazardType.FLOOD);
  assert.equal(floodInitial.source, 'CANONICAL_DEFAULT');
  assert.equal(floodInitial.minimumLevel, DEFAULT_MINIMUM_LEVEL_BY_HAZARD[HazardType.FLOOD]);
  assert.equal(initial.find(t => t.isGlobal).thresholdKey, GLOBAL_THRESHOLD_KEY);

  await engine.executeCommand(command('UpdateRiskThreshold', {
    hazardType: HazardType.DROUGHT,
    minimumLevel: RiskLevel.CATASTROPHIC
  }, 'table-1'));

  const updated = await engine.listThresholds();
  const drought = updated.find(t => t.thresholdKey === HazardType.DROUGHT);
  assert.equal(drought.source, 'OVERRIDE');
  assert.equal(drought.minimumLevel, RiskLevel.CATASTROPHIC);
  // Untouched hazards remain canonical
  assert.equal(updated.find(t => t.thresholdKey === HazardType.FLOOD).source, 'CANONICAL_DEFAULT');
});

test('UpdateRiskThreshold rejects an invalid risk tier', async () => {
  const { engine } = createFixture();
  await assert.rejects(
    engine.executeCommand(command('UpdateRiskThreshold', {
      hazardType: HazardType.FLOOD,
      minimumLevel: 'EXTREME'
    }, 'thr-bad')),
    /Invalid risk level/
  );
  await assert.rejects(
    engine.executeCommand(command('UpdateRiskThreshold', {
      scope: 'GLOBAL'
    }, 'thr-missing')),
    /requires a minimumLevel risk tier/
  );
});

test('GetRiskAssessmentById and ListActiveRisks queries work', async () => {
  const { engine } = createFixture();

  const flood = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'q-1'));

  const storm = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'lagos-ikeja',
    hazardType: HazardType.STORM,
    factors: sampleFactors(0.2),
    exposureIndex: 0.2
  }, 'q-2'));

  const fetched = await engine.getRiskAssessment(flood.assessment.assessmentId);
  assert.equal(fetched.subjectId, 'anambra-ihiala');
  assert.equal(fetched.riskLevel, RiskLevel.CATASTROPHIC);
  assert.equal(await engine.getRiskAssessment('rsk_unknown'), null);

  const allActive = await engine.listActiveRisks();
  assert.equal(allActive.length, 2);

  const floodOnly = await engine.listActiveRisks({ hazardType: HazardType.FLOOD });
  assert.equal(floodOnly.length, 1);
  assert.equal(floodOnly[0].assessmentId, flood.assessment.assessmentId);

  const severeUp = await engine.listActiveRisks({ minimumLevel: RiskLevel.SEVERE });
  assert.equal(severeUp.length, 1);
  assert.equal(severeUp[0].assessmentId, flood.assessment.assessmentId);

  const highUp = await engine.listActiveRisks({ minimumLevel: RiskLevel.HIGH });
  assert.equal(highUp.length, 1);

  // storm assessment is LOW so it must not appear at HIGH or above
  assert.ok(!highUp.some(a => a.assessmentId === storm.assessment.assessmentId));

  await assert.rejects(
    engine.listActiveRisks({ minimumLevel: 'EXTREME' }),
    /Invalid risk level/
  );
  await assert.rejects(
    engine.getRiskAssessment(null),
    /assessmentId is required/
  );
});

test('Idempotency: duplicate AssessRisk returns the same persisted assessment', async () => {
  const { engine, repository, eventBus } = createFixture();

  const cmd = command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'idem-1');

  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(first.assessment.assessmentId, second.assessment.assessmentId);
  assert.equal(await repository.count(), 1);
  // Cached response playback must not re-emit events
  assert.equal(eventBus.getHistory({ eventType: RISK_ASSESSMENT_EVALUATED }).length, 1);
});

test('Governance denial blocks AssessRisk before any mutation or event', async () => {
  const repository = new InMemoryRiskRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const mockGovernance = {
    async evaluatePolicy() {
      return { allowed: false, reason: 'ASSESSMENT_MORATORIUM_ACTIVE' };
    }
  };

  const engine = new RiskEngine({
    repository,
    eventBus,
    idempotencyManager,
    governance: mockGovernance
  });

  await assert.rejects(
    engine.executeCommand(command('AssessRisk', {
      subjectId: 'locked-region',
      hazardType: HazardType.FLOOD,
      factors: sampleFactors(1),
      exposureIndex: 1
    }, 'gov-deny')),
    /Governance policy denial: ASSESSMENT_MORATORIUM_ACTIVE/
  );

  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

test('Governance denial also blocks UpdateRiskThreshold policy mutation', async () => {
  const repository = new InMemoryRiskRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new RiskEngine({
    repository,
    eventBus,
    idempotencyManager,
    governance: { async evaluatePolicy() { return { allowed: false, reason: 'POLICY_FREEZE' }; } }
  });

  await assert.rejects(
    engine.executeCommand(command('UpdateRiskThreshold', {
      scope: 'GLOBAL',
      minimumLevel: RiskLevel.LOW
    }, 'gov-thr')),
    /Governance policy denial: POLICY_FREEZE/
  );

  assert.equal(await engine.resolveThreshold(HazardType.FLOOD), RiskLevel.HIGH);
  assert.equal(eventBus.getHistory().length, 0);
});

test('Repository isolation: assessments and thresholds do not leak across engines', async () => {
  const repoA = new InMemoryRiskRepository();
  const repoB = new InMemoryRiskRepository();

  const engineA = new RiskEngine({ repository: repoA });
  const engineB = new RiskEngine({ repository: repoB });

  await engineA.executeCommand(command('AssessRisk', {
    subjectId: 'region-a',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'iso-a'));

  await engineB.executeCommand(command('UpdateRiskThreshold', {
    hazardType: HazardType.FLOOD,
    minimumLevel: RiskLevel.CATASTROPHIC
  }, 'iso-b'));

  assert.equal(await repoA.count(), 1);
  assert.equal(await repoB.count(), 0);

  // Threshold override in B must not affect A
  assert.equal(await engineA.resolveThreshold(HazardType.FLOOD), RiskLevel.HIGH);
  assert.equal(await engineB.resolveThreshold(HazardType.FLOOD), RiskLevel.CATASTROPHIC);
});

test('Unsupported and non-canonical Risk commands are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(command('DeleteAllRisks', {}, 'bad-cmd')),
    /Unsupported Risk command/
  );

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'AssessRisk',
      targetEngine: '12-action',
      payload: {},
      idempotencyKey: 'wrong-engine'
    })),
    /Unsupported Risk command/
  );

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'AssessRisk',
      targetEngine: '09-risk',
      payload: { subjectId: 'x', hazardType: HazardType.FLOOD, factors: sampleFactors(1) }
    })),
    /requires an idempotencyKey/
  );
});

test('Audit handoff: every risk event carries complete Engine 23 audit metadata', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('AssessRisk', {
    subjectId: 'anambra-ihiala',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'audit-1'));

  await engine.executeCommand(command('AssessRisk', {
    subjectId: 'lagos-ikeja',
    hazardType: HazardType.STORM,
    factors: sampleFactors(0.1),
    exposureIndex: 0
  }, 'audit-2'));

  await engine.executeCommand(command('AddRiskMitigation', {
    assessmentId: created.assessment.assessmentId,
    action: 'Evacuation',
    effectiveness: 1
  }, 'audit-3'));

  await engine.executeCommand(command('UpdateRiskThreshold', {
    scope: 'GLOBAL',
    minimumLevel: RiskLevel.SEVERE
  }, 'audit-4'));

  const events = eventBus.getHistory();
  assert.ok(events.length >= 5);
  assert.ok(events.every(e => e.producer === 'engine.09.risk'));
  assert.ok(events.every(e =>
    e.metadata &&
    typeof e.metadata.audit === 'object' &&
    typeof e.metadata.audit.criticalMutation === 'boolean' &&
    typeof e.metadata.provenance === 'string'
  ));

  const evaluated = events.find(e => e.eventType === RISK_ASSESSMENT_EVALUATED);
  assert.equal(evaluated.metadata.audit.criticalMutation, true);
  assert.equal(evaluated.subject.entityType, 'risk_assessment');
  assert.equal(evaluated.correlationId, 'cor-audit-1');
});

test('RiskEngine exposes the canonical lifecycle contract and live health check', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '09');
  assert.equal(engine.engineName, 'Risk Engine');
  assert.ok(engine.service instanceof RiskApplicationService);
  assert.equal(engine.repository, repository);

  const init = await engine.initialize();
  assert.equal(init.ready, true);
  assert.equal(init.engineId, '09');

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_RISK_ADAPTER');
  assert.equal(health.details.totalAssessments, 0);

  await engine.executeCommand(command('AssessRisk', {
    subjectId: 'region-1',
    hazardType: HazardType.FLOOD,
    factors: sampleFactors(1),
    exposureIndex: 1
  }, 'health-1'));

  const health2 = await engine.healthCheck();
  assert.equal(health2.details.totalAssessments, 1);

  await engine.shutdown();
});
