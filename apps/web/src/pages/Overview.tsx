import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import {
  Plus,
  ChevronDown,
  Activity,
  Globe,
  ShieldCheck,
  Timer,
  ArrowUpRight,
  CheckCircle2,
  Search,
  List,
  LayoutGrid,
  Radio,
  Pause,
  Info,
  CalendarDays,
} from 'lucide-react';
import { api } from '../api';
import type { User, Overview as OverviewData, Monitor, Paginated } from '../types';
import {
  MetricCard,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  milliseconds,
  relative,
  duration,
} from '../components/ui';
import { AddMonitorDialog } from '../components/AddMonitorDialog';
import { WebsiteOverview } from '../components/WebsiteCards';
import { MonitorTable, MonitorCard } from '../components/MonitorTable';
import { ResponseTimeChart } from '../components/ResponseTimeChart';
export function Overview({ user, monitorsOnly = false }: { user: User; monitorsOnly?: boolean }) {
  const [add, setAdd] = useState(false),
    [filter, setFilter] = useState('ALL'),
    [search, setSearch] = useState(''),
    [grid, setGrid] = useState(false),
    [page, setPage] = useState(1),
    [sort, setSort] = useState('createdAt'),
    [days, setDays] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const overview = useQuery({
    queryKey: ['overview', days],
    queryFn: () => api<OverviewData>(`/overview?days=${days}`),
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  });
  const monitors = useQuery({
    queryKey: ['monitors', filter, debouncedSearch, page, sort],
    queryFn: () =>
      api<Paginated<Monitor>>(
        `/monitors?limit=6&page=${page}&sort=${sort}&order=${sort === 'name' ? 'asc' : 'desc'}&search=${encodeURIComponent(debouncedSearch)}${filter === 'ALL' ? '' : `&status=${filter}`}`,
      ),
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).get('focus') === 'search' && !overview.isPending)
      searchRef.current?.focus();
  }, [location.key, location.search, overview.isPending]);
  if (overview.isPending) return <LoadingSkeleton />;
  if (overview.error)
    return (
      <ErrorState
        error={overview.error}
        onRetry={() => {
          void overview.refetch();
          void monitors.refetch();
        }}
      />
    );
  const data = overview.data;
  const results = monitors.data ?? { items: [], total: 0, page, limit: 6 };
  const updatingMonitors = monitors.isFetching || search !== debouncedSearch;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">
            <span className="live-dot" />
            YOUR UPTIME, IN FOCUS
          </div>
          <h1>
            {monitorsOnly ? 'Monitors' : 'Overview'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {monitorsOnly
              ? 'Every endpoint. One clear picture.'
              : 'A clear picture of your services, every minute of the day.'}
          </p>
        </div>
        <div className="page-heading-actions">
          <span className="date-label">
            <CalendarDays size={15} />
            {new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            <ChevronDown size={14} />
          </span>
          <button className="button primary" onClick={() => setAdd(true)}>
            <Plus size={17} />
            Add monitor
          </button>
        </div>
      </div>
      {user.isDemo && (
        <div className="demo-banner">
          <Info size={14} />
          <span>
            <strong>Demo workspace</strong>
            <span className="banner-separator">·</span>Historical checks are seeded. Live checks use
            local demo targets.
          </span>
          <Link to="/register">
            Create an account <ArrowUpRight size={13} />
          </Link>
        </div>
      )}
      {!monitorsOnly && (
        <>
          {data.websites && <WebsiteOverview websites={data.websites} />}
          <div className="metrics-grid">
            <MetricCard
              label="Total monitors"
              value={data.total}
              icon={<Globe size={17} />}
              detail={
                <>
                  <span className="mini-dot purple" />
                  All your services, in one place
                </>
              }
            />
            <MetricCard
              label="Monitors up"
              value={data.up}
              suffix={`/ ${data.total}`}
              icon={<ShieldCheck size={18} />}
              tone="green"
              detail={
                <>
                  <span className="mini-dot green" />
                  {data.down
                    ? `${data.down} ${data.down === 1 ? 'service needs' : 'services need'} attention`
                    : data.up
                      ? 'Looking good. Keep it up.'
                      : 'Waiting for your first check'}
                </>
              }
            />
            <MetricCard
              label="Overall uptime"
              value={data.uptime == null ? '—' : data.uptime.toFixed(2)}
              suffix={data.uptime == null ? '' : '%'}
              icon={<Activity size={17} />}
              tone="purple"
              detail={
                <>
                  <span className="metric-period">
                    Last {days === 1 ? '24 hours' : `${days} days`}
                  </span>
                  <span className="metric-observation">
                    {data.totalChecks.toLocaleString()} checks
                  </span>
                </>
              }
            />
            <MetricCard
              label="Avg. response time"
              value={data.averageResponseMs ?? '—'}
              suffix={data.averageResponseMs == null ? '' : 'ms'}
              icon={<Timer size={17} />}
              tone="amber"
              detail={
                <>
                  <span className="mini-dot amber" />
                  Across observed checks
                </>
              }
            />
          </div>
          <div className={`system-strip ${data.down ? 'has-outage' : ''}`}>
            <span className="system-icon">
              {data.down ? <Activity size={19} /> : <CheckCircle2 size={19} />}
            </span>
            <div>
              <strong>
                {data.down
                  ? `${data.down} ${data.down === 1 ? 'service requires' : 'services require'} attention`
                  : data.pending
                    ? 'Checks are getting started'
                    : data.up
                      ? 'All monitored systems operational'
                      : 'Ready when you are'}
              </strong>
              <span>
                {data.down
                  ? 'We’re tracking the outage and will report recovery.'
                  : data.up
                    ? `${data.up} ${data.up === 1 ? 'monitor is' : 'monitors are'} up${data.paused ? ` · ${data.paused} paused` : ''}. You’re in good hands.`
                    : 'Add a monitor to start tracking your uptime.'}
              </span>
            </div>
            <span className={`worker-label ${data.workerHealthy ? '' : 'offline'}`}>
              <span className="live-dot" />
              {data.workerHealthy ? 'Live monitoring' : 'Worker offline'}
            </span>
          </div>
        </>
      )}
      <section className="panel monitors-panel">
        <div className="panel-title-row">
          <div className="panel-title">
            <h2>Your monitors</h2>
            <span className="count-pill">{data.total}</span>
          </div>
          <div className="view-switch">
            <button
              aria-label="List view"
              aria-pressed={!grid}
              onClick={() => setGrid(false)}
              className={!grid ? 'selected' : ''}
            >
              <List size={16} />
            </button>
            <button
              aria-label="Grid view"
              aria-pressed={grid}
              onClick={() => setGrid(true)}
              className={grid ? 'selected' : ''}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>
        <div className="monitor-toolbar">
          <div className="filter-tabs" role="group" aria-label="Filter monitor status">
            {[
              ['ALL', 'All monitors', data.total],
              ['UP', 'Up', data.up],
              ['DOWN', 'Down', data.down],
              ['PAUSED', 'Paused', data.paused],
            ].map(([value, label, count]) => (
              <button
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => {
                  setFilter(String(value));
                  setPage(1);
                }}
              >
                {value === 'UP' && <span className="mini-dot green" />}
                {value === 'DOWN' && <span className="mini-dot red" />}
                {value === 'PAUSED' && <Pause size={10} />}
                <span>{label}</span>
                <span className="tab-count">{count}</span>
              </button>
            ))}
          </div>
          <div className="table-controls">
            <div className="search-input">
              <Search size={15} />
              <input
                data-monitor-search
                ref={searchRef}
                aria-label="Search monitors"
                placeholder="Search monitors…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="sort-select"
              aria-label="Sort monitors"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="createdAt">Newest first</option>
              <option value="name">Name A–Z</option>
              <option value="lastCheckedAt">Last checked</option>
            </select>
          </div>
        </div>
        {monitors.error ? (
          <ErrorState error={monitors.error} onRetry={() => void monitors.refetch()} />
        ) : monitors.isPending ? (
          <LoadingSkeleton />
        ) : results.items.length ? (
          grid ? (
            <div className="monitor-card-grid">
              {results.items.map((m, i) => (
                <MonitorCard key={m.id} monitor={m} index={i} />
              ))}
            </div>
          ) : (
            <MonitorTable monitors={results.items} />
          )
        ) : (
          <EmptyState
            title={data.total ? 'No matching monitors' : 'Meet your first monitor'}
            description={
              data.total
                ? 'Try another search or status filter.'
                : 'Add your website and let us keep watch.'
            }
            action={data.total ? undefined : 'Add a monitor'}
            onAction={() => setAdd(true)}
          />
        )}
        <div className="table-footer" aria-live="polite" aria-busy={updatingMonitors}>
          <span>
            {updatingMonitors ? 'Updating monitors… ' : ''}
            Showing {results.total ? (page - 1) * 6 + 1 : 0}–{Math.min(page * 6, results.total)} of{' '}
            {results.total} monitors
          </span>
          {results.total > 6 ? (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>{page}</span>
              <button disabled={page * 6 >= results.total} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          ) : (
            <span className="table-update">
              <RefreshIndicator />
              Updated every 15 seconds
            </span>
          )}
        </div>
      </section>
      {!monitorsOnly && (
        <div className="dashboard-lower">
          <section className="panel chart-panel">
            <div className="panel-title-row">
              <div>
                <h2>Response time</h2>
                <p className="panel-subtitle">A pulse on your service performance</p>
              </div>
              <div className="period-switch">
                {[
                  [1, '24h'],
                  [7, '7d'],
                  [30, '30d'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={days === value ? 'selected' : ''}
                    onClick={() => setDays(Number(value))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-meta">
              <span>
                <span className="chart-legend-dot" />
                All monitors
              </span>
              <span>
                Response time <span className="muted">(ms)</span>
              </span>
            </div>
            <ResponseTimeChart points={data.chart} days={days} />
            <div className="chart-footer">
              <span>
                Average <strong>{milliseconds(data.averageResponseMs)}</strong>
              </span>
              <span>
                Observed checks only <Info size={12} />
              </span>
            </div>
          </section>
          <section className="panel incidents-panel">
            <div className="panel-title-row">
              <h2>Recent incidents</h2>
              <Link to="/incidents" className="text-link">
                View all <ArrowUpRight size={14} />
              </Link>
            </div>
            {data.recentIncidents.length ? (
              <div className="recent-incidents">
                {data.recentIncidents.slice(0, 3).map((i) => (
                  <Link to={`/incidents/${i.id}`} key={i.id} className="recent-incident">
                    <span className={`incident-symbol ${i.status.toLowerCase()}`}>
                      {i.status === 'RESOLVED' ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <Activity size={17} />
                      )}
                    </span>
                    <div>
                      <strong>{i.monitor?.name}</strong>
                      <span>
                        {i.status === 'RESOLVED' ? 'Recovered' : 'Investigating'}
                        <span className="inline-dot">·</span>
                        {duration(
                          new Date(i.resolvedAt ?? Date.now()).getTime() -
                            new Date(i.startedAt).getTime(),
                        )}
                      </span>
                    </div>
                    <time>{relative(i.startedAt)}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Quiet is a good thing"
                description="No incidents to report. We’ll keep watching."
              />
            )}
            <div className="incident-footer">
              <span className="mini-dot green" />
              Always watching. Always in the loop.
            </div>
          </section>
        </div>
      )}
      <AddMonitorDialog open={add} onOpenChange={setAdd} />
    </>
  );
}
function RefreshIndicator() {
  return <Radio size={12} />;
}
