import { Module } from '@nitrostack/core';
import { DiagnosticAgent } from './diagnostic.agent.js';

/**
 * Diagnostic Module (Phase 6)
 *
 * Registers the Diagnostic Agent controller.
 * The agent analyses sensor readings against known thresholds
 * and failure-mode patterns from the AI4I 2020 dataset.
 */
@Module({
  name: 'diagnostic',
  description: 'Diagnostic Agent for machine health analysis',
  controllers: [DiagnosticAgent],
})
export class DiagnosticModule {}
