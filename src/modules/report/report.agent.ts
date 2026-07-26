import {
  ToolDecorator as Tool,
  PromptDecorator as Prompt,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { DiagnosticAgent } from '../diagnostic/diagnostic.agent.js';
import { MaintenanceRecommendationAgent } from '../recommendation/recommendation.agent.js';

/**
 * Report Agent (Phase 8)
 *
 * Combines the outputs of the Diagnostic Agent (Phase 6) and the
 * Maintenance Recommendation Agent (Phase 7) into one clear,
 * beginner-friendly machine-health report.
 *
 * This agent does NOT duplicate any logic — it calls the existing
 * agents directly and merges their results into a single report.
 */

// Reusable instances of the other agents
const diagnosticAgent = new DiagnosticAgent();
const recommendationAgent = new MaintenanceRecommendationAgent();

// ── Sensor input type (shared across agents) ────────────────────

interface SensorInput {
  type: string;
  airTemp: number;
  processTemp: number;
  rotationalSpeed: number;
  torque: number;
  toolWear: number;
}

// ── Agent Class ─────────────────────────────────────────────────

export class ReportAgent {

  /**
   * MCP Prompt — guides AI clients on how to use the report agent.
   */
  @Prompt({
    name: 'report_agent',
    description:
      'Guides an AI assistant to use the report agent tool for generating ' +
      'a complete machine-health report combining prediction, diagnosis, ' +
      'and maintenance recommendations.',
    arguments: [
      { name: 'type',            description: 'Machine quality type: L, M, or H', required: true },
      { name: 'airTemp',         description: 'Air temperature in Kelvin',        required: true },
      { name: 'processTemp',     description: 'Process temperature in Kelvin',    required: true },
      { name: 'rotationalSpeed', description: 'Rotational speed in RPM',          required: true },
      { name: 'torque',          description: 'Torque in Nm',                     required: true },
      { name: 'toolWear',        description: 'Tool wear in minutes',             required: true },
    ],
  })
  async reportPrompt(
    args: Record<string, string>,
    _ctx: ExecutionContext,
  ) {
    return [
      {
        role: 'assistant' as const,
        content:
          `You are a Machine Health Report Agent. ` +
          `Use the "run_report_agent" tool with these sensor readings:\n\n` +
          `- type: ${args.type ?? 'M'}\n` +
          `- airTemp: ${args.airTemp ?? '298.1'}\n` +
          `- processTemp: ${args.processTemp ?? '308.6'}\n` +
          `- rotationalSpeed: ${args.rotationalSpeed ?? '1551'}\n` +
          `- torque: ${args.torque ?? '42.8'}\n` +
          `- toolWear: ${args.toolWear ?? '0'}\n\n` +
          `IMPORTANT: Do NOT output any spec, UI JSON patch blocks, or code blocks containing {"op":"add",...} operations. ` +
          `Output ONLY clean markdown structured as follows:\n\n` +
          `### Machine Health Report\n\n` +
          `**Overall Status:** [Healthy/Warning/Critical]\n` +
          `**Prediction:** [No failure expected / Failure likely]\n` +
          `**Failure Probability:** X.X%\n` +
          `**Model Confidence:** Y.Y%\n\n` +
          `**Findings:** List any abnormal sensor readings.\n\n` +
          `**Urgency:** [none/low/medium/high/critical]\n` +
          `**Recommended Action:** [action text]\n\n` +
          `**Inspection Checklist:** Bullet list of items to inspect.\n\n` +
          `**Summary:** Plain-English summary of the full report.\n\n` +
          `**Recommendation:** Actionable next steps.`,
      },
    ];
  }

  /**
   * The Report Agent tool.
   *
   * Accepts 6 sensor values, calls the Diagnostic Agent and the
   * Maintenance Recommendation Agent, then combines their outputs
   * into a single, easy-to-read report.
   */
  @Tool({
    name: 'run_report_agent',
    description:
      'Report Agent — generates a complete machine-health report by combining ' +
      'prediction results, diagnostic findings, and maintenance recommendations ' +
      'into one structured, beginner-friendly summary.',
    inputSchema: z.object({
      type:            z.string().describe('Machine quality type: L (Low), M (Medium), or H (High)'),
      airTemp:         z.number().describe('Air temperature in Kelvin'),
      processTemp:     z.number().describe('Process temperature in Kelvin'),
      rotationalSpeed: z.number().describe('Rotational speed in RPM'),
      torque:          z.number().describe('Torque in Nm'),
      toolWear:        z.number().describe('Tool wear in minutes'),
    }),
  })
  async runReport(input: SensorInput, ctx: ExecutionContext) {
    ctx.logger.info('Report Agent invoked', { ...input });

    // ── 1. Run the Diagnostic Agent (Phase 6) ────────────────────
    const diagnostic = await diagnosticAgent.runDiagnostic(input, ctx);

    // ── 2. Run the Recommendation Agent (Phase 7) ────────────────
    const recommendation = await recommendationAgent.runRecommendation(input, ctx);

    // ── 3. Determine if immediate action is needed ───────────────
    const actionNeeded =
      recommendation.urgency === 'critical' ||
      recommendation.urgency === 'high' ||
      recommendation.shouldStop;

    // ── 4. Build the final explanation ───────────────────────────
    const probabilityPct = (diagnostic.prediction.probability * 100).toFixed(1);
    const confidencePct  = (diagnostic.prediction.confidence * 100).toFixed(1);

    const lines: string[] = [
      `Machine Health Report`,
      `═════════════════════`,
      ``,
      `Overall Status: ${diagnostic.overallStatus}`,
      `Prediction: ${diagnostic.prediction.result === 'failure' ? 'Failure likely' : 'No failure expected'}`,
      `Failure Probability: ${probabilityPct}%`,
      `Model Confidence: ${confidencePct}%`,
      ``,
    ];

    // Diagnostic findings
    if (diagnostic.findings.length > 0) {
      lines.push(`Abnormal Readings (${diagnostic.findings.length}):`);
      for (const f of diagnostic.findings) {
        lines.push(`  • [${f.severity.toUpperCase()}] ${f.message}`);
      }
      lines.push('');
    }

    // Failure-mode hints
    if (diagnostic.failureModeHints.length > 0) {
      lines.push(`Failure-Mode Warnings (${diagnostic.failureModeHints.length}):`);
      for (const hint of diagnostic.failureModeHints) {
        lines.push(`  • ${hint}`);
      }
      lines.push('');
    }

    // Maintenance recommendation
    lines.push(`Urgency: ${recommendation.urgency.toUpperCase()}`);
    lines.push(`Action Needed Now: ${actionNeeded ? 'YES' : 'No'}`);
    lines.push(`Recommended Action: ${recommendation.action}`);
    if (recommendation.shouldStop) {
      lines.push(`⚠ STOP THE MACHINE — do not continue operation.`);
    }
    lines.push(`Monitoring: ${recommendation.monitoringAdvice}`);
    lines.push('');

    // Inspection checklist
    if (recommendation.inspectNext.length > 0) {
      lines.push(`Inspection Checklist:`);
      for (const item of recommendation.inspectNext) {
        lines.push(`  ☐ ${item}`);
      }
      lines.push('');
    }

    // Final summary
    lines.push(`Summary: ${recommendation.summary}`);

    const finalReport = lines.join('\n');

    ctx.logger.info('Report Agent complete', {
      overallStatus: diagnostic.overallStatus,
      urgency: recommendation.urgency,
    });

    return {
      overallStatus: diagnostic.overallStatus,
      prediction: diagnostic.prediction,
      diagnosticSummary: diagnostic.summary,
      diagnosticFindings: diagnostic.findings,
      failureModeHints: diagnostic.failureModeHints,
      urgency: recommendation.urgency,
      recommendedAction: recommendation.action,
      shouldStop: recommendation.shouldStop,
      inspectNext: recommendation.inspectNext,
      monitoringAdvice: recommendation.monitoringAdvice,
      actionNeededNow: actionNeeded,
      maintenanceSummary: recommendation.summary,
      report: finalReport,
    };
  }
}
