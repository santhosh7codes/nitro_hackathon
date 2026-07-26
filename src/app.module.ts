import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { MaintenanceModule } from './modules/maintenance/maintenance.module.js';
import { PredictionModule } from './modules/prediction/prediction.module.js';
import { DiagnosticModule } from './modules/diagnostic/diagnostic.module.js';
import { RecommendationModule } from './modules/recommendation/recommendation.module.js';
import { ReportModule } from './modules/report/report.module.js';
import { PlannerModule } from './modules/planner/planner.module.js';
import { SystemHealthCheck } from './health/system.health.js';

/**
 * Root Application Module
 *
 * This is the main module that bootstraps the Predictive Maintenance MCP server.
 * It registers all feature modules and health checks.
 *
 * Currently imports:
 * - ConfigModule: Environment and configuration management
 * - MaintenanceModule: Predictive maintenance tools (Phases 1–4)
 * - PredictionModule: Prediction Agent (Phase 5)
 * - DiagnosticModule: Diagnostic Agent (Phase 6)
 * - RecommendationModule: Maintenance Recommendation Agent (Phase 7)
 * - ReportModule: Report Agent (Phase 8)
 * - PlannerModule: Planner Agent (Phase 9)
 * - SystemHealthCheck: Basic system health monitoring
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'predictive-maintenance-server',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Predictive Maintenance root application module',
  imports: [
    ConfigModule.forRoot(),
    MaintenanceModule,
    PredictionModule,
    DiagnosticModule,
    RecommendationModule,
    ReportModule,
    PlannerModule,
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
  ]
})
export class AppModule {}
