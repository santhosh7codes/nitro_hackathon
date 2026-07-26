import { Module } from '@nitrostack/core';
import { ReportAgent } from './report.agent.js';

/**
 * Report Module (Phase 8)
 *
 * Registers the Report Agent controller.
 * The agent combines outputs from the Diagnostic Agent and
 * Maintenance Recommendation Agent into a unified health report.
 */
@Module({
  name: 'report',
  description: 'Report Agent for combined machine-health reports',
  controllers: [ReportAgent],
})
export class ReportModule {}
