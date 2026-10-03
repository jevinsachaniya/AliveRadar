import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  X,
  Plus,
  Globe,
  AlertCircle,
  RefreshCw,
  Check,
  Clock,
  Pause,
  HelpCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Status, Daily } from '../types';
export function LogoMark({ className = '', label = '' }: { className?: string; label?: string }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src="/brand/aliveradar-mark.png"
      alt={label}
      width={128}
      height={128}
      decoding="async"
    />
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark">
        <LogoMark label={compact ? 'AliveRadar' : ''} />
      </span>
      {!compact && (
        <span>
          Alive<span className="brand-soft">Radar</span>
          <span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  const Icon = { UP: Check, DOWN: AlertCircle, PAUSED: Pause, PENDING: Clock, UNKNOWN: HelpCircle }[
    status
  ];
  return (
    <span className={`status-badge ${status.toLowerCase()}`}>
      <Icon size={12} />
      {{ UP: 'Up', DOWN: 'Down', PAUSED: 'Paused', PENDING: 'Pending', UNKNOWN: 'Unknown' }[status]}
    </span>
  );
}
export const percent = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toFixed(2)}%`;
export const milliseconds = (value: number | null | undefined) =>
  value == null ? '—' : `${Math.round(value)} ms`;
export function relative(date: string | null) {
  if (!date) return 'Awaiting first check';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : `${Math.floor(seconds / 86400)}d ago`;
}
export function duration(ms: number) {
  const mins = Math.round(ms / 60000);
  return mins < 1
    ? 'Less than a minute'
    : mins < 60
      ? `${mins} min`
      : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
export function utc(date: string) {
  return (
    new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}
export function UptimeBar({ daily = [], paused = false }: { daily?: Daily[]; paused?: boolean }) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return (
    <div className="uptime-bar" aria-label="Observed daily uptime over the last 30 days">
      {Array.from({ length: 30 }, (_, i) => {
        const date = new Date(today.getTime() - (29 - i) * 86400000).toISOString().slice(0, 10);
        const day = daily.find((d) => d.day.slice(0, 10) === date);
        const status = day
          ? day.up === day.checks
            ? 'healthy'
            : day.up / day.checks > 0.5
              ? 'partial'
              : 'failed'
          : 'missing';
        return (
          <span
            key={date}
            className={`${status} ${paused && i === 29 ? 'paused-day' : ''}`}
            title={`${date}: ${day ? `${((day.up / day.checks) * 100).toFixed(2)}% (${day.checks} observed checks)` : 'No observed checks'}${paused && i === 29 ? ' · Currently paused' : ''}`}
          />
        );
      })}
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  title = 'Delete this monitor?',
  description = 'This permanently removes the monitor, its checks, incidents, and status-page assignments.',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content confirm-dialog">
          <span className="danger-icon">
            <AlertCircle />
          </span>
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel className="button secondary">Cancel</AlertDialog.Cancel>
            <button className="button danger" disabled={pending} onClick={onConfirm}>
              {pending ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
export function EmptyState({
  title = 'A clear view starts here',
  description = 'Add your first website and we’ll keep an eye on it.',
  action,
  onAction,
}: {
  title?: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Globe size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button primary" onClick={onAction}>
          <Plus size={15} />
          {action}
        </button>
      )}
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div className="loading-state" role="status" aria-label="Loading workspace">
      <div className="skeleton heading-skeleton" />
      <div className="metrics-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton metric-skeleton" />
        ))}
      </div>
      <div className="skeleton panel-skeleton" />
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="empty-state error-state">
      <AlertCircle size={28} />
      <h3>We couldn’t load this view</h3>
      <p>{error.message}</p>
      <button className="button secondary" onClick={onRetry}>
        <RefreshCw size={15} />
        Try again
      </button>
    </div>
  );
}
export function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="field-error" role="alert">
      {message}
    </span>
  ) : null;
}
export function MetricCard({
  label,
  value,
  suffix,
  icon,
  detail,
  tone = 'purple',
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  icon: ReactNode;
  detail: ReactNode;
  tone?: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {label}
        <span className={`metric-icon ${tone}`}>{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <span>{suffix}</span>
      </div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
