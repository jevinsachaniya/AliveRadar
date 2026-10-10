import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { api, HttpError } from '../api';
import { localDateTime } from '../components/ui';
import type { User, Website } from '../types';
import './network-checker.css';

type NetworkResult = {
  dnsStatus: 'UNKNOWN' | 'RESOLVED' | 'FAILED';
  dnsAddress: string | null;
  dnsError: string | null;
  dnsCheckedAt: string | null;
  tlsStatus: 'UNKNOWN' | 'NOT_APPLICABLE' | 'VALID' | 'EXPIRING' | 'FAILED';
  tlsExpiresAt: string | null;
  tlsDaysRemaining: number | null;
  tlsError: string | null;
  tlsCheckedAt: string | null;
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function dnsSummary(result: NetworkResult) {
  if (result.dnsStatus === 'RESOLVED')
    return {
      label: 'DNS is resolving',
      detail: result.dnsAddress ?? 'Public address found',
      good: true,
    };
  if (result.dnsStatus === 'FAILED')
    return {
      label: 'DNS needs attention',
      detail: result.dnsError ?? 'The hostname could not be resolved.',
      good: false,
    };
  return { label: 'DNS result unavailable', detail: 'Try the check again.', good: false };
}

function tlsSummary(result: NetworkResult) {
  if (result.tlsStatus === 'VALID')
    return {
      label: 'Certificate is valid',
      detail:
        result.tlsDaysRemaining === null
          ? 'Certificate validation passed.'
          : `${result.tlsDaysRemaining} days remaining`,
      good: true,
    };
  if (result.tlsStatus === 'EXPIRING')
    return {
      label: 'Certificate expires soon',
      detail: `${result.tlsDaysRemaining ?? 'A limited number of'} days remaining. Renew it before visitors see a browser warning.`,
      good: false,
    };
  if (result.tlsStatus === 'FAILED')
    return {
      label: 'SSL needs attention',
      detail: result.tlsError ?? 'The certificate or secure connection could not be validated.',
      good: false,
    };
  if (result.tlsStatus === 'NOT_APPLICABLE')
    return {
      label: 'No SSL certificate',
      detail: 'This URL uses HTTP instead of HTTPS.',
      good: false,
    };
  return { label: 'SSL result unavailable', detail: 'Try the check again.', good: false };
}

function SignalCard({
  title,
  icon,
  summary,
  checkedAt,
  expiresAt,
}: {
  title: string;
  icon: 'dns' | 'ssl';
  summary: { label: string; detail: string; good: boolean };
  checkedAt: string | null;
  expiresAt?: string | null;
}) {
  const Icon = icon === 'dns' ? Globe2 : ShieldCheck;
  return (
    <article className={`checker-signal-card ${summary.good ? 'is-good' : 'is-warning'}`}>
      <div className="checker-signal-icon">
        <Icon size={21} />
      </div>
      <div className="checker-signal-content">
        <span>{title}</span>
        <h3>{summary.label}</h3>
        <p>{summary.detail}</p>
        <small>
          {expiresAt
            ? `Expires ${localDateTime(expiresAt)}`
            : checkedAt
              ? `Checked ${localDateTime(checkedAt)}`
              : 'No timestamp available'}
        </small>
      </div>
      {summary.good ? (
        <CheckCircle2 size={20} aria-label="Healthy" />
      ) : (
        <CircleAlert size={20} aria-label="Needs attention" />
      )}
    </article>
  );
}

export function NetworkChecker({ user }: { user?: User }) {
  const [value, setValue] = useState('');
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('');
  const [result, setResult] = useState<NetworkResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const hasPrefilledWebsite = useRef(false);
  const websites = useQuery({
    queryKey: ['network-checker-websites', user?.id],
    queryFn: () => api<{ items: Website[] }>('/websites'),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const savedWebsites = websites.data?.items ?? [];

  useEffect(() => {
    const firstWebsite = savedWebsites[0];
    if (!firstWebsite || hasPrefilledWebsite.current || value) return;
    hasPrefilledWebsite.current = true;
    setSelectedWebsiteId(firstWebsite.id);
    setValue(firstWebsite.url);
  }, [savedWebsites, value]);

  function chooseWebsite(websiteId: string) {
    hasPrefilledWebsite.current = true;
    setSelectedWebsiteId(websiteId);
    const website = savedWebsites.find((item) => item.id === websiteId);
    if (website) setValue(website.url);
    setResult(null);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) {
      setError('Enter a website URL to run a check.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await api<NetworkResult>('/public/network-check', {
          method: 'POST',
          body: { url: normalizeUrl(value) },
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof HttpError
          ? reason.message
          : 'We could not complete this check. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  const hasIssue = result && (!dnsSummary(result).good || !tlsSummary(result).good);
  return (
    <div className="checker-page">
      <section className="checker-hero">
        <div className="checker-orbit checker-orbit-one" />
        <div className="checker-orbit checker-orbit-two" />
        <div className="checker-intro">
          <span className="checker-kicker">
            <LockKeyhole size={14} />{' '}
            {user ? 'YOUR WEBSITE HEALTH TOOL' : 'FREE WEBSITE HEALTH TOOL'}
          </span>
          <h1>SSL & DNS Checker</h1>
          <p>
            Check whether a website hostname resolves and whether its HTTPS certificate is valid and
            close to expiry.
          </p>
          <form className="checker-form" onSubmit={submit} noValidate>
            {user && (
              <div className="checker-saved-websites">
                <label htmlFor="network-check-saved-website">Your saved websites</label>
                {websites.isPending ? (
                  <p>Loading your saved websites…</p>
                ) : savedWebsites.length ? (
                  <div className="checker-select-wrap">
                    <select
                      id="network-check-saved-website"
                      value={selectedWebsiteId}
                      onChange={(event) => chooseWebsite(event.target.value)}
                    >
                      <option value="">Choose a saved website</option>
                      {savedWebsites.map((website) => (
                        <option key={website.id} value={website.id}>
                          {website.name} — {website.url}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} aria-hidden="true" />
                  </div>
                ) : (
                  <p>No saved websites yet. Enter any public website URL below.</p>
                )}
                {!websites.isPending && savedWebsites.length > 0 && (
                  <small>
                    Choose a saved site to fill the URL below, or enter a different URL.
                  </small>
                )}
              </div>
            )}
            <label htmlFor="network-check-url">Website URL to check</label>
            <div className="checker-url-row">
              <input
                id="network-check-url"
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder="example.com or https://example.com"
                value={value}
                onChange={(event) => {
                  hasPrefilledWebsite.current = true;
                  setSelectedWebsiteId('');
                  setValue(event.target.value);
                }}
                aria-describedby={error ? 'network-check-error' : undefined}
              />
              <button type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="checker-spinner" size={17} /> : 'Run check'}
                {!loading && <ArrowRight size={17} />}
              </button>
            </div>
            <span>
              {user
                ? 'Choose a saved site or enter any public HTTP/HTTPS URL. Results are not saved.'
                : 'Public HTTP and HTTPS sites only. Results are not saved.'}
            </span>
          </form>
          {error && (
            <p id="network-check-error" className="checker-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="checker-hero-note" aria-label="Checks included">
          <span>IN THIS CHECK</span>
          <div>
            <Globe2 size={18} />
            <strong>DNS resolution</strong>
            <p>Confirms the hostname resolves to a public address.</p>
          </div>
          <div>
            <ShieldCheck size={18} />
            <strong>SSL certificate</strong>
            <p>Validates the certificate, hostname, and expiry window.</p>
          </div>
        </aside>
      </section>

      {result && (
        <section
          className="checker-results"
          aria-live="polite"
          aria-labelledby="checker-results-title"
        >
          <div className="checker-results-heading">
            <span>{hasIssue ? 'ACTION MAY BE NEEDED' : 'ALL CLEAR'}</span>
            <h2 id="checker-results-title">Results for {normalizeUrl(value)}</h2>
            <p>
              {hasIssue
                ? 'Review the highlighted signal before it affects visitors.'
                : 'The hostname and HTTPS certificate passed this one-time check.'}
            </p>
          </div>
          <div className="checker-signal-grid">
            <SignalCard
              title="DNS resolution"
              icon="dns"
              summary={dnsSummary(result)}
              checkedAt={result.dnsCheckedAt}
            />
            <SignalCard
              title="SSL certificate"
              icon="ssl"
              summary={tlsSummary(result)}
              checkedAt={result.tlsCheckedAt}
              expiresAt={result.tlsExpiresAt}
            />
          </div>
        </section>
      )}

      <section className="checker-explainer">
        <div>
          <span className="checker-kicker">KEEP WATCHING</span>
          <h2>A one-time check is useful. Continuous monitoring is better.</h2>
        </div>
        <p>
          AliveRadar monitors the important pages of your website over time, records availability
          and response time, and can email you when a page, DNS resolution, or SSL certificate needs
          attention.
        </p>
        <Link to="/register" className="checker-cta">
          Start monitoring <ArrowRight size={17} />
        </Link>
      </section>
    </div>
  );
}
