import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, CheckCircle2, Info } from 'lucide-react';
import { api } from '../api';
import type { Preference, Paginated, Delivery } from '../types';
import { LoadingSkeleton, ErrorState, EmptyState, utc } from '../components/ui';
export function Notifications() {
  const client = useQueryClient();
  const preferences = useQuery({
    queryKey: ['preferences'],
    queryFn: () =>
      api<{
        preferences: Preference[];
        smtpConfigured: boolean;
        emailConfigured?: boolean;
        emailProvider?: string | null;
        emailConfigurationIssue?: string | null;
      }>('/notifications/preferences'),
  });
  const deliveries = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => api<Paginated<Delivery>>('/notifications/deliveries'),
    refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: (body: Preference) => api('/notifications/preferences', { method: 'PATCH', body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['preferences'] });
      toast.success('Notification preferences saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (preferences.isPending || deliveries.isPending) return <LoadingSkeleton />;
  if (preferences.error || deliveries.error)
    return (
      <ErrorState
        error={(preferences.error ?? deliveries.error)!}
        onRetry={() => {
          void preferences.refetch();
          void deliveries.refetch();
        }}
      />
    );
  const pref = preferences.data.preferences.find((p) => p.monitorId === null) ?? {
    monitorId: null,
    emailEnabled: false,
    outageNotifications: true,
    recoveryNotifications: true,
  };
  const configured = preferences.data.emailConfigured ?? preferences.data.smtpConfigured;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">STAY IN THE LOOP</div>
          <h1>
            Notifications<span className="heading-dot">.</span>
          </h1>
          <p>The right signal, at the right time.</p>
        </div>
      </div>
      <div className={`smtp-banner ${configured ? 'configured' : ''}`}>
        {configured ? <CheckCircle2 size={21} /> : <Info size={21} />}
        <div>
          <strong>
            {configured ? 'Email delivery is configured' : 'Email delivery is not configured yet'}
          </strong>
          <p>
            {configured
              ? `Alerts are sent to your account email through ${preferences.data.emailProvider === 'brevo' ? 'Brevo' : 'your email provider'}. Website and page preferences also apply.`
              : (preferences.data.emailConfigurationIssue ??
                'Ask the website administrator to configure email delivery to receive outage and recovery alerts.')}
          </p>
        </div>
      </div>
      <section className="panel settings-panel">
        <div className="panel-title-row">
          <div className="panel-title">
            <Mail size={18} />
            <h2>Email notifications</h2>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Enable email notifications</h3>
            <p>Receive alerts at your account email address.</p>
          </div>
          <button
            className="toggle"
            role="switch"
            aria-checked={pref.emailEnabled}
            aria-label="Enable email notifications"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ ...pref, emailEnabled: !pref.emailEnabled })}
          />
        </div>
        <div className="setting-row">
          <div>
            <h3>Outage detected</h3>
            <p>Get notified when consecutive failures confirm downtime.</p>
          </div>
          <button
            className="toggle"
            role="switch"
            aria-checked={pref.outageNotifications}
            aria-label="Outage notifications"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ ...pref, outageNotifications: !pref.outageNotifications })
            }
          />
        </div>
        <div className="setting-row">
          <div>
            <h3>Service recovered</h3>
            <p>A little good news when your service comes back online.</p>
          </div>
          <button
            className="toggle"
            role="switch"
            aria-checked={pref.recoveryNotifications}
            aria-label="Recovery notifications"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ ...pref, recoveryNotifications: !pref.recoveryNotifications })
            }
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-title-row">
          <h2>Delivery history</h2>
        </div>
        {deliveries.data.items.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Monitor</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Requested at</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>{d.incident.monitor.name}</td>
                    <td>{d.eventType}</td>
                    <td>
                      <span className="count-pill">{d.status}</span>
                    </td>
                    <td>{d.attempts}</td>
                    <td>{utc(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Your inbox is quiet"
            description="Outage and recovery delivery attempts will appear here. Pending delivery never means an email was sent."
          />
        )}
      </section>
    </>
  );
}
