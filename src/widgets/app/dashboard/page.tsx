'use client';

import { useTheme, useWidgetState, useWidgetSDK } from '@nitrostack/widgets';

/**
 * Predictive Maintenance Dashboard Widget (Phase 10)
 *
 * Displays the combined output from the Planner Agent in a clear,
 * visually rich dashboard. Works with all analysis modes.
 */

// ── Types ────────────────────────────────────────────────────────

interface Finding {
  sensor: string;
  value: number;
  unit: string;
  severity: 'warning' | 'critical';
  message: string;
}

interface PredictionResult {
  machineStatus?: string;
  prediction?: string;
  probability?: number;
  confidence?: number;
  summary?: string;
  result?: string;
}

interface DiagnosisResult {
  overallStatus?: string;
  findings?: Finding[];
  failureModeHints?: string[];
  prediction?: PredictionResult;
  summary?: string;
}

interface RecommendationResult {
  urgency?: string;
  action?: string;
  reason?: string;
  inspectNext?: string[];
  shouldStop?: boolean;
  monitoringAdvice?: string;
  prediction?: PredictionResult;
  summary?: string;
}

interface ReportResult {
  overallStatus?: string;
  prediction?: PredictionResult;
  diagnosticSummary?: string;
  diagnosticFindings?: Finding[];
  failureModeHints?: string[];
  urgency?: string;
  recommendedAction?: string;
  shouldStop?: boolean;
  inspectNext?: string[];
  monitoringAdvice?: string;
  actionNeededNow?: boolean;
  maintenanceSummary?: string;
  report?: string;
}

interface PlannerOutput {
  mode?: string;
  plan?: {
    agentsSelected?: string[];
    agentsExecuted?: string[];
    executionOrder?: string[];
  };
  results?: {
    prediction?: PredictionResult;
    diagnosis?: DiagnosisResult;
    recommendation?: RecommendationResult;
    report?: ReportResult;
  };
  durationMs?: number;
  summary?: string;
}

// ── Color Helpers ────────────────────────────────────────────────

function getStatusColor(status: string | undefined): string {
  switch (status?.toLowerCase()) {
    case 'critical':
    case 'failure risk':
    case 'failure':
      return '#ef4444';
    case 'warning':
      return '#f59e0b';
    case 'healthy':
    case 'no_failure':
      return '#10b981';
    default:
      return '#6b7280';
  }
}

function getUrgencyColor(urgency: string | undefined): string {
  switch (urgency) {
    case 'critical': return '#ef4444';
    case 'high':     return '#f97316';
    case 'medium':   return '#f59e0b';
    case 'low':      return '#3b82f6';
    case 'none':     return '#10b981';
    default:         return '#6b7280';
  }
}

function getStatusEmoji(status: string | undefined): string {
  switch (status?.toLowerCase()) {
    case 'critical':
    case 'failure risk':
    case 'failure':
      return '🔴';
    case 'warning':
      return '🟡';
    case 'healthy':
    case 'no_failure':
      return '🟢';
    default:
      return '⚪';
  }
}

// ── Sub-Components ───────────────────────────────────────────────

function Card({ title, icon, children, isDark, accentColor }: {
  title: string;
  icon: string;
  children: React.ReactNode;
  isDark: boolean;
  accentColor?: string;
}) {
  return (
    <div style={{
      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
      borderRadius: '14px',
      padding: '18px',
      marginBottom: '14px',
      borderLeft: `4px solid ${accentColor || (isDark ? '#6366f1' : '#4f46e5')}`,
      backdropFilter: 'blur(12px)',
      boxShadow: isDark
        ? '0 2px 12px rgba(0,0,0,0.3)'
        : '0 2px 12px rgba(0,0,0,0.08)',
      transition: 'all 0.3s ease',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
        fontSize: '15px',
        fontWeight: 700,
        color: isDark ? '#e2e8f0' : '#1e293b',
        letterSpacing: '0.01em',
      }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatBadge({ label, value, color, isDark }: {
  label: string;
  value: string;
  color: string;
  isDark: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      borderRadius: '10px',
      padding: '10px 14px',
      minWidth: '80px',
    }}>
      <span style={{
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        color: isDark ? '#94a3b8' : '#64748b',
        marginBottom: '4px',
        fontWeight: 600,
      }}>{label}</span>
      <span style={{
        fontSize: '18px',
        fontWeight: 800,
        color: color,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

function Tag({ text, color, isDark }: { text: string; color: string; isDark: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 700,
      color: '#fff',
      background: color,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.04em',
    }}>{text}</span>
  );
}

function FindingItem({ finding, isDark }: { finding: Finding; isDark: boolean }) {
  const color = finding.severity === 'critical' ? '#ef4444' : '#f59e0b';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      padding: '8px 10px',
      borderRadius: '8px',
      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      marginBottom: '6px',
      fontSize: '13px',
      color: isDark ? '#cbd5e1' : '#475569',
      lineHeight: 1.5,
    }}>
      <span style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: color,
        marginTop: '5px',
        flexShrink: 0,
      }} />
      {finding.message}
    </div>
  );
}

