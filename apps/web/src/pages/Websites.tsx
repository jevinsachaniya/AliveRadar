import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Pencil, Trash2, Mail, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import type { Website } from '../types';
import { AddWebsiteDialog } from '../components/AddWebsiteDialog';
import { AddMonitorDialog } from '../components/AddMonitorDialog';
import { MonitorActions } from '../components/MonitorTable';
import { WebsiteCards, WebsiteStatus } from '../components/WebsiteCards';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Modal,
  StatusBadge,
  relative,
} from '../components/ui';

export function Websites() {
  const [add, setAdd] = useState(false);
  const websites = useQuery({
    queryKey: ['websites'],
    queryFn: () => api<{ items: Website[] }>('/websites'),
    refetchInterval: 5000,
  });
  if (websites.isPending) return <LoadingSkeleton />;
  if (websites.error)
    return <ErrorState error={websites.error} onRetry={() => void websites.refetch()} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">EVERY PAGE COUNTS</div>
          <h1>
            Websites<span className="heading-dot">.</span>
          </h1>
          <p>Monitor multiple URLs together and see exactly which page needs attention.</p>
        </div>
        <button className="button primary" onClick={() => setAdd(true)}>
          <Plus size={17} />
          Add website
        </button>
      </div>
      <p className="website-status-explanation">
        UP: all active pages healthy · DEGRADED: some pages down · DOWN: all active pages down
      </p>
      {websites.data.items.length ? (
        <WebsiteCards websites={websites.data.items} />
      ) : (
        <section className="panel">
          <EmptyState
            title="One website. Every important page."
            description="Add Home, Login, Checkout and any other URL you want to watch."
            action="Monitor a website"
            onAction={() => setAdd(true)}
          />
        </section>
      )}
      <AddWebsiteDialog open={add} onOpenChange={setAdd} />
    </>
  );
}

export function WebsiteDetails() {
  const { id } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [add, setAdd] = useState(false),
    [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false);
  const website = useQuery({
    queryKey: ['website', id],
    queryFn: () => api<Website>(`/websites/${id}`),
    refetchInterval: 5000,
  });
  const deletion = useMutation({
    mutationFn: () => api(`/websites/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries();
      toast.success('Website and its page monitors deleted');
      navigate('/websites');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (website.isPending) return <LoadingSkeleton />;
  if (website.error)
    return <ErrorState error={website.error} onRetry={() => void website.refetch()} />;
  const w = website.data;
  return (
    <>
      <Link className="back-link" to="/websites">
        <ArrowLeft size={14} />
        Back to websites
      </Link>
      <div className="page-heading">
        <div>
          <div className="detail-status">
            <WebsiteStatus website={w} />
            <span>{w.activePages} active pages</span>
          </div>
          <h1>{w.name}</h1>
          <p className="monitor-detail-url">{w.url}</p>
        </div>
        <div className="page-heading-actions">
          <button className="button secondary" onClick={() => setEdit(true)}>
            <Pencil size={15} />
            Website settings
          </button>
          <button className="button primary" onClick={() => setAdd(true)}>
            <Plus size={15} />
            Add page
          </button>
          <button
            className="icon-button"
            aria-label={`Delete ${w.name}`}
            onClick={() => setRemove(true)}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <div className="website-detail-summary">
        <span>{w.up} pages up</span>
        <span>{w.down} pages down</span>
        <span>{w.pending} awaiting checks</span>
        <span>{w.paused} paused</span>
      </div>
      {w.failedPages.length > 0 && (
        <section className="website-down-banner" aria-label="Failed pages">
          <TriangleAlert size={22} />
          <div>
            <strong>
              {w.overallStatus === 'DOWN'
                ? 'All active pages are down'
                : 'Some pages need attention'}
            </strong>
            <p>
              Failed pages:{' '}
              {w.failedPages.map((page, index) => (
                <span key={page.id}>
                  {index > 0 && ', '}
                  <Link to={`/monitors/${page.id}`}>{page.name}</Link>
                </span>
              ))}
            </p>
          </div>
        </section>
      )}
      <div className="website-email-status">
        <Mail size={16} />
        <span>
          {w.emailEnabled && w.accountEmailEnabled
            ? 'Page outage and recovery emails enabled'
            : 'Email alerts paused for this website or account'}
          . <Link to="/notifications">Delivery & preferences</Link>
        </span>
      </div>
      <section className="panel website-pages-panel">
        <div className="panel-title-row">
          <h2>Pages you’re watching</h2>
          <span className="muted">Each URL is checked independently</span>
        </div>
        {w.pages.length ? (
          <div className="website-page-list">
            {w.pages.map((page) => (
              <div className="website-page-row" key={page.id}>
                <div className="website-page-identity">
                  <Link to={`/monitors/${page.id}`}>{page.name}</Link>
                  <small>{page.url}</small>
                </div>
                <StatusBadge status={page.currentStatus} />
                <span className="website-page-checked">{relative(page.lastCheckedAt)}</span>
                <MonitorActions monitor={page} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Add your first page"
            description="Give each important URL a name so you can identify outages."
            action="Add page"
            onAction={() => setAdd(true)}
          />
        )}
      </section>
      <p className="website-status-explanation">
        The overall status uses confirmed page states after each page’s failure or recovery
        threshold. Paused pages are excluded. Pages awaiting their first check are never counted as
        up.
      </p>
      <AddMonitorDialog open={add} onOpenChange={setAdd} website={w} />
      <Modal
        open={edit}
        onOpenChange={setEdit}
        title="Website settings"
        description="Manage the website name and page alerts."
      >
        {edit && <WebsiteSettings website={w} onSaved={() => setEdit(false)} />}
      </Modal>
      <ConfirmDialog
        open={remove}
        onOpenChange={setRemove}
        pending={deletion.isPending}
        onConfirm={() => deletion.mutate()}
        title={`Delete ${w.name}?`}
        description="This permanently deletes this website, all its page monitors, check history, incidents and status-page assignments."
      />
    </>
  );
}

function WebsiteSettings({ website, onSaved }: { website: Website; onSaved: () => void }) {
  const [name, setName] = useState(website.name),
    [emailEnabled, setEmailEnabled] = useState(website.emailEnabled);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      api(`/websites/${website.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), emailEnabled },
      }),
    onSuccess: () => {
      void client.invalidateQueries();
      toast.success('Website settings saved');
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Website name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
        />
      </label>
      <label className="website-email-option">
        <input
          type="checkbox"
          checked={emailEnabled}
          onChange={(event) => setEmailEnabled(event.target.checked)}
        />
        <span>
          Email alerts for this website
          <small>
            Enabling this also enables account outage and recovery notifications. Per-page
            preferences still apply.
          </small>
        </span>
      </label>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onSaved}>
          Cancel
        </button>
        <button className="button primary" disabled={save.isPending || !name.trim()}>
          {save.isPending ? 'Saving…' : 'Save website settings'}
        </button>
      </div>
    </form>
  );
}
