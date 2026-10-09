import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { LogOut, Activity, ExternalLink, Shield, UserRound } from 'lucide-react';
import { api, setCsrf } from '../api';
import type { User, Overview } from '../types';
import { localDateTime } from '../components/ui';
export function Settings({ user }: { user: User }) {
  const navigate = useNavigate(),
    client = useQueryClient();
  const health = useQuery({
    queryKey: ['overview', 1],
    queryFn: () => api<Overview>('/overview'),
    refetchInterval: 15000,
  });
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setCsrf('');
      sessionStorage.setItem('pulse-signed-out', 'true');
      client.clear();
      navigate('/login');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">MAKE YOURSELF AT HOME</div>
          <h1>
            Settings<span className="heading-dot">.</span>
          </h1>
          <p>Your account and monitoring environment.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <div className="panel-title-row">
          <div className="panel-title">
            <UserRound size={18} />
            <h2>Your profile</h2>
          </div>
          <span className="count-pill">{user.isDemo ? 'Demo account' : 'Personal account'}</span>
        </div>
        <div className="setting-row">
          <div>
            <h3>Name</h3>
            <p>{user.name}</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Email address</h3>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Member since</h3>
            <p>{localDateTime(user.createdAt)}</p>
          </div>
          <button className="button secondary" onClick={() => void logout()}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
        {user.isDemo && (
          <div className="setting-row">
            <div>
              <h3>Ready to monitor your own services?</h3>
              <p>Start your own account with a fresh monitoring history.</p>
            </div>
            <Link className="button primary" to="/register">
              Create an account
            </Link>
          </div>
        )}
      </section>
      <section className="panel settings-panel">
        <div className="panel-title-row">
          <div className="panel-title">
            <Activity size={18} />
            <h2>Monitoring environment</h2>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Background worker</h3>
            <p>Checks continue even after you close your browser.</p>
          </div>
          <span className={`incident-tag ${health.data?.workerHealthy ? 'resolved' : ''}`}>
            {health.isPending
              ? 'Checking…'
              : health.error
                ? 'Unavailable'
                : health.data?.workerHealthy
                  ? 'Healthy'
                  : 'Offline'}
          </span>
        </div>
        <div className="setting-row">
          <div>
            <h3>Check history</h3>
            <p>
              Default retention is 90 days. Your administrator can configure it with RETENTION_DAYS.
            </p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Reporting timezone</h3>
            <p>
              Timestamps display in your browser’s local time. Missing and paused periods do not
              count as successful checks.
            </p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>API documentation</h3>
            <p>Explore the versioned REST API and request schemas.</p>
          </div>
          <a href="/api/docs" target="_blank" rel="noreferrer" className="button secondary">
            Open docs
            <ExternalLink size={14} />
          </a>
        </div>
      </section>
      <div className="security-note">
        <Shield size={17} />
        <span>Your session uses an HttpOnly cookie. Private network destinations are blocked.</span>
      </div>
    </>
  );
}
