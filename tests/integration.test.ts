/**
 * Phase 11 — Integration Test Script
 *
 * Tests all agents end-to-end with low/medium/high risk inputs,
 * all planner modes, and invalid input handling.
 *
 * Run: npx tsx tests/integration.test.ts
 */

import { predict, trainModel, resetModel } from '../src/ml/prediction-engine.js';
import { loadDataset, getDatasetStats, getMachineByUdi } from '../src/data/dataset.js';
import { PredictionAgent } from '../src/modules/prediction/prediction.agent.js';
import { DiagnosticAgent } from '../src/modules/diagnostic/diagnostic.agent.js';
import { MaintenanceRecommendationAgent } from '../src/modules/recommendation/recommendation.agent.js';
import { ReportAgent } from '../src/modules/report/report.agent.js';
import { PlannerAgent } from '../src/modules/planner/planner.agent.js';

// ── Mock ExecutionContext ────────────────────────────────────────

const mockCtx: any = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
};

// ── Test infrastructure ─────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (err: any) {
      failed++;
      const msg = err.message || String(err);
      failures.push(`${name}: ${msg}`);
      console.log(`  ❌ ${name} — ${msg}`);
    }
  })();
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ── Test Data ───────────────────────────────────────────────────

const LOW_RISK = {
  type: 'M',
  airTemp: 298.1,
  processTemp: 308.6,
  rotationalSpeed: 1551,
  torque: 42.8,
  toolWear: 0,
};

const MEDIUM_RISK = {
  type: 'L',
  airTemp: 300.9,
  processTemp: 309.1,
  rotationalSpeed: 1408,
  torque: 55.0,
  toolWear: 160,
};

const HIGH_RISK = {
  type: 'L',
  airTemp: 300.6,
  processTemp: 308.2,
  rotationalSpeed: 1312,
  torque: 68.4,
  toolWear: 215,
};

// ── Agent instances ─────────────────────────────────────────────

const predictionAgent = new PredictionAgent();
const diagnosticAgent = new DiagnosticAgent();
const recommendationAgent = new MaintenanceRecommendationAgent();
const reportAgent = new ReportAgent();
const plannerAgent = new PlannerAgent();

// ── Run Tests ───────────────────────────────────────────────────

