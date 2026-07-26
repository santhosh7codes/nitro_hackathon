import {
  ToolDecorator as Tool,
  PromptDecorator as Prompt,
  Widget,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { PredictionAgent } from '../prediction/prediction.agent.js';
import { DiagnosticAgent } from '../diagnostic/diagnostic.agent.js';
import { MaintenanceRecommendationAgent } from '../recommendation/recommendation.agent.js';
import { ReportAgent } from '../report/report.agent.js';

/**
 * Planner Agent (Phase 9)
 *
 * Orchestrates the existing agents based on the requested analysis mode.
 * Instead of duplicating logic, it decides which agents to run and
 * calls them in the correct order.
 *
 * Supported modes:
 *   "prediction"      → Prediction Agent only
 *   "diagnosis"       → Diagnostic Agent only
 *   "recommendation"  → Recommendation Agent only
 *   "report"          → Full Report Agent (Diagnostic + Recommendation)
 *   "full"            → All agents individually + Report
 */

// ── Reusable agent instances ────────────────────────────────────

const predictionAgent    = new PredictionAgent();
const diagnosticAgent    = new DiagnosticAgent();
const recommendationAgent = new MaintenanceRecommendationAgent();
const reportAgent        = new ReportAgent();

// ── Valid modes ─────────────────────────────────────────────────

const VALID_MODES = ['prediction', 'diagnosis', 'recommendation', 'report', 'full'] as const;
type AnalysisMode = typeof VALID_MODES[number];

// Map each mode to the agents it runs (in order)
const MODE_AGENTS: Record<AnalysisMode, string[]> = {
  prediction:     ['PredictionAgent'],
  diagnosis:      ['DiagnosticAgent'],
  recommendation: ['RecommendationAgent'],
  report:         ['DiagnosticAgent', 'RecommendationAgent', 'ReportAgent'],
  full:           ['PredictionAgent', 'DiagnosticAgent', 'RecommendationAgent', 'ReportAgent'],
};

// ── Sensor input type ───────────────────────────────────────────

interface SensorInput {
  type: string;
  airTemp: number;
  processTemp: number;
  rotationalSpeed: number;
  torque: number;
  toolWear: number;
}

// ── Agent Class ─────────────────────────────────────────────────

export class PlannerAgent {

  /**
   * MCP Prompt — guides AI clients on how to use the planner agent.
   */
  @Prompt({
    name: 'planner_agent',
    description:
      'Guides an AI assistant to use the planner agent tool. The planner decides ' +
      'which maintenance agents to run based on the requested analysis mode ' +
      '(prediction, diagnosis, recommendation, report, or full).',
    arguments: [
      { name: 'mode',            description: 'Analysis mode: prediction, diagnosis, recommendation, report, or full', required: true },
      { name: 'type',            description: 'Machine quality type: L, M, or H', required: true },
      { name: 'airTemp',         description: 'Air temperature in Kelvin',        required: true },
      { name: 'processTemp',     description: 'Process temperature in Kelvin',    required: true },
      { name: 'rotationalSpeed', description: 'Rotational speed in RPM',          required: true },
      { name: 'torque',          description: 'Torque in Nm',                     required: true },
      { name: 'toolWear',        description: 'Tool wear in minutes',             required: true },
    ],
  })
  async plannerPrompt(
    args: Record<string, string>,
    _ctx: ExecutionContext,
  ) {
    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text:
            `You are a Planner Agent that orchestrates machine-health analysis. ` +
            `Use the "run_planner_agent" tool with the following parameters:\n\n` +
            `- mode: ${args.mode ?? 'full'}\n` +
            `- type: ${args.type ?? 'M'}\n` +
            `- airTemp: ${args.airTemp ?? '298.1'}\n` +
            `- processTemp: ${args.processTemp ?? '308.6'}\n` +
            `- rotationalSpeed: ${args.rotationalSpeed ?? '1551'}\n` +
            `- torque: ${args.torque ?? '42.8'}\n` +
            `- toolWear: ${args.toolWear ?? '0'}\n\n` +
            `Available modes:\n` +
            `  prediction     — Quick failure probability check\n` +
            `  diagnosis      — Sensor analysis with threshold checks\n` +
            `  recommendation — Maintenance advice based on risk level\n` +
            `  report         — Combined diagnosis + recommendation report\n` +
            `  full           — Run all agents and return everything\n\n` +
            `Present the results in a clear, structured format.`,
        },
      },
    ];
  }

  /**
   * The Planner Agent tool.
   *
   * Accepts a mode and 6 sensor values, builds an execution plan,
   * runs the selected agents in order, and returns the combined result.
   */
  @Tool({
    name: 'run_planner_agent',
    description:
      'Planner Agent — orchestrates machine-health analysis by selecting and running ' +
      'the appropriate agents based on the requested mode. Modes: prediction (quick check), ' +
      'diagnosis (sensor analysis), recommendation (maintenance advice), report (combined), ' +
      'or full (everything).',
    inputSchema: z.object({
      mode: z.enum(['prediction', 'diagnosis', 'recommendation', 'report', 'full'])
        .describe('Analysis mode: prediction, diagnosis, recommendation, report, or full'),
      type:            z.string().describe('Machine quality type: L (Low), M (Medium), or H (High)'),
      airTemp:         z.number().describe('Air temperature in Kelvin'),
      processTemp:     z.number().describe('Process temperature in Kelvin'),
      rotationalSpeed: z.number().describe('Rotational speed in RPM'),
      torque:          z.number().describe('Torque in Nm'),
      toolWear:        z.number().describe('Tool wear in minutes'),
    }),
  })
  @Widget('dashboard')
  async runPlanner(
    input: { mode: AnalysisMode } & SensorInput,
    ctx: ExecutionContext,
  ) {
    const { mode, ...sensorInput } = input;
    ctx.logger.info('Planner Agent invoked', { mode });

    const agentsToRun = MODE_AGENTS[mode];

    ctx.logger.info('Execution plan', { mode, agents: agentsToRun });

    // ── Execute agents in order ──────────────────────────────────

    const results: Record<string, unknown> = {};
    const agentsExecuted: string[] = [];
    const startTime = Date.now();

    // Prediction Agent
    if (agentsToRun.includes('PredictionAgent')) {
      results.prediction = await predictionAgent.runPrediction(sensorInput, ctx);
      agentsExecuted.push('PredictionAgent');
    }

    // Diagnostic Agent
    if (agentsToRun.includes('DiagnosticAgent')) {
      results.diagnosis = await diagnosticAgent.runDiagnostic(sensorInput, ctx);
      agentsExecuted.push('DiagnosticAgent');
    }

    // Recommendation Agent
    if (agentsToRun.includes('RecommendationAgent')) {
      results.recommendation = await recommendationAgent.runRecommendation(sensorInput, ctx);
      agentsExecuted.push('RecommendationAgent');
    }

    // Report Agent (calls Diagnostic + Recommendation internally, but
    // in "full" mode we already ran them above so the report adds the
    // combined text report on top)
    if (agentsToRun.includes('ReportAgent')) {
      results.report = await reportAgent.runReport(sensorInput, ctx);
      agentsExecuted.push('ReportAgent');
    }

    const durationMs = Date.now() - startTime;

    // ── Build summary ────────────────────────────────────────────

    let summary: string;
    switch (mode) {
      case 'prediction':
        summary = 'Ran a quick failure prediction. Check the prediction result for details.';
        break;
      case 'diagnosis':
        summary = 'Ran sensor analysis with threshold checks. Check the diagnosis for findings.';
        break;
      case 'recommendation':
        summary = 'Generated maintenance advice based on failure risk. Check the recommendation for actions.';
        break;
      case 'report':
        summary = 'Generated a full report combining diagnosis and maintenance recommendations.';
        break;
      case 'full':
        summary = `Ran all ${agentsExecuted.length} agents. The complete analysis is available in the results.`;
        break;
    }

    ctx.logger.info('Planner Agent complete', {
      mode,
      agentsExecuted: agentsExecuted.length,
      durationMs,
    });

    return {
      mode,
      plan: {
        agentsSelected: agentsToRun,
        agentsExecuted,
        executionOrder: agentsExecuted,
      },
      results,
      durationMs,
      summary,
    };
  }
}
