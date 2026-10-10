import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  Activity,
  Timer,
  TriangleAlert,
  Clock,
  Pencil,
  SearchCheck,
  RefreshCw,
  CheckCircle2,
  Info,
  Globe2,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api';
import type { Monitor, Analytics, Check, Incident, IncidentDiagnosis, Paginated } from '../types';
import {
  LoadingSkeleton,
  ErrorState,
  MetricCard,
  StatusBadge,
  UptimeBar,
  percent,
  milliseconds,
  localDateTime,
  duration,
  EmptyState,
} from '../components/ui';
import { ResponseTimeChart } from '../components/ResponseTimeChart';
import { AddMonitorDialog } from '../components/AddMonitorDialog';
import { MonitorActions } from '../components/MonitorTable';
export function MonitorDetails() {
  const { id } = useParams();
  const diagnosisRef = useRef<HTMLElement>(null);
  const [days, setDays] = useState(1),
    [edit, setEdit] = useState(false),
    [page, setPage] = useState(1),
    [showDiagnosis, setShowDiagnosis] = useState(false);
  const monitor = useQuery({
    queryKey: ['monitor', id],
    queryFn: () => api<Monitor>(`/monitors/${id}`),
    refetchInterval: 15000,
  });
  const stats = useQuery({
    queryKey: ['analytics', id, days],
    queryFn: () => api<Analytics>(`/monitors/${id}/analytics?days=${days}`),
    refetchInterval: 15000,
  });
  const checks = useQuery({
    queryKey: ['checks', id, page],
    queryFn: () => api<Paginated<Check>>(`/monitors/${id}/checks?limit=10&page=${page}`),
    refetchInterval: 15000,
  });
  const incidents = useQuery({
    queryKey: ['monitor-incidents', id],
    queryFn: () => api<Paginated<Incident>>(`/monitors/${id}/incidents`),
    refetchInterval: 15000,
  });
  const diagnosis = useQuery({
    queryKey: ['incident-diagnosis', id],
    queryFn: () => api<IncidentDiagnosis>(`/monitors/${id}/diagnosis`),
    enabled: showDiagnosis,
  });
  useEffect(() => {
    if (!showDiagnosis) return;
    requestAnimationFrame(() =>
      diagnosisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, [showDiagnosis]);
  if (monitor.isPending || stats.isPending || checks.isPending || incidents.isPending)
    return <LoadingSkeleton />;
  const error = monitor.error ?? stats.error ?? checks.error ?? incidents.error;
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void monitor.refetch();
          void stats.refetch();
          void checks.refetch();
          void incidents.refetch();
        }}
      />
    );
  const m = monitor.data!,
    s = stats.data!;
  return (
    <>
      <Link className="back-link" to={m.websiteId ? `/websites/${m.websiteId}` : '/monitors'}>
        <ArrowLeft size={14} />
        {m.websiteId ? 'Back to website' : 'Back to monitors'}
      </Link>
      <div className="page-heading">
        <div>
          <div className="detail-status">
            <StatusBadge status={m.currentStatus} />
            <span>Checks every {m.intervalSeconds}s</span>
          </div>
          <h1>{m.name}</h1>
          <a className="monitor-detail-url" href={m.url} target="_blank" rel="noreferrer">
            {m.url}
            <ExternalLink size={13} />
          </a>
        </div>
        <div className="page-heading-actions">
          <button
            className="button secondary"
            onClick={() => {
              if (showDiagnosis) void diagnosis.refetch();
              else setShowDiagnosis(true);
            }}
          >
            {showDiagnosis ? <RefreshCw size={15} /> : <SearchCheck size={15} />}
            {showDiagnosis ? 'Refresh analysis' : 'Analyze incident'}
          </button>
          <button className="button secondary" onClick={() => setEdit(true)}>
            <Pencil size={15} />
            Edit monitor
          </button>
          <MonitorActions monitor={m} />
        </div>
      </div>
      <div className="detail-period">
        <span>
          Reporting window <span className="muted">· Your local time</span>
        </span>
        <div className="period-switch">
          {[
            [1, '24 hours'],
            [7, '7 days'],
            [30, '30 days'],
          ].map(([n, l]) => (
            <button
              key={n}
              className={days === n ? 'selected' : ''}
              onClick={() => setDays(Number(n))}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="metrics-grid">
        <MetricCard
          label="Observed uptime"
          value={percent(s.uptime)}
          icon={<Activity size={17} />}
          detail={`${s.totalChecks.toLocaleString()} recorded checks`}
        />
        <MetricCard
          label="Average response"
          value={milliseconds(s.averageResponseMs)}
          icon={<Timer size={17} />}
          detail={`Min ${milliseconds(s.minResponseMs)} · Max ${milliseconds(s.maxResponseMs)}`}
        />
        <MetricCard
          label="Incidents"
          value={s.totalIncidents}
          icon={<TriangleAlert size={17} />}
          tone="amber"
          detail="Intersecting this reporting window"
        />
        <MetricCard
          label="Total downtime"
          value={s.downtimeMs ? duration(s.downtimeMs) : '0 min'}
          icon={<Clock size={17} />}
          tone="green"
          detail="Confirmed incident time"
        />
      </div>
      <section className="panel network-health" aria-labelledby="network-health-title">
        <div className="panel-title-row">
          <div>
            <h2 id="network-health-title">DNS & SSL health</h2>
            <p className="small muted">Checked with each scheduled monitor run</p>
          </div>
          <span className="small muted">Certificate alerts begin 14 days before expiry</span>
        </div>
        <div className="network-health-grid">
          <article className={`network-health-card ${m.dnsStatus.toLowerCase()}`}>
            <div className="network-health-icon">
              <Globe2 size={19} />
            </div>
            <div>
              <div className="network-health-label">
                <span>DNS resolution</span>
                <strong>
                  {m.dnsStatus === 'RESOLVED'
                    ? 'Healthy'
                    : m.dnsStatus === 'FAILED'
                      ? 'Issue detected'
                      : 'Waiting'}
                </strong>
              </div>
              <p>
                {m.dnsStatus === 'RESOLVED'
                  ? `Hostname resolves to ${m.dnsAddress ?? 'a public address'}.`
                  : m.dnsStatus === 'FAILED'
                    ? (m.dnsError ?? 'The hostname could not be resolved.')
                    : 'DNS health will appear after the first scheduled check.'}
              </p>
              {m.dnsCheckedAt && <small>Last checked {localDateTime(m.dnsCheckedAt)}</small>}
            </div>
          </article>
          <article className={`network-health-card ${m.tlsStatus.toLowerCase()}`}>
            <div className="network-health-icon">
              <ShieldCheck size={19} />
            </div>
            <div>
              <div className="network-health-label">
                <span>SSL certificate</span>
                <strong>
                  {m.tlsStatus === 'VALID'
                    ? 'Valid'
                    : m.tlsStatus === 'EXPIRING'
                      ? 'Expiring soon'
                      : m.tlsStatus === 'FAILED'
                        ? 'Issue detected'
                        : m.tlsStatus === 'NOT_APPLICABLE'
                          ? 'Not applicable'
                          : 'Waiting'}
                </strong>
              </div>
              <p>
                {m.tlsStatus === 'VALID' && m.tlsDaysRemaining !== null
                  ? `Certificate has ${m.tlsDaysRemaining} days remaining.`
                  : m.tlsStatus === 'EXPIRING' && m.tlsDaysRemaining !== null
                    ? `Certificate expires in ${m.tlsDaysRemaining} days. Renew it before visitors see an error.`
                    : m.tlsStatus === 'FAILED'
                      ? (m.tlsError ??
                        'The certificate or secure connection could not be validated.')
                      : m.tlsStatus === 'NOT_APPLICABLE'
                        ? 'This monitor uses HTTP, so it has no SSL certificate to check.'
                        : 'SSL health will appear after the first scheduled check.'}
              </p>
              {m.tlsExpiresAt && <small>Expires {localDateTime(m.tlsExpiresAt)}</small>}
            </div>
          </article>
        </div>
      </section>
      <section className="panel detail-history">
        <div className="panel-title-row">
          <h2>30-day uptime history</h2>
          <span className="small muted">Unknown periods appear gray</span>
        </div>
        <UptimeBar daily={s.daily} paused={!m.isActive} />
        <div className="history-ends">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </section>
      <section className="panel detail-chart">
        <div className="panel-title-row">
          <h2>Response time</h2>
          <span className="small muted">Latest: {milliseconds(s.latestResponseMs)}</span>
        </div>
        <ResponseTimeChart points={s.chart} days={days} />
      </section>
      {showDiagnosis && (
        <section
          ref={diagnosisRef}
          className="panel diagnosis-panel"
          aria-live="polite"
          aria-labelledby="diagnosis-title"
        >
          <div className="panel-title-row diagnosis-title-row">
            <div>
              <span className="section-kicker">RULES-BASED ANALYSIS</span>
              <h2 id="diagnosis-title">
                {diagnosis.data && !diagnosis.data.activeFailure
                  ? 'Current monitor status'
                  : 'Why is this website down?'}
              </h2>
              <p>
                {diagnosis.data && !diagnosis.data.activeFailure
                  ? 'Review the latest monitoring result'
                  : 'Analyze existing monitoring logs'}
              </p>
            </div>
            {diagnosis.data && (
              <div className="diagnosis-labels">
                <span
                  className={`diagnosis-signal ${diagnosis.data.activeFailure ? 'failure' : 'healthy'}`}
                >
                  {diagnosis.data.primarySignal}
                </span>
                {diagnosis.data.activeFailure && (
                  <span
                    className={`diagnosis-confidence ${diagnosis.data.confidence.level.toLowerCase()}`}
                  >
                    {diagnosis.data.confidence.level} confidence
                  </span>
                )}
              </div>
            )}
          </div>
          {diagnosis.isPending && (
            <p className="diagnosis-loading">Reviewing stored check history…</p>
          )}
          {diagnosis.error && (
            <div className="diagnosis-error">
              We couldn’t analyze the stored observations. Try refreshing the analysis.
            </div>
          )}
          {diagnosis.data && (
            <div className="diagnosis-content">
              <div className="diagnosis-summary">
                <p>{diagnosis.data.summary}</p>
                <span>{diagnosis.data.confidence.explanation}</span>
              </div>
              <section
                className="diagnosis-section diagnosis-detected"
                aria-labelledby="diagnosis-detected"
              >
                <h3 id="diagnosis-detected">What we detected</h3>
                <ul className="diagnosis-detections">
                  {diagnosis.data.whatWeDetected.map((item) => {
                    const Icon =
                      item.tone === 'healthy'
                        ? CheckCircle2
                        : item.tone === 'warning'
                          ? TriangleAlert
                          : Info;
                    return (
                      <li key={`${item.title}-${item.detail}`} className={item.tone}>
                        <Icon size={16} aria-hidden="true" />
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
              {diagnosis.data.activeFailure && (
                <>
                  <div className="diagnosis-grid">
                    <section className="diagnosis-section" aria-labelledby="diagnosis-evidence">
                      <h3 id="diagnosis-evidence">Observed evidence</h3>
                      <ul className="diagnosis-evidence">
                        {diagnosis.data.evidence.map((item) => (
                          <li key={`${item.label}-${item.value}`}>
                            <strong>{item.label}</strong>
                            <span>{item.value}</span>
                            <small>{item.detail}</small>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section className="diagnosis-section" aria-labelledby="diagnosis-steps">
                      <h3 id="diagnosis-steps">How to resolve this</h3>
                      <ol className="diagnosis-steps">
                        {diagnosis.data.recommendedSteps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  </div>
                  {diagnosis.data.likelyCauses.length > 0 && (
                    <section
                      className="diagnosis-section diagnosis-causes"
                      aria-labelledby="diagnosis-causes"
                    >
                      <h3 id="diagnosis-causes">Likely causes to investigate</h3>
                      <div>
                        {diagnosis.data.likelyCauses.map((cause) => (
                          <article key={cause.title} className="diagnosis-cause">
                            <span>{cause.likelihood}</span>
                            <h4>{cause.title}</h4>
                            <p>{cause.description}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
              <p className="diagnosis-disclaimer">{diagnosis.data.disclaimer}</p>
            </div>
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-title-row">
          <h2>Recent checks</h2>
          <span className="count-pill">{checks.data!.total}</span>
        </div>
        {checks.data!.items.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Checked at</th>
                  <th>Result</th>
                  <th>HTTP status</th>
                  <th>Response time</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {checks.data!.items.map((c) => (
                  <tr key={c.id}>
                    <td>{localDateTime(c.checkedAt)}</td>
                    <td>
                      <StatusBadge status={c.resultStatus} />
                    </td>
                    <td>{c.httpStatusCode ?? '—'}</td>
                    <td>{milliseconds(c.responseTimeMs)}</td>
                    <td className="muted">
                      {c.sanitizedErrorMessage ?? 'Expected response received'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="The first check is on its way"
            description="The worker checks this monitor independently of your browser."
          />
        )}
        <div className="table-footer">
          <span>{checks.data!.total} checks retained</span>
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>{page}</span>
            <button
              disabled={page * 10 >= checks.data!.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title-row">
          <h2>Incident history</h2>
        </div>
        {incidents.data!.items.length ? (
          <div className="incident-list">
            {incidents.data!.items.map((i) => (
              <Link to={`/incidents/${i.id}`} key={i.id} className="incident-list-row">
                <span className={`incident-tag ${i.status.toLowerCase()}`}>
                  {i.status === 'OPEN' ? 'Investigating' : 'Resolved'}
                </span>
                <div>
                  <strong>{i.cause}</strong>
                  <span>{localDateTime(i.startedAt)}</span>
                </div>
                <span>
                  {duration(
                    new Date(i.resolvedAt ?? Date.now()).getTime() -
                      new Date(i.startedAt).getTime(),
                  )}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No incidents"
            description="This monitor’s incident history will appear here."
          />
        )}
      </section>
      <p className="analytics-note">
        Uptime reflects observed checks, not continuous availability. Missing and paused periods are
        unknown. Incidents confirm downtime after {m.failureThreshold} failures.
      </p>
      <AddMonitorDialog open={edit} onOpenChange={setEdit} monitor={m} />
    </>
  );
}
