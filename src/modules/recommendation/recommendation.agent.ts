import {
  ToolDecorator as Tool,
  PromptDecorator as Prompt,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { predict } from '../../ml/prediction-engine.js';

/**
 * Maintenance Recommendation Agent (Phase 7)
 *
 * Takes machine sensor readings, runs the ML prediction (reusing the
 * existing engine), and produces practical maintenance advice.
 *
 * This agent focuses on **what to do** — unlike the Diagnostic Agent
 * (Phase 6) which focuses on **what's wrong**.
 *
 * No ML, dataset, or diagnostic logic is duplicated.
 */

// ── Types ────────────────────────────────────────────────────────

interface Recommendation {
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
  action: string;
  reason: string;
  inspectNext: string[];
  shouldStop: boolean;
  monitoringAdvice: string;
}

// ── Urgency Helpers ─────────────────────────────────────────────

/**
 * Determine urgency level from the ML prediction probability.
 *
 *   0.00–0.10  →  none       (machine is fine)
 *   0.10–0.30  →  low        (minor concern)
 *   0.30–0.50  →  medium     (schedule maintenance)
 *   0.50–0.75  →  high       (act soon)
 *   0.75–1.00  →  critical   (stop the machine)
 */
function getUrgency(probability: number): Recommendation['urgency'] {
  if (probability < 0.10) return 'none';
  if (probability < 0.30) return 'low';
  if (probability < 0.50) return 'medium';
  if (probability < 0.75) return 'high';
  return 'critical';
}

// ── Recommendation Logic ────────────────────────────────────────

/**
 * Build a list of specific things to inspect based on the sensor values.
 * These come from the AI4I 2020 dataset's five failure modes.
 */
function buildInspectionList(input: {
  airTemp: number;
  processTemp: number;
  rotationalSpeed: number;
  torque: number;
  toolWear: number;
}): string[] {
  const items: string[] = [];

  const tempDiff = input.processTemp - input.airTemp;
  if (tempDiff < 8.6 && input.rotationalSpeed < 1380) {
    items.push('Cooling system — temperature difference is small and speed is low (heat dissipation risk)');
  }

  if (input.torque > 60) {
    items.push('Torque load — torque is unusually high, check for mechanical binding or excess load');
  }

  if (input.toolWear > 180) {
    items.push('Cutting tool — tool wear is high, inspect for wear damage or breakage');
  }

  const power = input.torque * (2 * Math.PI * input.rotationalSpeed / 60);
  if (power < 3500 || power > 9000) {
    items.push('Power delivery — computed power is outside normal range, check motor and drive system');
  }

  if (input.rotationalSpeed > 2400) {
    items.push('Spindle speed — rotational speed is elevated, check bearings and vibration levels');
  }

  if (input.processTemp > 313) {
    items.push('Process temperature — temperature is high, check coolant flow and ambient conditions');
  }

  // Always suggest at least one item
  if (items.length === 0) {
    items.push('Routine visual inspection — no specific concerns identified');
  }

  return items;
}

/**
 * Generate the recommended action string based on urgency.
 */
function getAction(urgency: Recommendation['urgency'], toolWear: number): string {
  switch (urgency) {
    case 'none':
      return 'No action needed. Continue normal operation.';
    case 'low':
      return 'Schedule a routine inspection during the next planned downtime.';
    case 'medium':
      if (toolWear > 150) {
        return 'Schedule tool replacement and a general maintenance check within the next shift.';
      }
      return 'Schedule a maintenance check within the next 1–2 shifts.';
    case 'high':
      if (toolWear > 200) {
        return 'Replace the tool immediately and perform a full inspection before resuming production.';
      }
      return 'Perform maintenance as soon as possible. Reduce load if the machine must keep running.';
    case 'critical':
      return 'Stop the machine immediately. Do not resume until a full inspection and repair is completed.';
  }
}

/**
 * Generate monitoring advice based on urgency.
 */
function getMonitoringAdvice(urgency: Recommendation['urgency']): string {
  switch (urgency) {
    case 'none':
      return 'Standard monitoring schedule is sufficient.';
    case 'low':
      return 'Increase sensor check frequency to every 30 minutes for the remainder of the shift.';
    case 'medium':
      return 'Monitor continuously. Set alerts for torque, temperature, and tool wear readings.';
    case 'high':
      return 'Assign an operator to watch the machine. Monitor all sensors in real-time until maintenance is performed.';
    case 'critical':
      return 'Machine should be stopped. No monitoring needed — proceed directly to maintenance.';
  }
}

// ── Agent Class ─────────────────────────────────────────────────

export class MaintenanceRecommendationAgent {

  /**
   * MCP Prompt — guides AI clients on how to use the recommendation agent.
   */
  @Prompt({
    name: 'maintenance_recommendation_agent',
    description:
      'Guides an AI assistant to use the maintenance recommendation agent tool. ' +
      'Given machine sensor readings, the agent produces practical maintenance advice ' +
      'including urgency level, recommended actions, and what to inspect.',
    arguments: [
      { name: 'type',            description: 'Machine quality type: L, M, or H', required: true },
      { name: 'airTemp',         description: 'Air temperature in Kelvin',        required: true },
      { name: 'processTemp',     description: 'Process temperature in Kelvin',    required: true },
      { name: 'rotationalSpeed', description: 'Rotational speed in RPM',          required: true },
      { name: 'torque',          description: 'Torque in Nm',                     required: true },
      { name: 'toolWear',        description: 'Tool wear in minutes',             required: true },
    ],
  })
  async recommendationPrompt(
    args: Record<string, string>,
    _ctx: ExecutionContext,
  ) {
    return [
      {
        role: 'assistant' as const,
        content:
          `You are a Maintenance Recommendation Agent. ` +
          `Use the "run_recommendation_agent" tool with these sensor readings:\n\n` +
          `- type: ${args.type ?? 'M'}\n` +
          `- airTemp: ${args.airTemp ?? '298.1'}\n` +
          `- processTemp: ${args.processTemp ?? '308.6'}\n` +
          `- rotationalSpeed: ${args.rotationalSpeed ?? '1551'}\n` +
          `- torque: ${args.torque ?? '42.8'}\n` +
          `- toolWear: ${args.toolWear ?? '0'}\n\n` +
          `IMPORTANT: Do NOT output any spec, UI JSON patch blocks, or code blocks containing {"op":"add",...} operations. ` +
          `Output ONLY clean markdown structured as follows:\n\n` +
          `### Maintenance Recommendation\n\n` +
          `**Urgency Level:** [none/low/medium/high/critical]\n\n` +
          `**Recommended Action:** [action text]\n\n` +
          `**Inspection Checklist:**\n` +
          `. [item 1]\n` +
          `. [item 2]\n\n` +
          `**Monitoring Advice:** [monitoring text]\n\n` +
          `**Summary:** [plain-English summary]`,
      },
    ];
  }

  /**
   * The Maintenance Recommendation Agent tool.
   *
   * Accepts 6 sensor values, runs the ML prediction, evaluates the
   * urgency, and returns structured maintenance advice.
   */
  @Tool({
    name: 'run_recommendation_agent',
    description:
      'Maintenance Recommendation Agent — accepts machine sensor readings, ' +
      'evaluates failure risk using the ML prediction engine, and returns practical ' +
      'maintenance advice including urgency, recommended action, inspection checklist, ' +
      'and monitoring guidance.',
    inputSchema: z.object({
      type:            z.string().describe('Machine quality type: L (Low), M (Medium), or H (High)'),
      airTemp:         z.number().describe('Air temperature in Kelvin'),
      processTemp:     z.number().describe('Process temperature in Kelvin'),
      rotationalSpeed: z.number().describe('Rotational speed in RPM'),
      torque:          z.number().describe('Torque in Nm'),
      toolWear:        z.number().describe('Tool wear in minutes'),
    }),
  })
  async runRecommendation(
    input: {
      type: string;
      airTemp: number;
      processTemp: number;
      rotationalSpeed: number;
      torque: number;
      toolWear: number;
    },
    ctx: ExecutionContext,
  ) {
    ctx.logger.info('Maintenance Recommendation Agent invoked', input);

    // ── 1. Get ML prediction (reuse existing engine) ─────────────
    const predictionResult = predict({
      type: input.type,
      airTemp: input.airTemp,
      processTemp: input.processTemp,
      rotationalSpeed: input.rotationalSpeed,
      torque: input.torque,
      toolWear: input.toolWear,
    });

    // ── 2. Determine urgency from failure probability ────────────
    const urgency = getUrgency(predictionResult.probability);

    // ── 3. Build inspection checklist from sensor values ─────────
    const inspectNext = buildInspectionList(input);

    // ── 4. Generate action and monitoring advice ─────────────────
    const action = getAction(urgency, input.toolWear);
    const monitoringAdvice = getMonitoringAdvice(urgency);

    // ── 5. Should the machine be stopped? ────────────────────────
    const shouldStop = urgency === 'critical' || (urgency === 'high' && input.toolWear > 220);

    // ── 6. Build reason string ───────────────────────────────────
    const probabilityPct = (predictionResult.probability * 100).toFixed(1);
    const confidencePct  = (predictionResult.confidence * 100).toFixed(1);
    const reason =
      `The ML model predicts a ${probabilityPct}% chance of failure ` +
      `(${confidencePct}% confidence). ` +
      `${inspectNext.length} area(s) flagged for inspection.`;

    // ── 7. Build beginner-friendly summary ───────────────────────
    let summary: string;
    switch (urgency) {
      case 'none':
        summary =
          'The machine is running well. No maintenance is needed right now. ' +
          'Keep following the normal schedule.';
        break;
      case 'low':
        summary =
          'There are minor signs worth watching, but nothing urgent. ' +
          'Plan a quick check during your next scheduled downtime.';
        break;
      case 'medium':
        summary =
          'Some readings suggest the machine may need attention soon. ' +
          `Schedule a maintenance visit within the next 1–2 shifts. ${inspectNext.length} area(s) to check.`;
        break;
      case 'high':
        summary =
          'The machine shows signs of stress and failure risk is elevated. ' +
          'Maintenance should be performed as soon as possible. ' +
          (input.toolWear > 200
            ? 'The tool is heavily worn and should be replaced first.'
            : 'Reduce the load if the machine must keep running.');
        break;
      case 'critical':
        summary =
          'The machine is at high risk of failure. Stop it immediately and ' +
          'do not restart until a full inspection and repair is completed.';
        break;
    }

    ctx.logger.info('Recommendation Agent result', { urgency, shouldStop });

    return {
      urgency,
      action,
      reason,
      inspectNext,
      shouldStop,
      monitoringAdvice,
      prediction: {
        result: predictionResult.prediction,
        probability: predictionResult.probability,
        confidence: predictionResult.confidence,
      },
      summary,
    };
  }
}
