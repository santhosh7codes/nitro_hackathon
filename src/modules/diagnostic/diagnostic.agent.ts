import {
  ToolDecorator as Tool,
  PromptDecorator as Prompt,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { predict } from '../../ml/prediction-engine.js';

/**
 * Diagnostic Agent (Phase 6)
 *
 * Analyzes machine sensor readings and produces a beginner-friendly
 * diagnosis explaining possible health issues.
 *
 * How it works:
 *   1. Checks each sensor value against known safe/warning thresholds
 *      derived from the AI4I 2020 dataset.
 *   2. Collects any abnormal findings into a list.
 *   3. Calls the existing predict() function to get the ML prediction.
 *   4. Returns a structured result with the diagnosis and prediction.
 *
 * No ML or dataset logic is duplicated — this agent reuses predict()
 * from src/ml/prediction-engine.ts.
 */

// ── Threshold Constants ─────────────────────────────────────────
//
// These thresholds are based on the AI4I 2020 dataset statistics.
// The dataset has ~10,000 records with these approximate ranges:
//   Air temp:         295–304 K   (mean ~300 K)
//   Process temp:     305–314 K   (mean ~310 K)
//   Rotational speed: 1168–2886 rpm (mean ~1539 rpm)
//   Torque:           3.8–76.6 Nm  (mean ~40 Nm)
//   Tool wear:        0–253 min

const THRESHOLDS = {
  airTemp:         { low: 295.5, high: 303.5, unit: 'K',   label: 'Air temperature' },
  processTemp:     { low: 306.0, high: 313.0, unit: 'K',   label: 'Process temperature' },
  rotationalSpeed: { low: 1200,  high: 2400,  unit: 'rpm', label: 'Rotational speed' },
  torque:          { low: 15,    high: 65,     unit: 'Nm',  label: 'Torque' },
  toolWear:        { low: 0,     high: 200,    unit: 'min', label: 'Tool wear' },
} as const;

// ── Helper: threshold check ─────────────────────────────────────

export interface Finding {
  sensor: string;
  value: number;
  unit: string;
  severity: 'warning' | 'critical';
  message: string;
}

function checkThreshold(
  name: keyof typeof THRESHOLDS,
  value: number,
): Finding | null {
  const t = THRESHOLDS[name];

  // Critical: far outside range (> 1.5× beyond boundary)
  const criticalMarginLow  = t.low  - (t.high - t.low) * 0.25;
  const criticalMarginHigh = t.high + (t.high - t.low) * 0.25;

  if (value < criticalMarginLow) {
    return {
      sensor: t.label, value, unit: t.unit, severity: 'critical',
      message: `${t.label} is critically low at ${value} ${t.unit} (expected ${t.low}–${t.high} ${t.unit}).`,
    };
  }
  if (value > criticalMarginHigh) {
    return {
      sensor: t.label, value, unit: t.unit, severity: 'critical',
      message: `${t.label} is critically high at ${value} ${t.unit} (expected ${t.low}–${t.high} ${t.unit}).`,
    };
  }

  // Warning: outside normal range but not critical
  if (value < t.low) {
    return {
      sensor: t.label, value, unit: t.unit, severity: 'warning',
      message: `${t.label} is below normal at ${value} ${t.unit} (expected ${t.low}–${t.high} ${t.unit}).`,
    };
  }
  if (value > t.high) {
    return {
      sensor: t.label, value, unit: t.unit, severity: 'warning',
      message: `${t.label} is above normal at ${value} ${t.unit} (expected ${t.low}–${t.high} ${t.unit}).`,
    };
  }

  return null; // within normal range
}

// ── Failure-mode hints ──────────────────────────────────────────
//
// The AI4I dataset defines 5 failure modes. We check for the
// conditions that commonly cause each one.

function detectFailureModeHints(input: {
  airTemp: number;
  processTemp: number;
  rotationalSpeed: number;
  torque: number;
  toolWear: number;
}): string[] {
  const hints: string[] = [];

  // Heat Dissipation Failure (HDF): temp difference < 8.6 K and speed < 1380
  const tempDiff = input.processTemp - input.airTemp;
  if (tempDiff < 8.6 && input.rotationalSpeed < 1380) {
    hints.push(
      'Heat dissipation risk: the temperature difference between process and air is small ' +
      `(${tempDiff.toFixed(1)} K) while speed is low (${input.rotationalSpeed} rpm). ` +
      'Heat may not be dissipating properly.'
    );
  }

  // Overstrain Failure (OSF): torque × tool wear exceeds product-specific limit
  // Simplified: torque > 60 Nm with significant tool wear
  if (input.torque > 60 && input.toolWear > 150) {
    hints.push(
      `Overstrain risk: high torque (${input.torque} Nm) combined with significant ` +
      `tool wear (${input.toolWear} min) can overstrain the machine.`
    );
  }

  // Power Failure (PWF): power = torque × (2π × speed / 60)
  const power = input.torque * (2 * Math.PI * input.rotationalSpeed / 60);
  if (power < 3500 || power > 9000) {
    hints.push(
      `Power anomaly: computed power is ${Math.round(power)} W ` +
      `(normal range ≈ 3500–9000 W). This may indicate a power failure condition.`
    );
  }

  // Tool Wear Failure (TWF): tool wear between 200–240 min
  if (input.toolWear >= 200 && input.toolWear <= 253) {
    hints.push(
      `Tool wear failure risk: tool wear is ${input.toolWear} min, ` +
      'which is in the high-wear zone (200–253 min) where tool breakage becomes likely.'
    );
  }

  return hints;
}

// ── Agent Class ─────────────────────────────────────────────────

export class DiagnosticAgent {

  /**
   * MCP Prompt — guides AI clients on how to use the diagnostic agent.
   */
  @Prompt({
    name: 'diagnostic_agent',
    description:
      'Guides an AI assistant to use the diagnostic agent tool for analysing ' +
      'machine sensor readings and identifying possible health issues.',
    arguments: [
      { name: 'type',            description: 'Machine quality type: L, M, or H', required: true },
      { name: 'airTemp',         description: 'Air temperature in Kelvin',        required: true },
      { name: 'processTemp',     description: 'Process temperature in Kelvin',    required: true },
      { name: 'rotationalSpeed', description: 'Rotational speed in RPM',          required: true },
      { name: 'torque',          description: 'Torque in Nm',                     required: true },
      { name: 'toolWear',        description: 'Tool wear in minutes',             required: true },
    ],
  })
  async diagnosticAgentPrompt(
    args: Record<string, string>,
    _ctx: ExecutionContext,
  ) {
    return [
      {
        role: 'assistant' as const,
        content:
          `You are a Machine Diagnostic Agent. ` +
          `Use the "run_diagnostic_agent" tool with these sensor readings:\n\n` +
          `- type: ${args.type ?? 'M'}\n` +
          `- airTemp: ${args.airTemp ?? '298.1'}\n` +
          `- processTemp: ${args.processTemp ?? '308.6'}\n` +
          `- rotationalSpeed: ${args.rotationalSpeed ?? '1551'}\n` +
          `- torque: ${args.torque ?? '42.8'}\n` +
          `- toolWear: ${args.toolWear ?? '0'}\n\n` +
          `IMPORTANT: Do NOT output any spec, UI JSON patch blocks, or code blocks containing {"op":"add",...} operations. ` +
          `Output ONLY clean markdown structured as follows:\n\n` +
          `### Diagnostic Report\n\n` +
          `**Overall Status:** [Healthy/Warning/Critical]\n\n` +
          `**Findings:** List any abnormal sensor readings as bullet points.\n\n` +
          `**Failure-Mode Warnings:** List any detected failure patterns as bullet points.\n\n` +
          `**ML Prediction:** Failure probability and confidence percentage.\n\n` +
          `**Summary:** Plain-English explanation of the machine health.`,
      },
    ];
  }

  /**
   * The Diagnostic Agent tool.
   *
   * Accepts 6 sensor values, checks each against known thresholds,
   * detects common failure-mode patterns, runs the ML prediction,
   * and returns a structured diagnosis.
   */
  @Tool({
    name: 'run_diagnostic_agent',
    description:
      'Diagnostic Agent — analyses machine sensor readings to identify abnormal values, ' +
      'possible stress conditions, and likely failure indicators. Returns a structured diagnosis ' +
      'with findings, failure-mode hints, ML prediction, and a plain-English summary.',
    inputSchema: z.object({
      type:            z.string().describe('Machine quality type: L (Low), M (Medium), or H (High)'),
      airTemp:         z.number().describe('Air temperature in Kelvin'),
      processTemp:     z.number().describe('Process temperature in Kelvin'),
      rotationalSpeed: z.number().describe('Rotational speed in RPM'),
      torque:          z.number().describe('Torque in Nm'),
      toolWear:        z.number().describe('Tool wear in minutes'),
    }),
  })
  async runDiagnostic(
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
    ctx.logger.info('Diagnostic Agent invoked', input);

    // ── 1. Threshold checks ──────────────────────────────────────
    const findings: Finding[] = [];
    for (const key of Object.keys(THRESHOLDS) as (keyof typeof THRESHOLDS)[]) {
      const finding = checkThreshold(key, input[key]);
      if (finding) findings.push(finding);
    }

    // ── 2. Failure-mode hints ────────────────────────────────────
    const failureModeHints = detectFailureModeHints(input);

    // ── 3. ML prediction (reuse existing engine, no duplication) ─
    const prediction = predict({
      type: input.type,
      airTemp: input.airTemp,
      processTemp: input.processTemp,
      rotationalSpeed: input.rotationalSpeed,
      torque: input.torque,
      toolWear: input.toolWear,
    });

    // ── 4. Determine overall health status ───────────────────────
    //
    // The status must be consistent with the ML prediction.
    // We combine sensor threshold findings with the ML probability
    // so that "Critical" is only used when the data truly supports it.
    //
    //   Critical:  ML predicts failure (prob ≥ 50%)
    //              OR critical sensor readings AND ML prob ≥ 30%
    //   Warning:   ML prob ≥ 10%
    //              OR any abnormal sensor readings
    //              OR any failure-mode hints
    //   Healthy:   Everything else
    //
    const hasCritical = findings.some(f => f.severity === 'critical');
    const hasWarning  = findings.some(f => f.severity === 'warning');
    const isFailure   = prediction.prediction === 'failure';
    const prob        = prediction.probability;

    let overallStatus: 'Healthy' | 'Warning' | 'Critical';
    if (isFailure || (hasCritical && prob >= 0.30)) {
      overallStatus = 'Critical';
    } else if (hasCritical || hasWarning || failureModeHints.length > 0 || prob >= 0.10) {
      overallStatus = 'Warning';
    } else {
      overallStatus = 'Healthy';
    }

    // ── 5. Build beginner-friendly summary ───────────────────────
    const probPct = (prob * 100).toFixed(1);
    let summary: string;
    if (overallStatus === 'Healthy') {
      summary =
        'All sensor readings are within normal ranges. ' +
        'The machine appears healthy and no immediate issues were detected.';
    } else if (overallStatus === 'Warning') {
      const parts: string[] = [];
      if (findings.length > 0) {
        parts.push(`${findings.length} abnormal sensor reading(s) detected`);
      }
      if (failureModeHints.length > 0) {
        parts.push(`${failureModeHints.length} potential failure pattern(s) found`);
      }
      parts.push(`the ML model estimates a ${probPct}% chance of failure`);
      summary =
        `Some readings are outside normal ranges. ` +
        parts.join(', ') + '. ' +
        `Monitor the machine closely and schedule an inspection.`;
    } else {
      summary =
        `Critical issues detected. ` +
        `The ML model predicts a ${probPct}% chance of failure. ` +
        `${findings.filter(f => f.severity === 'critical').length} critical reading(s) found. ` +
        `Immediate attention is recommended.`;
    }

    ctx.logger.info('Diagnostic Agent result', { overallStatus });

    return {
      overallStatus,
      findings,
      failureModeHints,
      prediction: {
        result: prediction.prediction,
        probability: prediction.probability,
        confidence: prediction.confidence,
      },
      summary,
    };
  }
}