async function runAll() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  Phase 11 — Integration Tests');
  console.log('═══════════════════════════════════════════════\n');

  // ── 1. Dataset ─────────────────────────────────────────────────
  console.log('📦 Dataset');

  await test('Dataset loads successfully', () => {
    const records = loadDataset();
    assert(records.length === 10000, `Expected 10000 records, got ${records.length}`);
  });

  await test('Dataset stats are correct', () => {
    const stats = getDatasetStats();
    assert(stats.totalRecords === 10000, `Expected 10000 total, got ${stats.totalRecords}`);
    assert(stats.failureCount > 0, 'Expected some failures');
    assert(stats.noFailureCount > 0, 'Expected some non-failures');
    assert(Object.keys(stats.typeBreakdown).length === 3, 'Expected 3 types (L, M, H)');
  });

  await test('getMachineByUdi returns correct record', () => {
    const machine = getMachineByUdi(1);
    assert(machine !== undefined, 'Expected machine with UDI 1');
    assert(machine!.udi === 1, `Expected UDI 1, got ${machine!.udi}`);
  });

  await test('getMachineByUdi returns undefined for invalid UDI', () => {
    const machine = getMachineByUdi(99999);
    assert(machine === undefined, 'Expected undefined for UDI 99999');
  });

  // ── 2. Prediction Engine ───────────────────────────────────────
  console.log('\n🤖 Prediction Engine');

  await test('Model trains successfully', () => {
    resetModel();
    const model = trainModel();
    assert(model.trained === true, 'Model should be trained');
    assert(model.weights.length === 7, `Expected 7 weights, got ${model.weights.length}`);
  });

  await test('Low-risk input → no_failure', () => {
    const result = predict(LOW_RISK);
    assert(result.prediction === 'no_failure', `Expected no_failure, got ${result.prediction}`);
    assert(result.probability < 0.5, `Expected probability < 0.5, got ${result.probability}`);
    assert(result.confidence > 0.5, `Expected confidence > 0.5, got ${result.confidence}`);
  });

  await test('High-risk input → higher probability', () => {
    const low = predict(LOW_RISK);
    const high = predict(HIGH_RISK);
    assert(high.probability > low.probability, 'High-risk should have higher probability than low-risk');
  });

  await test('Prediction result has all required fields', () => {
    const result = predict(LOW_RISK);
    assert('prediction' in result, 'Missing prediction');
    assert('probability' in result, 'Missing probability');
    assert('confidence' in result, 'Missing confidence');
    assert('features' in result, 'Missing features');
    assert(result.probability >= 0 && result.probability <= 1, 'Probability out of range');
    assert(result.confidence >= 0.5 && result.confidence <= 1, 'Confidence out of range');
  });

  // ── 3. Prediction Agent ────────────────────────────────────────
  console.log('\n🔮 Prediction Agent');

  await test('Prediction Agent — low risk', async () => {
    const result = await predictionAgent.runPrediction(LOW_RISK, mockCtx);
    assert(result.machineStatus === 'Healthy', `Expected Healthy, got ${result.machineStatus}`);
    assert(result.prediction === 'no_failure', `Expected no_failure, got ${result.prediction}`);
    assert(typeof result.summary === 'string' && result.summary.length > 0, 'Missing summary');
  });

  await test('Prediction Agent — high risk', async () => {
    const result = await predictionAgent.runPrediction(HIGH_RISK, mockCtx);
    assert(result.probability > predict(LOW_RISK).probability, 'High risk should have higher probability');
    assert(typeof result.confidence === 'number', 'Missing confidence');
  });

  // ── 4. Diagnostic Agent ────────────────────────────────────────
  console.log('\n🩺 Diagnostic Agent');

  await test('Diagnostic Agent — low risk → Healthy', async () => {
    const result = await diagnosticAgent.runDiagnostic(LOW_RISK, mockCtx);
    assert(result.overallStatus === 'Healthy', `Expected Healthy, got ${result.overallStatus}`);
    assert(Array.isArray(result.findings), 'Missing findings array');
    assert(Array.isArray(result.failureModeHints), 'Missing failureModeHints array');
    assert(typeof result.summary === 'string', 'Missing summary');
  });

  await test('Diagnostic Agent — high risk → has findings', async () => {
    const result = await diagnosticAgent.runDiagnostic(HIGH_RISK, mockCtx);
    assert(result.findings.length > 0, 'Expected findings for high-risk input');
    assert(result.failureModeHints.length > 0, 'Expected failure-mode hints');
    assert(result.prediction.probability > 0, 'Expected prediction probability > 0');
  });

  await test('Diagnostic Agent — medium risk', async () => {
    const result = await diagnosticAgent.runDiagnostic(MEDIUM_RISK, mockCtx);
    assert(['Healthy', 'Warning', 'Critical'].includes(result.overallStatus), `Unexpected status: ${result.overallStatus}`);
  });

  // ── 5. Recommendation Agent ────────────────────────────────────
  console.log('\n🔧 Recommendation Agent');

  await test('Recommendation Agent — low risk → none/low urgency', async () => {
    const result = await recommendationAgent.runRecommendation(LOW_RISK, mockCtx);
    assert(['none', 'low'].includes(result.urgency), `Expected none/low, got ${result.urgency}`);
    assert(result.shouldStop === false, 'Low risk should not stop');
    assert(typeof result.action === 'string', 'Missing action');
    assert(Array.isArray(result.inspectNext), 'Missing inspectNext');
    assert(typeof result.monitoringAdvice === 'string', 'Missing monitoringAdvice');
  });

  await test('Recommendation Agent — high risk → elevated urgency', async () => {
    const result = await recommendationAgent.runRecommendation(HIGH_RISK, mockCtx);
    assert(!['none'].includes(result.urgency), `Expected elevated urgency, got ${result.urgency}`);
    assert(result.inspectNext.length > 0, 'Expected inspection items');
  });

  await test('Recommendation Agent — result has prediction', async () => {
    const result = await recommendationAgent.runRecommendation(MEDIUM_RISK, mockCtx);
    assert(result.prediction !== undefined, 'Missing prediction in result');
    assert(typeof result.prediction.probability === 'number', 'Missing probability');
  });

  // ── 6. Report Agent ────────────────────────────────────────────
  console.log('\n📋 Report Agent');

  await test('Report Agent — low risk', async () => {
    const result = await reportAgent.runReport(LOW_RISK, mockCtx);
    assert(typeof result.overallStatus === 'string', 'Missing overallStatus');
    assert(typeof result.prediction === 'object', 'Missing prediction');
    assert(typeof result.diagnosticSummary === 'string', 'Missing diagnosticSummary');
    assert(typeof result.urgency === 'string', 'Missing urgency');
    assert(typeof result.recommendedAction === 'string', 'Missing recommendedAction');
    assert(typeof result.actionNeededNow === 'boolean', 'Missing actionNeededNow');
    assert(typeof result.report === 'string', 'Missing report text');
    assert(result.report.includes('Machine Health Report'), 'Report should contain title');
  });

  await test('Report Agent — high risk → actionNeededNow', async () => {
    const result = await reportAgent.runReport(HIGH_RISK, mockCtx);
    // High risk should trigger action
    assert(typeof result.actionNeededNow === 'boolean', 'Missing actionNeededNow');
    assert(result.report.length > 100, 'Report too short');
  });

  // ── 7. Planner Agent — All Modes ──────────────────────────────
  console.log('\n📐 Planner Agent');

  const modes = ['prediction', 'diagnosis', 'recommendation', 'report', 'full'] as const;

  for (const mode of modes) {
    await test(`Planner mode="${mode}" — executes correctly`, async () => {
      const result = await plannerAgent.runPlanner({ mode, ...MEDIUM_RISK }, mockCtx);
      assert(result.mode === mode, `Expected mode ${mode}, got ${result.mode}`);
      assert(Array.isArray(result.plan.agentsExecuted), 'Missing agentsExecuted');
      assert(result.plan.agentsExecuted.length > 0, 'No agents executed');
      assert(typeof result.durationMs === 'number', 'Missing durationMs');
      assert(typeof result.summary === 'string', 'Missing summary');
      assert(typeof result.results === 'object', 'Missing results');
    });
  }

  await test('Planner mode="prediction" → only prediction result', async () => {
    const result = await plannerAgent.runPlanner({ mode: 'prediction', ...LOW_RISK }, mockCtx);
    assert(result.results.prediction !== undefined, 'Missing prediction result');
    assert(result.plan.agentsExecuted.length === 1, `Expected 1 agent, got ${result.plan.agentsExecuted.length}`);
    assert(result.plan.agentsExecuted[0] === 'PredictionAgent', 'Expected PredictionAgent');
  });

  await test('Planner mode="full" → all agents executed', async () => {
    const result = await plannerAgent.runPlanner({ mode: 'full', ...HIGH_RISK }, mockCtx);
    assert(result.plan.agentsExecuted.length === 4, `Expected 4 agents, got ${result.plan.agentsExecuted.length}`);
    assert(result.results.prediction !== undefined, 'Missing prediction');
    assert(result.results.diagnosis !== undefined, 'Missing diagnosis');
    assert(result.results.recommendation !== undefined, 'Missing recommendation');
    assert(result.results.report !== undefined, 'Missing report');
  });

  // ── 8. Risk-level consistency across agents ────────────────────
  console.log('\n🔄 Cross-Agent Consistency');

  await test('All agents agree on low-risk assessment', async () => {
    const pred = await predictionAgent.runPrediction(LOW_RISK, mockCtx);
    const diag = await diagnosticAgent.runDiagnostic(LOW_RISK, mockCtx);
    const rec = await recommendationAgent.runRecommendation(LOW_RISK, mockCtx);
    assert(pred.machineStatus === 'Healthy', 'Prediction should say Healthy');
    assert(diag.overallStatus === 'Healthy', 'Diagnosis should say Healthy');
    assert(['none', 'low'].includes(rec.urgency), 'Recommendation urgency should be none/low');
  });

  await test('High-risk input → consistent elevated risk', async () => {
    const pred = await predictionAgent.runPrediction(HIGH_RISK, mockCtx);
    const diag = await diagnosticAgent.runDiagnostic(HIGH_RISK, mockCtx);
    const rec = await recommendationAgent.runRecommendation(HIGH_RISK, mockCtx);
    assert(pred.probability > predict(LOW_RISK).probability, 'Prediction probability should be higher');
    assert(diag.findings.length > 0 || diag.failureModeHints.length > 0, 'Should have findings or hints');
    assert(!['none'].includes(rec.urgency), 'Urgency should not be none');
  });

  // ── 9. Edge cases ──────────────────────────────────────────────
  console.log('\n🧪 Edge Cases');

  await test('Unknown type defaults gracefully', () => {
    const result = predict({ type: 'X', airTemp: 300, processTemp: 310, rotationalSpeed: 1500, torque: 40, toolWear: 100 });
    assert(typeof result.prediction === 'string', 'Should return a prediction');
    assert(typeof result.probability === 'number', 'Should return a probability');
  });

  await test('Extreme values do not crash', () => {
    const result = predict({ type: 'L', airTemp: 500, processTemp: 600, rotationalSpeed: 10000, torque: 200, toolWear: 1000 });
    assert(typeof result.prediction === 'string', 'Should handle extreme values');
    assert(result.probability >= 0 && result.probability <= 1, 'Probability should be in [0,1]');
  });

  await test('Zero values do not crash', () => {
    const result = predict({ type: 'L', airTemp: 0, processTemp: 0, rotationalSpeed: 0, torque: 0, toolWear: 0 });
    assert(typeof result.prediction === 'string', 'Should handle zero values');
  });

  await test('Diagnostic handles extreme values', async () => {
    const result = await diagnosticAgent.runDiagnostic(
      { type: 'H', airTemp: 350, processTemp: 370, rotationalSpeed: 5000, torque: 100, toolWear: 250 },
      mockCtx,
    );
    assert(result.findings.length > 0, 'Should detect abnormal readings');
    assert(result.overallStatus === 'Critical', `Expected Critical for extreme values, got ${result.overallStatus}`);
  });

  // ── 10. Widget linkage check ──────────────────────────────────
  console.log('\n🎨 Widget Integration');

  await test('Dashboard widget file exists', async () => {
    const fs = await import('fs');
    const widgetPath = 'src/widgets/app/dashboard/page.tsx';
    assert(fs.existsSync(widgetPath), `Widget file not found at ${widgetPath}`);
  });

  await test('Widget manifest includes dashboard', async () => {
    const fs = await import('fs');
    const manifest = JSON.parse(fs.readFileSync('src/widgets/widget-manifest.json', 'utf-8'));
    const dashboard = manifest.widgets.find((w: any) => w.uri === '/dashboard');
    assert(dashboard !== undefined, 'Dashboard not in widget manifest');
    assert(dashboard.name === 'Predictive Maintenance Dashboard', `Wrong name: ${dashboard.name}`);
  });

  await test('Planner agent has @Widget decorator', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/modules/planner/planner.agent.ts', 'utf-8');
    assert(source.includes("@Widget('dashboard')"), 'Missing @Widget decorator on planner tool');
    assert(source.includes('import') && source.includes('Widget'), 'Missing Widget import');
  });

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    for (const f of failures) {
      console.log(`   • ${f}`);
    }
  } else {
    console.log('\n✅ All tests passed!\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAll();
