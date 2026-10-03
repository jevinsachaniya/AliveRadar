import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Globe, ArrowRight } from 'lucide-react';
import {
  monitorSchema,
  type MonitorInput,
  type MonitorConfig,
} from '../../../../packages/shared/src/validation';
import { Modal, FieldError } from './ui';
import { api } from '../api';
import type { Monitor, Website } from '../types';
export function AddMonitorDialog({
  open,
  onOpenChange,
  monitor,
  website,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  monitor?: Monitor;
  website?: Website;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={monitor ? 'Edit monitor' : website ? 'Add a page' : 'Keep an eye on something new'}
      description={
        monitor ? 'Fine-tune how we check your website.' : 'Add a website. We’ll take it from here.'
      }
    >
      {open && (
        <MonitorForm
          monitor={monitor}
          website={website}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Modal>
  );
}
export function MonitorForm({
  monitor,
  website,
  onSaved,
  onCancel,
}: {
  monitor?: Monitor;
  website?: Website;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const client = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MonitorInput, unknown, MonitorConfig>({
    resolver: zodResolver(monitorSchema),
    defaultValues: monitor
      ? {
          name: monitor.name,
          url: monitor.url,
          method: monitor.method,
          intervalSeconds: monitor.intervalSeconds,
          timeoutMs: monitor.timeoutMs,
          expectedStatusCodes: monitor.expectedStatusCodes,
          failureThreshold: monitor.failureThreshold,
          recoveryThreshold: monitor.recoveryThreshold,
          isActive: monitor.isActive,
        }
      : {
          websiteId: website?.id,
          name: '',
          url: website ? website.url + '/' : '',
          method: 'GET',
          intervalSeconds: 60,
          timeoutMs: 10000,
          expectedStatusCodes: [200],
          failureThreshold: 2,
          recoveryThreshold: 1,
          isActive: true,
        },
  });
  const mutation = useMutation({
    mutationFn: (data: MonitorConfig) =>
      api(monitor ? `/monitors/${monitor.id}` : '/monitors', {
        method: monitor ? 'PATCH' : 'POST',
        body: data,
      }),
    onSuccess: () => {
      void client.invalidateQueries();
      toast.success(monitor ? 'Monitor updated' : 'Monitor added. Your first check is on its way.');
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="form">
      <label>
        Monitor name
        <input placeholder="e.g. Main website" {...register('name')} />
        <FieldError message={errors.name?.message} />
      </label>
      <label>
        Website URL
        <div className="input-icon">
          <Globe size={17} />
          <input placeholder="https://example.com" {...register('url')} />
        </div>
        <FieldError message={errors.url?.message} />
        <small>
          {website
            ? `Use a full page URL on ${website.url}.`
            : 'Public HTTP and HTTPS destinations only. Redirects are not followed.'}
        </small>
      </label>
      <div className="form-grid">
        <label>
          Check every
          <select {...register('intervalSeconds', { valueAsNumber: true })}>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={600}>10 minutes</option>
            <option value={3600}>1 hour</option>
          </select>
        </label>
        <label>
          Request method
          <select {...register('method')}>
            <option>GET</option>
            <option>HEAD</option>
          </select>
        </label>
      </div>
      <details className="advanced">
        <summary>Advanced settings</summary>
        <div className="form-grid">
          <label>
            Timeout (ms)
            <input type="number" {...register('timeoutMs', { valueAsNumber: true })} />
            <FieldError message={errors.timeoutMs?.message} />
          </label>
          <label>
            Expected HTTP codes
            <input
              placeholder="200, 204"
              defaultValue={monitor?.expectedStatusCodes.join(', ') ?? '200'}
              {...register('expectedStatusCodes', {
                setValueAs: (v: string | number[]) =>
                  Array.isArray(v) ? v : v.split(',').map((s) => Number(s.trim())),
              })}
            />
            <FieldError message={errors.expectedStatusCodes?.message} />
          </label>
          <label>
            Failures before outage
            <input type="number" {...register('failureThreshold', { valueAsNumber: true })} />
          </label>
          <label>
            Successes before recovery
            <input type="number" {...register('recoveryThreshold', { valueAsNumber: true })} />
          </label>
        </div>
        <small>Consecutive checks confirm an outage before sending an alert.</small>
      </details>
      <label className="checkbox-line">
        <input type="checkbox" {...register('isActive')} />
        Start monitoring immediately
      </label>
      {mutation.error && (
        <p className="field-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : monitor ? 'Save changes' : 'Create monitor'}
          <ArrowRight size={15} />
        </button>
      </div>
    </form>
  );
}
