import { useState } from 'react';
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
} from 'lucide-react';
import { api } from '../api';
import type { Monitor, Analytics, Check, Incident, Paginated } from '../types';
import {
  LoadingSkeleton,
  ErrorState,
  MetricCard,
  StatusBadge,
  UptimeBar,
  percent,
  milliseconds,
  utc,
  duration,
  EmptyState,
} from '../components/ui';
import { ResponseTimeChart } from '../components/ResponseTimeChart';
import { AddMonitorDialog } from '../components/AddMonitorDialog';
import { MonitorActions } from '../components/MonitorTable';
export function MonitorDetails() {
  const { id } = useParams();
  const [days, setDays] = useState(1),
    [edit, setEdit] = useState(false),
    [page, setPage] = useState(1);
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
          <button className="button secondary" onClick={() => setEdit(true)}>
            <Pencil size={15} />
            Edit monitor
          </button>
          <MonitorActions monitor={m} />
        </div>
      </div>
      <div className="detail-period">
        <span>
          Reporting window <span className="muted">· UTC rolling periods</span>
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
                    <td>{utc(c.checkedAt)}</td>
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
                  <span>{utc(i.startedAt)}</span>
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
