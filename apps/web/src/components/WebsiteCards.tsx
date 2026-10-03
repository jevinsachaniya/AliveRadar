import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Clock, Globe, Pause, TriangleAlert } from 'lucide-react';
import type { Website } from '../types';

export function WebsiteStatus({ website }: { website: Website }) {
  const status = website.overallStatus;
  const Icon =
    status === 'UP' ? Check : status ? TriangleAlert : website.activePages ? Clock : Pause;
  const label =
    status ??
    (website.totalPages === 0 ? 'No pages' : website.activePages ? 'Waiting for checks' : 'Paused');
  return (
    <span className={`status-badge website-status ${(status ?? 'pending').toLowerCase()}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

export function WebsiteCards({ websites }: { websites: Website[] }) {
  return (
    <div className="website-groups">
      {websites.map((website) => (
        <article className="website-group-card" key={website.id}>
          <div className="website-group-heading">
            <span className="monitor-icon">
              <Globe size={20} />
            </span>
            <WebsiteStatus website={website} />
          </div>
          <Link className="website-group-name" to={`/websites/${website.id}`}>
            {website.name}
            <ArrowUpRight size={16} />
          </Link>
          <p className="website-group-url">{website.url}</p>
          <div className="website-group-counts">
            <span>
              <i className="mini-dot green" />
              {website.up} up
            </span>
            <span>
              <i className="mini-dot red" />
              {website.down} down
            </span>
            <span>{website.pending} waiting</span>
            <span>{website.paused} paused</span>
          </div>
          {website.failedPages.length > 0 && (
            <div className="website-failures">
              <strong>Pages down</strong>
              {website.failedPages.map((page) => (
                <Link key={page.id} to={`/monitors/${page.id}`}>
                  <TriangleAlert size={14} />
                  <span>{page.name}</span>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
            </div>
          )}
          <Link className="text-link" to={`/websites/${website.id}`}>
            View {website.totalPages} {website.totalPages === 1 ? 'page' : 'pages'}
            <ArrowUpRight size={14} />
          </Link>
        </article>
      ))}
    </div>
  );
}

export function WebsiteOverview({ websites }: { websites: Website[] }) {
  return (
    <section className="website-overview" aria-label="Website health">
      <div className="panel-title-row">
        <div>
          <h2>Your websites</h2>
          <p className="muted">One overall status. Every page in view.</p>
        </div>
        <Link className="text-link" to="/websites">
          Manage websites
          <ArrowUpRight size={15} />
        </Link>
      </div>
      {websites.length ? (
        <WebsiteCards websites={websites} />
      ) : (
        <div className="website-group-empty">
          Group your pages to see website health.
          <Link className="text-link" to="/websites">
            Add a website
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
    </section>
  );
}
