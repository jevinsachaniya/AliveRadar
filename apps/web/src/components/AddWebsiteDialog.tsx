import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  websiteSchema,
  type WebsiteInput,
  type WebsiteConfig,
} from '../../../../packages/shared/src/validation';
import { api } from '../api';
import { FieldError, Modal } from './ui';

export function AddWebsiteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Monitor a website"
      description="Name your pages and check each URL independently."
    >
      {open && (
        <WebsiteForm onSaved={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />
      )}
    </Modal>
  );
}

export function WebsiteForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<WebsiteInput, unknown, WebsiteConfig>({
    resolver: zodResolver(websiteSchema),
    defaultValues: {
      name: '',
      url: '',
      emailEnabled: true,
      intervalSeconds: 60,
      failureThreshold: 2,
      recoveryThreshold: 1,
      pages: [
        { name: 'Home', url: '/' },
        { name: '', url: '' },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'pages' });
  const create = useMutation({
    mutationFn: (body: WebsiteConfig) => api<{ id: string }>('/websites', { method: 'POST', body }),
    onSuccess: (website) => {
      void client.invalidateQueries();
      toast.success('Website added. Each page will be checked independently.');
      onSaved();
      navigate(`/websites/${website.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form className="form website-form" onSubmit={handleSubmit((body) => create.mutate(body))}>
      <label>
        Website name
        <input placeholder="e.g. My store" {...register('name')} />
        <FieldError message={errors.name?.message} />
      </label>
      <label>
        Website address
        <input placeholder="https://example.com" {...register('url')} />
        <FieldError message={errors.url?.message} />
        <small>Pages must use this same domain, protocol and port.</small>
      </label>
      <div className="website-form-pages">
        <h3>Pages to watch</h3>
        {fields.map((field, index) => (
          <div className="website-page-fields" key={field.id}>
            <label>
              Page {index + 1} name
              <input placeholder="e.g. Checkout" {...register(`pages.${index}.name`)} />
              <FieldError message={errors.pages?.[index]?.name?.message} />
            </label>
            <label>
              Page {index + 1} URL
              <input placeholder="/checkout or full URL" {...register(`pages.${index}.url`)} />
              <FieldError message={errors.pages?.[index]?.url?.message} />
            </label>
            <button
              type="button"
              className="icon-button"
              disabled={fields.length === 1}
              aria-label={`Remove page ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <FieldError message={errors.pages?.root?.message} />
        <button
          type="button"
          className="button secondary"
          disabled={fields.length >= 50}
          onClick={() => append({ name: '', url: '' })}
        >
          <Plus size={15} />
          Add another page
        </button>
      </div>
      <label>
        Check every
        <select {...register('intervalSeconds', { valueAsNumber: true })}>
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
          <option value={300}>5 minutes</option>
          <option value={600}>10 minutes</option>
        </select>
      </label>
      <label className="website-email-option">
        <input type="checkbox" {...register('emailEnabled')} />
        <span>
          Email me when a page goes down
          <small>
            Send alerts to my account email. Also enables account outage and recovery notifications.
          </small>
        </span>
      </label>
      <details className="advanced">
        <summary>Advanced settings</summary>
        <div className="form-grid">
          <label>
            Failures before alert
            <input
              type="number"
              min={1}
              max={10}
              {...register('failureThreshold', { valueAsNumber: true })}
            />
            <FieldError message={errors.failureThreshold?.message} />
          </label>
          <label>
            Successes before recovery
            <input
              type="number"
              min={1}
              max={10}
              {...register('recoveryThreshold', { valueAsNumber: true })}
            />
            <FieldError message={errors.recoveryThreshold?.message} />
          </label>
        </div>
      </details>
      <p className="muted">
        All active pages up: UP. Some down: DEGRADED. All down: DOWN. Paused pages are excluded.
      </p>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={create.isPending}>
          {create.isPending ? 'Adding website…' : 'Start monitoring website'}
        </button>
      </div>
    </form>
  );
}
