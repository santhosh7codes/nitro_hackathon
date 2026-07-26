import { Module } from '@nitrostack/core';
import { PredictionAgent } from './prediction.agent.js';

/**
 * Prediction Module (Phase 5)
 *
 * Registers the Prediction Agent controller.
 * The agent reuses the prediction engine from Phase 3
 * and wraps it with a structured, beginner-friendly interface.
 */
@Module({
  name: 'prediction',
  description: 'Prediction Agent for machine failure analysis',
  controllers: [PredictionAgent],
})
export class PredictionModule {}
