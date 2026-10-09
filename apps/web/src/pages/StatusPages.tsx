import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus,
  PanelsTopLeft,
  ExternalLink,
  Pencil,
  Trash2,
  CheckCircle2,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { statusPageSchema } from '../../../../packages/shared/src/validation';
import { api } from '../api';
import type { StatusPage, Monitor, Daily, Status } from '../types';
type MonitorOption = Pick<Monitor, 'id' | 'name' | 'currentStatus'>;
import {
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  FieldError,
  StatusBadge,
  UptimeBar,
  percent,
  localDateTime,
} from '../components/ui';
import { WebsiteFrame } from '../components/SiteLayout';
export function StatusPages() {
  const [editor, setEditor] = useState<StatusPage | 'new' | null>(null),
    [remove, setRemove] = useState<StatusPage | null>(null);
  const client = useQueryClient();
  const pages = useQuery({
    queryKey: ['status-pages'],
    queryFn: () => api<{ items: StatusPage[] }>('/status-pages'),
  });
  const monitors = useQuery({
    queryKey: ['all-monitors'],
    queryFn: () => api<{ items: MonitorOption[] }>('/monitors/options'),
  });
  const deletion = useMutation({
    mutationFn: (id: string) => api(`/status-pages/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['status-pages'] });
      setRemove(null);
      toast.success('Status page deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (pages.isPending || monitors.isPending) return <LoadingSkeleton />;
  if (pages.error || monitors.error)
    return (
      <ErrorState
        error={(pages.error ?? monitors.error)!}
        onRetry={() => {
          void pages.refetch();
          void monitors.refetch();
        }}
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">TRANSPARENCY BUILDS TRUST</div>
          <h1>
            Status pages<span className="heading-dot">.</span>
          </h1>
          <p>Give your customers a clear view of what’s happening.</p>
        </div>
        <button className="button primary" onClick={() => setEditor('new')}>
          <Plus size={16} />
          Create status page
        </button>
      </div>
      {pages.data.items.length ? (
        <div className="status-page-grid">
          {pages.data.items.map((p) => (
            <section className="panel status-page-card" key={p.id}>
              <div className="status-page-preview">
                <span className="status-page-preview-icon">
                  <PanelsTopLeft size={29} />
                </span>
                <span className={`incident-tag ${p.isPublic ? 'resolved' : ''}`}>
                  {p.isPublic ? 'Published' : 'Unpublished'}
                </span>
                <div className="preview-lines">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="status-page-info">
                <h2>{p.name}</h2>
                <p>/status/{p.slug}</p>
                <span className="small muted">{p.monitors.length} components</span>
                <div className="status-page-actions">
                  <button className="button secondary" onClick={() => setEditor(p)}>
                    <Pencil size={14} />
                    Edit page
                  </button>
                  {p.isPublic && (
                    <Link
                      className="icon-button"
                      to={`/status/${p.slug}`}
                      target="_blank"
                      aria-label={`Open ${p.name}`}
                    >
                      <ExternalLink size={17} />
                    </Link>
                  )}
                  <button
                    className="icon-button text-danger"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setRemove(p)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <EmptyState
            title="Your services, out in the open"
            description="Publish a status page with the monitors you choose. Private URLs stay private."
            action="Create a status page"
            onAction={() => setEditor('new')}
          />
        </section>
      )}
      <Modal
        open={editor !== null}
        onOpenChange={(v) => {
          if (!v) setEditor(null);
        }}
        title={editor === 'new' ? 'Create a status page' : 'Edit status page'}
        description="Choose the components your customers can see."
      >
        {editor && (
          <StatusPageForm
            page={editor === 'new' ? undefined : editor}
            monitors={monitors.data.items}
            onSaved={() => setEditor(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={remove !== null}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
        title="Delete this status page?"
        description="Its public address will stop working. Your monitors and check history are kept."
        pending={deletion.isPending}
        onConfirm={() => {
          if (remove) deletion.mutate(remove.id);
        }}
      />
    </>
  );
}
function StatusPageForm({
  page,
  monitors,
  onSaved,
}: {
  page?: StatusPage;
  monitors: MonitorOption[];
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof statusPageSchema>, unknown, z.output<typeof statusPageSchema>>({
    resolver: zodResolver(statusPageSchema),
    defaultValues: {
      name: page?.name ?? '',
      slug: page?.slug ?? '',
      isPublic: page?.isPublic ?? false,
      monitorIds: page?.monitors.map((m) => m.monitorId) ?? [],
    },
  });
  const mutation = useMutation({
    mutationFn: (body: z.output<typeof statusPageSchema>) =>
      api(page ? `/status-pages/${page.id}` : '/status-pages', {
        method: page ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['status-pages'] });
      toast.success('Status page saved');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form className="form" onSubmit={handleSubmit((v) => mutation.mutate(v))}>
      <label>
        Page name
        <input placeholder="e.g. Acme status" {...register('name')} />
        <FieldError message={errors.name?.message} />
      </label>
      <label>
        Public slug
        <div className="slug-input">
          <span>/status/</span>
          <input placeholder="acme" {...register('slug')} />
        </div>
        <FieldError message={errors.slug?.message} />
      </label>
      <fieldset className="component-picker">
        <legend>Components</legend>
        {monitors.length ? (
          monitors.map((m) => (
            <label key={m.id} className="checkbox-line">
              <input type="checkbox" value={m.id} {...register('monitorIds')} />
              {m.name}
              <StatusBadge status={m.currentStatus} />
            </label>
          ))
        ) : (
          <p className="muted">Add monitors before assigning components.</p>
        )}
      </fieldset>
      <label className="checkbox-line">
        <input type="checkbox" {...register('isPublic')} />
        Publish this page for anyone with the link
      </label>
      <p className="small muted">
        Component names, statuses, and history are public. Monitor URLs and your email stay private.
      </p>
      {mutation.error && (
        <p className="field-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button secondary" type="button" onClick={onSaved}>
          Cancel
        </button>
        <button className="button primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save status page'}
          <ArrowRight size={15} />
        </button>
      </div>
    </form>
  );
}
type PublicData = {
  name: string;
  slug: string;
  components: {
    name: string;
    currentStatus: Status;
    lastCheckedAt: string | null;
    incidents: { id: string; startedAt: string; resolvedAt: string | null; status: string }[];
    uptime: number | null;
    daily: Daily[];
  }[];
};
export function PublicStatus() {
  const { slug } = useParams();
  const query = useQuery({
    queryKey: ['public-status', slug],
    queryFn: () => api<PublicData>(`/public/status/${slug}`),
    refetchInterval: 30000,
  });
  if (query.isPending)
    return (
      <WebsiteFrame>
        <div className="public-page">
          <LoadingSkeleton />
        </div>
      </WebsiteFrame>
    );
  if (query.error)
    return (
      <WebsiteFrame>
        <div className="public-page">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      </WebsiteFrame>
    );
  const page = query.data,
    down = page.components.some((c) => c.currentStatus === 'DOWN'),
    allUp = page.components.length > 0 && page.components.every((c) => c.currentStatus === 'UP');
  return (
    <WebsiteFrame>
      <div className="public-page">
        <header>
          <span className="page-eyebrow">LIVE SERVICE STATUS</span>
          <Link className="text-link" to="/">
            Back to home <ArrowRight size={14} />
          </Link>
        </header>
        <h1>{page.name}</h1>
        <p className="muted">A transparent look at our services.</p>
        <div className={`public-summary ${down ? 'has-outage' : ''}`}>
          {allUp ? <CheckCircle2 size={25} /> : <Activity size={25} />}
          <div>
            <h2>
              {down
                ? 'Some services are experiencing issues'
                : allUp
                  ? 'All systems operational'
                  : 'Service status overview'}
            </h2>
            <p>Updated automatically every 30 seconds.</p>
          </div>
        </div>
        <section className="panel public-components">
          {page.components.length ? (
            page.components.map((c, i) => (
              <div className="public-component" key={i}>
                <div>
                  <h3>{c.name}</h3>
                  <StatusBadge status={c.currentStatus} />
                </div>
                <UptimeBar daily={c.daily} />
                <div className="history-ends">
                  <span>Last 30 days</span>
                  <span>{percent(c.uptime)} observed uptime</span>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="No components published"
              description="The page owner hasn’t added components yet."
            />
          )}
        </section>
        <h2 className="public-incident-heading">Recent incidents</h2>
        {page.components
          .flatMap((c) => c.incidents.map((i) => ({ ...i, name: c.name })))
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .slice(0, 10)
          .map((i) => (
            <div className="panel public-incident" key={i.id}>
              <span className={`incident-tag ${i.status.toLowerCase()}`}>
                {i.status === 'RESOLVED' ? 'Resolved' : 'Investigating'}
              </span>
              <h3>{i.name}</h3>
              <p>
                {localDateTime(i.startedAt)}
                {i.resolvedAt ? ` · Resolved ${localDateTime(i.resolvedAt)}` : ''}
              </p>
            </div>
          ))}
        {!page.components.some((c) => c.incidents.length) && (
          <p className="muted">No recent incidents.</p>
        )}
        <footer>
          Powered by <Link to="/">AliveRadar</Link>
          <span>Uptime reflects observed checks. Missing periods are unknown.</span>
        </footer>
      </div>
    </WebsiteFrame>
  );
}
