import {
  ToolDecorator as Tool,
  PromptDecorator as Prompt,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { predict } from '../../ml/prediction-engine.js';

/**
 * Prediction Agent (Phase 5)
 *
 * A simple agent that wraps the existing predict_machine_failure MCP tool.
 * It accepts machine sensor values, runs the prediction engine,
 * and returns a structured, beginner-friendly response.
 *
 * This agent does NOT duplicate ML or dataset logic —
 * it reuses the predict() function from src/ml/prediction-engine.ts.
 */
export class PredictionAgent {

  /**
   * MCP Prompt — tells AI clients how to use the prediction agent tool.
   */
  @Prompt({
    name: 'prediction_agent',
    description:
      'Guides an AI assistant to use the prediction agent tool for machine failure analysis. ' +
      'Provides context on the expected sensor inputs and how to interpret the results.',
    arguments: [
      {
        name: 'type',
        description: 'Machine quality type: L (Low), M (Medium), or H (High)',
        required: true,
      },
      {
        name: 'airTemp',
        description: 'Air temperature in Kelvin (e.g. 298.1)',
        required: true,
      },
      {
        name: 'processTemp',
        description: 'Process temperature in Kelvin (e.g. 308.6)',
        required: true,
      },
      {
        name: 'rotationalSpeed',
        description: 'Rotational speed in RPM (e.g. 1551)',
        required: true,
      },
      {
        name: 'torque',
        description: 'Torque in Nm (e.g. 42.8)',
        required: true,
      },
      {
        name: 'toolWear',
        description: 'Tool wear in minutes (e.g. 0–250)',
        required: true,
      },
    ],
  })
  async predictionAgentPrompt(
    args: Record<string, string>,
    _ctx: ExecutionContext
  ) {
    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text:
            `You are a Predictive Maintenance Agent. ` +
            `Use the "run_prediction_agent" tool with the following sensor readings:\n\n` +
            `- type: ${args.type ?? 'M'}\n` +
            `- airTemp: ${args.airTemp ?? '298.1'}\n` +
            `- processTemp: ${args.processTemp ?? '308.6'}\n` +
            `- rotationalSpeed: ${args.rotationalSpeed ?? '1551'}\n` +
            `- torque: ${args.torque ?? '42.8'}\n` +
            `- toolWear: ${args.toolWear ?? '0'}\n\n` +
            `Interpret the result and explain whether the machine is healthy or at risk of failure. ` +
            `Use plain, beginner-friendly language.`,
        },
      },
    ];
  }

  /**
   * The Prediction Agent tool.
   *
   * Accepts 6 sensor values, calls the existing prediction engine,
   * and returns a structured response with:
   *   - machineStatus: "Healthy" or "Failure Risk"
   *   - prediction: the raw prediction label
   *   - probability: failure probability (0–1)
   *   - confidence: model confidence (0–1)
   *   - summary: a short, beginner-friendly explanation
   */
  @Tool({
    name: 'run_prediction_agent',
    description:
      'Prediction Agent — accepts machine sensor readings, runs the ML prediction engine, ' +
      'and returns a structured assessment with status, probability, confidence, and a plain-English summary.',
    inputSchema: z.object({
      type: z.string().describe('Machine quality type: L (Low), M (Medium), or H (High)'),
      airTemp: z.number().describe('Air temperature in Kelvin'),
      processTemp: z.number().describe('Process temperature in Kelvin'),
      rotationalSpeed: z.number().describe('Rotational speed in RPM'),
      torque: z.number().describe('Torque in Nm'),
      toolWear: z.number().describe('Tool wear in minutes'),
    }),
  })
  async runPrediction(
    input: {
      type: string;
      airTemp: number;
      processTemp: number;
      rotationalSpeed: number;
      torque: number;
      toolWear: number;
    },
    ctx: ExecutionContext
  ) {
    ctx.logger.info('Prediction Agent invoked', input);

    // ── Call the existing prediction engine (reuse, no duplication) ──
    const result = predict({
      type: input.type,
      airTemp: input.airTemp,
      processTemp: input.processTemp,
      rotationalSpeed: input.rotationalSpeed,
      torque: input.torque,
      toolWear: input.toolWear,
    });

    // ── Build the agent-style structured response ──
    const isFailure = result.prediction === 'failure';
    const machineStatus = isFailure ? 'Failure Risk' : 'Healthy';
    const probabilityPct = (result.probability * 100).toFixed(1);
    const confidencePct = (result.confidence * 100).toFixed(1);

    let summary: string;
    if (isFailure) {
      summary =
        `The machine is at risk of failure. ` +
        `The model predicts a ${probabilityPct}% chance of failure ` +
        `with ${confidencePct}% confidence. ` +
        `Consider scheduling maintenance soon.`;
    } else {
      summary =
        `The machine appears to be operating normally. ` +
        `The failure probability is only ${probabilityPct}%, ` +
        `and the model is ${confidencePct}% confident in this assessment.`;
    }

    ctx.logger.info('Prediction Agent result', { machineStatus, prediction: result.prediction });

    return {
      machineStatus,
      prediction: result.prediction,
      probability: result.probability,
      confidence: result.confidence,
      summary,
    };
  }
}
