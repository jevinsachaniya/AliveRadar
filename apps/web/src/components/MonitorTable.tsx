import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Globe,
  MoreHorizontal,
  ExternalLink,
  Pause,
  Play,
  Pencil,
  Trash2,
  Code2,
  BookOpen,
  ShoppingBag,
  ShieldCheck,
  Cloud,
} from 'lucide-react';
import { api } from '../api';
import type { Monitor } from '../types';
import { StatusBadge, UptimeBar, percent, milliseconds, ConfirmDialog, relative } from './ui';
import { AddMonitorDialog } from './AddMonitorDialog';
const icons = [Globe, Code2, BookOpen, ShoppingBag, ShieldCheck, Cloud];
export function MonitorActions({ monitor }: { monitor: Monitor }) {
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: string) =>
      api(`/monitors/${monitor.id}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
      }),
    onSuccess: () => {
      void client.invalidateQueries();
      toast.success('Monitor updated');
      setRemove(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <details className="row-menu">
        <summary className="icon-button" aria-label={`Actions for ${monitor.name}`}>
          <MoreHorizontal size={19} />
        </summary>
        <div
          className="row-menu-content"
          onClick={(event) => {
            (event.currentTarget.parentElement as HTMLDetailsElement).open = false;
          }}
        >
          <button onClick={() => setEdit(true)}>
            <Pencil size={14} />
            Edit monitor
          </button>
          <button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(monitor.isActive ? 'pause' : 'resume')}
          >
            {monitor.isActive ? <Pause size={14} /> : <Play size={14} />}{' '}
            {monitor.isActive ? 'Pause' : 'Resume'} monitoring
          </button>
          <a href={monitor.url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            Visit website
          </a>
          <button className="text-danger" onClick={() => setRemove(true)}>
            <Trash2 size={14} />
            Delete monitor
          </button>
        </div>
      </details>
      <AddMonitorDialog open={edit} onOpenChange={setEdit} monitor={monitor} />
      <ConfirmDialog
        open={remove}
        onOpenChange={setRemove}
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate('delete')}
      />
    </>
  );
}
function MonitorIdentity({ monitor, index }: { monitor: Monitor; index: number }) {
  const Icon = icons[index % icons.length];
  let host: string;
  try {
    host = new URL(monitor.url).host;
  } catch {
    host = monitor.url;
  }
  return (
    <div className="monitor-identity">
      <span className={`monitor-icon color-${index % 6}`}>
        <Icon size={18} />
      </span>
      <div>
        <Link to={`/monitors/${monitor.id}`} className="monitor-name">
          {monitor.name}
        </Link>
        <span className="monitor-url">
          {host}
          <span className="url-path">
            {new URL(monitor.url).pathname === '/' ? '' : new URL(monitor.url).pathname}
          </span>
        </span>
      </div>
    </div>
  );
}
export function MonitorTable({ monitors }: { monitors: Monitor[] }) {
  return (
    <div className="table-scroll">
      <table className="monitor-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th>Monitor</th>
            <th>Status</th>
            <th>
              Uptime <span>24h</span>
            </th>
            <th>Response time</th>
            <th>
              Uptime history <span>30 days</span>
            </th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody role="rowgroup">
          {monitors.map((m, i) => (
            <tr key={m.id} role="row">
              <td className="monitor-identity-cell" role="cell">
                <MonitorIdentity monitor={m} index={i} />
              </td>
              <td className="monitor-status-cell" data-label="Status" role="cell">
                <StatusBadge status={m.currentStatus} />
              </td>
              <td
                className={`uptime-number ${m.analytics?.uptime == null ? 'muted' : ''}`}
                data-label="Uptime · 24h"
                role="cell"
              >
                {percent(m.analytics?.uptime)}
              </td>
              <td className="monitor-response-cell" data-label="Response time" role="cell">
                <span className="response-number">
                  {milliseconds(m.latestCheck?.responseTimeMs ?? m.analytics?.latestResponseMs)}
                </span>
              </td>
              <td className="history-cell" data-label="Uptime history · 30 days" role="cell">
                <UptimeBar daily={m.analytics?.daily} paused={!m.isActive} />
              </td>
              <td className="monitor-actions-cell" role="cell">
                <MonitorActions monitor={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function MonitorCard({ monitor, index }: { monitor: Monitor; index: number }) {
  return (
    <div className="monitor-card">
      <div className="monitor-card-top">
        <MonitorIdentity monitor={monitor} index={index} />
        <MonitorActions monitor={monitor} />
      </div>
      <div className="monitor-card-stats">
        <StatusBadge status={monitor.currentStatus} />
        <span>{percent(monitor.analytics?.uptime)} uptime</span>
        <span>{milliseconds(monitor.latestCheck?.responseTimeMs)}</span>
      </div>
      <UptimeBar daily={monitor.analytics?.daily} />
      <span className="small muted">{relative(monitor.lastCheckedAt)}</span>
    </div>
  );
}