// ── Main Widget ─────────────────────────────────────────────────

export default function DashboardWidget() {
  const theme = useTheme();
  const { getToolOutput } = useWidgetSDK();
  const [state, setState] = useWidgetState<{ tab: 'overview' | 'details' | 'report' }>(() => ({
    tab: 'overview',
  }));

  const data = getToolOutput<PlannerOutput>();

  const isDark = theme === 'dark';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  // ── Loading state ──────────────────────────────────────────────
  if (!data) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        color: textColor,
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚙️</div>
        <div style={{ fontSize: '16px', fontWeight: 600 }}>Waiting for analysis data…</div>
        <div style={{ fontSize: '13px', color: mutedColor, marginTop: '6px' }}>
          Run the <code style={{
            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px',
          }}>run_planner_agent</code> tool to see results here.
        </div>
      </div>
    );
  }

  // ── Extract results ────────────────────────────────────────────
  const r = data.results || {};
  const pred = r.prediction || r.diagnosis?.prediction || r.recommendation?.prediction || r.report?.prediction;
  const diag = r.diagnosis || (r.report ? {
    overallStatus: r.report.overallStatus,
    findings: r.report.diagnosticFindings,
    failureModeHints: r.report.failureModeHints,
    summary: r.report.diagnosticSummary,
  } : undefined);
  const rec = r.recommendation || (r.report ? {
    urgency: r.report.urgency,
    action: r.report.recommendedAction,
    inspectNext: r.report.inspectNext,
    shouldStop: r.report.shouldStop,
    monitoringAdvice: r.report.monitoringAdvice,
    summary: r.report.maintenanceSummary,
  } : undefined);

  const overallStatus = diag?.overallStatus || pred?.machineStatus || (pred?.prediction === 'failure' ? 'Critical' : pred?.prediction === 'no_failure' ? 'Healthy' : 'Unknown');
  const probability = pred?.probability ?? 0;
  const confidence = pred?.confidence ?? 0;
  const urgency = rec?.urgency;
  const activeTab = state?.tab || 'overview';

  // ── Tab buttons ────────────────────────────────────────────────
  const tabs: { key: 'overview' | 'details' | 'report'; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'details',  label: 'Details',  icon: '🔍' },
    { key: 'report',   label: 'Report',   icon: '📋' },
  ];

  return (
    <div style={{
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      color: textColor,
      maxWidth: '520px',
      padding: '0',
    }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        background: isDark
          ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)'
          : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)',
        borderRadius: '16px 16px 0 0',
        padding: '22px 22px 18px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.1em', opacity: 0.8, fontWeight: 600 }}>
              Predictive Maintenance
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Machine Health Dashboard
            </h2>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '12px',
            padding: '8px 14px',
            backdropFilter: 'blur(8px)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '24px' }}>{getStatusEmoji(overallStatus)}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>
              {overallStatus}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginTop: '16px',
        }}>
          <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.12)',
            borderRadius: '10px',
            padding: '10px',
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase' as const, opacity: 0.7, letterSpacing: '0.05em' }}>Failure Prob.</div>
            <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
              {(probability * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.12)',
            borderRadius: '10px',
            padding: '10px',
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase' as const, opacity: 0.7, letterSpacing: '0.05em' }}>Confidence</div>
            <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
              {(confidence * 100).toFixed(1)}%
            </div>
          </div>
          {urgency && (
            <div style={{
              flex: 1,
              background: 'rgba(255,255,255,0.12)',
              borderRadius: '10px',
              padding: '10px',
              textAlign: 'center',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase' as const, opacity: 0.7, letterSpacing: '0.05em' }}>Urgency</div>
              <div style={{
                fontSize: '15px',
                fontWeight: 800,
                marginTop: '4px',
                textTransform: 'uppercase' as const,
                color: getUrgencyColor(urgency),
              }}>
                {urgency}
              </div>
            </div>
          )}
        </div>

        {/* Mode badge */}
        {data.mode && (
          <div style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            opacity: 0.8,
          }}>
            <span>Mode:</span>
            <Tag text={data.mode} color="rgba(255,255,255,0.25)" isDark={isDark} />
            {data.durationMs !== undefined && (
              <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6 }}>
                ⏱ {data.durationMs}ms
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        background: isDark ? '#1e1e2e' : '#f1f5f9',
        padding: '4px',
        gap: '2px',
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setState({ tab: t.key })}
            style={{
              flex: 1,
              padding: '8px 4px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeTab === t.key ? 700 : 500,
              background: activeTab === t.key
                ? (isDark ? 'rgba(99,102,241,0.3)' : '#fff')
                : 'transparent',
              color: activeTab === t.key
                ? (isDark ? '#a5b4fc' : '#4f46e5')
                : mutedColor,
              boxShadow: activeTab === t.key
                ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)')
                : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Content Area ───────────────────────────────────────── */}
      <div style={{
        background: isDark
          ? 'linear-gradient(180deg, #1e1e2e 0%, #171726 100%)'
          : 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        borderRadius: '0 0 16px 16px',
        padding: '18px',
        minHeight: '200px',
      }}>
        {/* ── OVERVIEW TAB ───────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            {/* Prediction Card */}
            {pred && (
              <Card title="Prediction" icon="🤖" isDark={isDark} accentColor={getStatusColor(pred.prediction || pred.result)}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
                  <StatBadge
                    label="Result"
                    value={pred.prediction === 'failure' || pred.result === 'failure' ? 'FAILURE' : 'OK'}
                    color={getStatusColor(pred.prediction || pred.result)}
                    isDark={isDark}
                  />
                  <StatBadge
                    label="Probability"
                    value={`${(probability * 100).toFixed(1)}%`}
                    color={getStatusColor(probability >= 0.5 ? 'failure' : 'healthy')}
                    isDark={isDark}
                  />
                  <StatBadge
                    label="Confidence"
                    value={`${(confidence * 100).toFixed(1)}%`}
                    color={isDark ? '#a5b4fc' : '#6366f1'}
                    isDark={isDark}
                  />
                </div>
                {pred.summary && (
                  <p style={{ fontSize: '13px', color: mutedColor, marginTop: '12px', lineHeight: 1.6 }}>
                    {pred.summary}
                  </p>
                )}
              </Card>
            )}

            {/* Recommendation Card */}
            {rec && (
              <Card title="Recommendation" icon="🔧" isDark={isDark} accentColor={getUrgencyColor(urgency)}>
                {rec.shouldStop && (
                  <div style={{
                    background: '#ef44441a',
                    border: '1px solid #ef444440',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    ⚠️ STOP THE MACHINE — do not continue operation.
                  </div>
                )}
                {rec.action && (
                  <p style={{ fontSize: '13px', color: textColor, margin: '0 0 8px', fontWeight: 600 }}>
                    {rec.action}
                  </p>
                )}
                {rec.summary && (
                  <p style={{ fontSize: '13px', color: mutedColor, margin: 0, lineHeight: 1.6 }}>
                    {rec.summary}
                  </p>
                )}
              </Card>
            )}

            {/* Diagnosis summary */}
            {diag && !pred && !rec && (
              <Card title="Diagnosis" icon="🩺" isDark={isDark} accentColor={getStatusColor(diag.overallStatus)}>
                <Tag text={diag.overallStatus || 'Unknown'} color={getStatusColor(diag.overallStatus)} isDark={isDark} />
                {diag.summary && (
                  <p style={{ fontSize: '13px', color: mutedColor, marginTop: '10px', lineHeight: 1.6 }}>
                    {diag.summary}
                  </p>
                )}
              </Card>
            )}

            {/* Execution plan */}
            {data.plan && (
              <Card title="Execution Plan" icon="📐" isDark={isDark}>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
                  {data.plan.agentsExecuted?.map((a, i) => (
                    <span key={i} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: isDark ? 'rgba(99,102,241,0.2)' : 'rgba(79,70,229,0.1)',
                      color: isDark ? '#a5b4fc' : '#4f46e5',
                    }}>
                      ✓ {a.replace('Agent', '')}
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── DETAILS TAB ────────────────────────────────────── */}
        {activeTab === 'details' && (
          <>
            {/* Diagnostic findings */}
            {diag?.findings && diag.findings.length > 0 && (
              <Card title={`Abnormal Readings (${diag.findings.length})`} icon="⚠️" isDark={isDark} accentColor="#f59e0b">
                {diag.findings.map((f, i) => (
                  <FindingItem key={i} finding={f} isDark={isDark} />
                ))}
              </Card>
            )}

            {/* Failure mode hints */}
            {diag?.failureModeHints && diag.failureModeHints.length > 0 && (
              <Card title={`Failure Patterns (${diag.failureModeHints.length})`} icon="🔥" isDark={isDark} accentColor="#ef4444">
                {diag.failureModeHints.map((hint, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
                    marginBottom: '6px',
                    fontSize: '13px',
                    color: isDark ? '#fca5a5' : '#b91c1c',
                    lineHeight: 1.5,
                  }}>
                    {hint}
                  </div>
                ))}
              </Card>
            )}

            {/* Inspection checklist */}
            {rec?.inspectNext && rec.inspectNext.length > 0 && (
              <Card title="Inspection Checklist" icon="✅" isDark={isDark} accentColor="#3b82f6">
                {rec.inspectNext.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '6px 0',
                    fontSize: '13px',
                    color: isDark ? '#cbd5e1' : '#475569',
                    lineHeight: 1.5,
                    borderBottom: i < rec.inspectNext!.length - 1
                      ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
                      : 'none',
                  }}>
                    <span style={{ flexShrink: 0, marginTop: '1px' }}>☐</span>
                    {item}
                  </div>
                ))}
              </Card>
            )}

            {/* Monitoring advice */}
            {rec?.monitoringAdvice && (
              <Card title="Monitoring" icon="👁️" isDark={isDark}>
                <p style={{ fontSize: '13px', color: mutedColor, margin: 0, lineHeight: 1.6 }}>
                  {rec.monitoringAdvice}
                </p>
              </Card>
            )}

            {/* Empty state */}
            {!diag?.findings?.length && !diag?.failureModeHints?.length && !rec?.inspectNext?.length && (
              <div style={{ textAlign: 'center', padding: '30px', color: mutedColor }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✨</div>
                <div style={{ fontSize: '14px' }}>No detailed findings to display.</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  Run in <strong>diagnosis</strong>, <strong>report</strong>, or <strong>full</strong> mode for details.
                </div>
              </div>
            )}
          </>
        )}

        {/* ── REPORT TAB ─────────────────────────────────────── */}
        {activeTab === 'report' && (
          <>
            {r.report?.report ? (
              <Card title="Full Report" icon="📋" isDark={isDark}>
                <pre style={{
                  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                  fontSize: '12px',
                  lineHeight: 1.6,
                  color: isDark ? '#cbd5e1' : '#334155',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word' as const,
                  margin: 0,
                  padding: '14px',
                  background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)',
                  borderRadius: '10px',
                  maxHeight: '400px',
                  overflow: 'auto',
                }}>
                  {r.report.report}
                </pre>
              </Card>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: mutedColor }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                <div style={{ fontSize: '14px' }}>No report available.</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  Run in <strong>report</strong> or <strong>full</strong> mode to generate a complete report.
                </div>
              </div>
            )}

            {data.summary && (
              <Card title="Summary" icon="💬" isDark={isDark}>
                <p style={{ fontSize: '13px', color: mutedColor, margin: 0, lineHeight: 1.6 }}>
                  {data.summary}
                </p>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 18px',
        fontSize: '11px',
        color: mutedColor,
      }}>
        <span>⚡ NitroStack Predictive Maintenance</span>
        <span style={{ fontSize: '10px' }}>
          Theme: {theme || 'light'}
        </span>
      </div>
    </div>
  );
}
