import { Module } from '@nitrostack/core';
import { MaintenanceRecommendationAgent } from './recommendation.agent.js';

/**
 * Recommendation Module (Phase 7)
 *
 * Registers the Maintenance Recommendation Agent controller.
 * The agent uses the ML prediction engine to evaluate failure risk
 * and produces practical maintenance advice.
 */
@Module({
  name: 'recommendation',
  description: 'Maintenance Recommendation Agent for actionable maintenance advice',
  controllers: [MaintenanceRecommendationAgent],
})
export class RecommendationModule {}
