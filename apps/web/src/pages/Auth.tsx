import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Activity, Globe, CheckCircle2 } from 'lucide-react';
import { registrationSchema, loginSchema } from '../../../../packages/shared/src/validation';
import { api, setCsrf } from '../api';
import type { Auth as AuthData } from '../types';
import { Brand, FieldError } from '../components/ui';
import { WebsiteFrame } from '../components/SiteLayout';
export function AuthPage({ mode = 'login' }: { mode?: 'login' | 'register' | 'forgot' | 'reset' }) {
  return (
    <WebsiteFrame>
      <div className="auth-layout">
        <div className="auth-story">
          <Link to="/">
            <Brand />
          </Link>
          <div className="auth-story-body">
            <span className="auth-eyebrow">LESS WORRY. MORE BUILDING.</span>
            <h1>
              Your websites.
              <br />
              On our radar<span>.</span>
            </h1>
            <p>
              Know what’s up. Know when it isn’t.
              <br />
              AliveRadar keeps every page in view.
            </p>
            <div className="auth-monitor-preview">
              <div>
                <span>
                  <Globe size={17} />
                  Your next great idea
                </span>
                <span>
                  <CheckCircle2 size={14} />
                  Operational
                </span>
              </div>
              <div className="auth-bar">
                {Array.from({ length: 32 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
              <footer>
                <span>Illustrative preview</span>
                <Activity size={17} />
              </footer>
            </div>
            <div className="auth-benefits">
              <span>
                <ShieldCheck size={16} />
                Secure by design
              </span>
              <span>
                <Activity size={16} />
                Always in the loop
              </span>
            </div>
          </div>
          <p className="auth-story-footer">Every page, on your radar.</p>
        </div>
        <div className="auth-form-side">
          <Link to="/" className="mobile-auth-brand">
            <Brand />
          </Link>
          <div className="auth-form-container">
            {mode === 'forgot' || mode === 'reset' ? (
              <ResetForm mode={mode} />
            ) : (
              <SignInForm mode={mode} />
            )}
          </div>
          <footer>
            AliveRadar <span>·</span> Every page, on your radar.
          </footer>
        </div>
      </div>
    </WebsiteFrame>
  );
}
function SignInForm({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate(),
    client = useQueryClient();
  const registration = mode === 'register';
  const schema = registration
    ? registrationSchema
    : loginSchema.extend({ name: z.string().optional() });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (body: z.output<typeof schema>) =>
      api<AuthData>(`/auth/${registration ? 'register' : 'login'}`, { method: 'POST', body }),
    onSuccess: (data) => {
      setCsrf(data.csrfToken);
      sessionStorage.removeItem('pulse-signed-out');
      client.clear();
      client.setQueryData(['auth'], data);
      navigate('/');
    },
  });
  const demo = useMutation({
    mutationFn: () => api<AuthData>('/auth/demo', { method: 'POST' }),
    onSuccess: (data) => {
      setCsrf(data.csrfToken);
      sessionStorage.removeItem('pulse-signed-out');
      client.clear();
      client.setQueryData(['auth'], data);
      navigate('/');
    },
  });
  return (
    <>
      <span className="form-eyebrow">WELCOME {registration ? 'ABOARD' : 'BACK'}</span>
      <h1>{registration ? 'Your peace of mind starts here.' : 'Good to see you again.'}</h1>
      <p className="auth-intro">
        {registration
          ? 'Create your AliveRadar account and start watching your first website.'
          : 'Sign in to AliveRadar to see how your websites and pages are doing.'}
      </p>
      <form className="form" onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        {registration && (
          <label>
            Your name
            <input autoComplete="name" placeholder="Alex Morgan" {...register('name')} />
            <FieldError message={errors.name?.message} />
          </label>
        )}
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </label>
        <label>
          <span className="label-split">
            <span id="auth-password-label">Password</span>
            {!registration && <Link to="/forgot-password">Forgot password?</Link>}
          </span>
          <input
            type="password"
            aria-labelledby="auth-password-label"
            autoComplete={registration ? 'new-password' : 'current-password'}
            placeholder={registration ? 'At least 12 characters' : 'Your password'}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </label>
        {mutation.error && (
          <p className="field-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <button className="button primary auth-submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Just a moment…' : registration ? 'Create your account' : 'Sign in'}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        {registration ? 'Already have an account?' : 'New around here?'}{' '}
        <Link to={registration ? '/login' : '/register'}>
          {registration ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
      {import.meta.env.DEV && (
        <>
          <div className="auth-or">
            <span />
            OR EXPLORE FIRST
            <span />
          </div>
          <button
            className="button secondary auth-submit"
            disabled={demo.isPending}
            onClick={() => demo.mutate()}
          >
            Explore demo monitoring
            <ArrowRight size={15} />
          </button>
          <p className="demo-auth-note">Sample history, real local checks. No sign-up needed.</p>
          {demo.error && (
            <p className="field-error" role="alert">
              {demo.error.message}
            </p>
          )}
        </>
      )}
    </>
  );
}
function ResetForm({ mode }: { mode: 'forgot' | 'reset' }) {
  const [params] = useSearchParams(),
    [done, setDone] = useState(false);
  const [value, setValue] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api<{ message: string }>(
        `/auth/${mode === 'forgot' ? 'forgot-password' : 'reset-password'}`,
        {
          method: 'POST',
          body:
            mode === 'forgot' ? { email: value } : { token: params.get('token'), password: value },
        },
      ),
    onSuccess: () => setDone(true),
  });
  return (
    <>
      <span className="form-eyebrow">LET’S GET YOU BACK IN</span>
      <h1>{mode === 'forgot' ? 'Forgot your password?' : 'A fresh start.'}</h1>
      <p className="auth-intro">
        {mode === 'forgot'
          ? 'We’ll email a link if your account exists and email is configured.'
          : 'Choose a new password with at least 12 characters.'}
      </p>
      {done ? (
        <div className="reset-success">
          <CheckCircle2 size={25} />
          <p>{mutation.data?.message}</p>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label>
            {mode === 'forgot' ? 'Email address' : 'New password'}
            <input
              required
              type={mode === 'forgot' ? 'email' : 'password'}
              minLength={mode === 'reset' ? 12 : undefined}
              maxLength={mode === 'reset' ? 72 : 254}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          {mutation.error && (
            <p className="field-error" role="alert">
              {mutation.error.message}
            </p>
          )}
          <button className="button primary auth-submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Please wait…'
              : mode === 'forgot'
                ? 'Request reset link'
                : 'Update password'}
            <ArrowRight size={15} />
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link to="/login">Back to sign in</Link>
      </p>
    </>
  );
}
