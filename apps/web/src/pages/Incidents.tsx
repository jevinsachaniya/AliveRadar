import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, TriangleAlert, Clock, Activity } from 'lucide-react';
import { api } from '../api';
import type { Incident, Paginated } from '../types';
import { LoadingSkeleton, ErrorState, EmptyState, utc, duration } from '../components/ui';
export function Incidents() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['incidents', page],
    queryFn: () => api<Paginated<Incident>>(`/incidents?page=${page}`),
    refetchInterval: 15000,
  });
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">EVERY MOMENT ACCOUNTED FOR</div>
          <h1>
            Incidents<span className="heading-dot">.</span>
          </h1>
          <p>From the first signal to full recovery, follow the story.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-title-row">
          <h2>Incident history</h2>
          <span className="count-pill">{query.data.total}</span>
        </div>
        {query.data.items.length ? (
          <div className="incident-list">
            {query.data.items.map((i) => (
              <Link key={i.id} to={`/incidents/${i.id}`} className="incident-list-row">
                <span className={`incident-symbol ${i.status.toLowerCase()}`}>
                  {i.status === 'OPEN' ? <TriangleAlert size={19} /> : <CheckCircle2 size={19} />}
                </span>
                <div className="incident-main">
                  <strong>{i.monitor?.name}</strong>
                  <span>{i.cause}</span>
                </div>
                <span className={`incident-tag ${i.status.toLowerCase()}`}>
                  {i.status === 'OPEN' ? 'Investigating' : 'Resolved'}
                </span>
                <div className="incident-dates">
                  <strong>
                    {duration(
                      new Date(i.resolvedAt ?? Date.now()).getTime() -
                        new Date(i.startedAt).getTime(),
                    )}
                  </strong>
                  <span>{utc(i.startedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Quiet is a good thing"
            description="Confirmed outages and recoveries will appear here automatically."
          />
        )}
        <div className="table-footer">
          <span>Incidents are created after consecutive failures.</span>
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>{page}</span>
            <button disabled={page * 20 >= query.data.total} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
export function IncidentTimeline({ incident }: { incident: Incident }) {
  return (
    <div className="incident-timeline">
      <div className="timeline-item">
        <span className="timeline-icon outage">
          <TriangleAlert size={17} />
        </span>
        <div>
          <h3>Outage confirmed</h3>
          <time>{utc(incident.startedAt)}</time>
          <p>{incident.cause}</p>
        </div>
      </div>
      <div className="timeline-item">
        <span className={`timeline-icon ${incident.resolvedAt ? 'recovered' : ''}`}>
          {incident.resolvedAt ? <CheckCircle2 size={17} /> : <Activity size={17} />}
        </span>
        <div>
          <h3>{incident.resolvedAt ? 'Incident resolved' : 'Monitoring for recovery'}</h3>
          {incident.resolvedAt ? (
            <>
              <time>{utc(incident.resolvedAt)}</time>
              <p>
                The incident has ended. This can follow successful checks or a configuration change.
              </p>
            </>
          ) : (
            <p>We’ll resolve this incident after the configured number of successful checks.</p>
          )}
        </div>
      </div>
    </div>
  );
}
export function IncidentDetails() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api<Incident>(`/incidents/${id}`),
    refetchInterval: 15000,
  });
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const i = query.data;
  return (
    <>
      <Link className="back-link" to="/incidents">
        <ArrowLeft size={14} />
        All incidents
      </Link>
      <div className="page-heading">
        <div>
          <div className="detail-status">
            <span className={`incident-tag ${i.status.toLowerCase()}`}>
              {i.status === 'OPEN' ? 'Investigating' : 'Resolved'}
            </span>
          </div>
          <h1>{i.monitor?.name}</h1>
          <p>Incident started {utc(i.startedAt)}</p>
        </div>
        <Link to={`/monitors/${i.monitorId}`} className="button secondary">
          View monitor
        </Link>
      </div>
      <section className="panel">
        <div className="panel-title-row">
          <h2>Incident timeline</h2>
          <span className="small muted inline-flex">
            <Clock size={14} />
            {duration(
              new Date(i.resolvedAt ?? Date.now()).getTime() - new Date(i.startedAt).getTime(),
            )}
          </span>
        </div>
        <IncidentTimeline incident={i} />
      </section>
      <section className="panel">
        <div className="panel-title-row">
          <h2>Notification deliveries</h2>
        </div>
        {i.deliveries?.length ? (
          <div className="incident-list">
            {i.deliveries.map((d) => (
              <div className="incident-list-row" key={d.id}>
                <strong>{d.eventType}</strong>
                <span className="count-pill">{d.status}</span>
                <span>{d.attempts} attempts</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No notifications queued"
            description="Email delivery depends on notification preferences and SMTP configuration."
          />
        )}
      </section>
    </>
  );
}
