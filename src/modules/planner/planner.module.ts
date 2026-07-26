import { Module } from '@nitrostack/core';
import { PlannerAgent } from './planner.agent.js';

/**
 * Planner Module (Phase 9)
 *
 * Registers the Planner Agent controller.
 * The planner orchestrates the other agents based on the
 * requested analysis mode.
 */
@Module({
  name: 'planner',
  description: 'Planner Agent for orchestrating machine-health analysis',
  controllers: [PlannerAgent],
})
export class PlannerModule {}
