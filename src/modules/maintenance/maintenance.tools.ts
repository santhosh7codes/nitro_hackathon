import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { getMachineByUdi, getDatasetStats } from '../../data/dataset.js';
import { predict } from '../../ml/prediction-engine.js';

/**
 * Maintenance Tools
 *
 * Contains MCP tools for the predictive maintenance system.
 *
 * Tools:
 * - ping: Health check (Phase 1)
 * - get_machine: Look up a machine record by UDI (Phase 2)
 * - get_dataset_stats: Get summary statistics about the dataset (Phase 2)
 * - predict_machine_failure: Predict machine failure from sensor readings (Phase 4)
 */
export class MaintenanceTools {
  /**
   * Simple health-check tool that confirms the MCP server is responding.
   * Useful for testing connectivity from an AI agent or MCP client.
   */
  @Tool({
    name: 'ping',
    description: 'Check if the Predictive Maintenance MCP server is alive and responding',
    inputSchema: z.object({
      message: z.string().optional().describe('Optional message to echo back')
    })
  })
  async ping(input: { message?: string }, ctx: ExecutionContext) {
    ctx.logger.info('Ping received', { message: input.message });

    return {
      status: 'ok',
      server: 'predictive-maintenance-server',
      timestamp: new Date().toISOString(),
      echo: input.message ?? 'pong'
    };
  }

  /**
   * Look up a single machine record from the AI4I 2020 dataset by its UDI.
   * Returns the full sensor readings and failure status for that machine.
   */
  @Tool({
    name: 'get_machine',
    description: 'Retrieve a machine record from the AI4I predictive maintenance dataset by UDI (1–10000)',
    inputSchema: z.object({
      udi: z.number().int().min(1).describe('Unique Device Identifier (1–10000)')
    })
  })
  async getMachine(input: { udi: number }, ctx: ExecutionContext) {
    ctx.logger.info('Looking up machine', { udi: input.udi });

    const machine = getMachineByUdi(input.udi);

    if (!machine) {
      return {
        found: false,
        udi: input.udi,
        message: `No machine found with UDI ${input.udi}`
      };
    }

    return {
      found: true,
      machine
    };
  }

  /**
   * Get summary statistics about the loaded AI4I dataset.
   * Useful for agents to understand the data before running analysis.
   */
  @Tool({
    name: 'get_dataset_stats',
    description: 'Get summary statistics about the AI4I predictive maintenance dataset (row count, failure rate, type breakdown)',
    inputSchema: z.object({})
  })
  async getStats(_input: Record<string, never>, ctx: ExecutionContext) {
    ctx.logger.info('Fetching dataset statistics');

    const stats = getDatasetStats();
    return stats;
  }

  /**
   * Predict whether a machine will fail based on its current sensor readings.
   * Uses a logistic regression model trained on the AI4I 2020 dataset.
   * The model auto-trains on first invocation.
   */
  @Tool({
    name: 'predict_machine_failure',
    description: 'Predict whether a machine will fail based on 6 sensor readings. Returns a failure/no_failure prediction with probability and confidence scores.',
    inputSchema: z.object({
      type: z.string().describe('Machine quality type: L (Low), M (Medium), or H (High)'),
      airTemp: z.number().describe('Air temperature in Kelvin'),
      processTemp: z.number().describe('Process temperature in Kelvin'),
      rotationalSpeed: z.number().describe('Rotational speed in RPM'),
      torque: z.number().describe('Torque in Nm'),
      toolWear: z.number().describe('Tool wear in minutes')
    })
  })
  async predictMachineFailure(
    input: { type: string; airTemp: number; processTemp: number; rotationalSpeed: number; torque: number; toolWear: number },
    ctx: ExecutionContext
  ) {
    ctx.logger.info('Predicting machine failure', input);

    const result = predict({
      type: input.type,
      airTemp: input.airTemp,
      processTemp: input.processTemp,
      rotationalSpeed: input.rotationalSpeed,
      torque: input.torque,
      toolWear: input.toolWear,
    });

    return {
      prediction: result.prediction,
      probability: result.probability,
      confidence: result.confidence,
    };
  }
}

