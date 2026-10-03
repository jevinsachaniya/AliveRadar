import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Activity, Globe, CheckCircle2 } from 'lucide-react';
import { registrationSchema, loginSchema } from '../../../../packages/shared/src/validation';
import { api } from '../api';
import type { OtpChallenge } from '../types';
import { saveChallenge } from '../otp';
import { authPath } from '../authNavigation';
import { Brand, FieldError } from '../components/ui';
import { WebsiteFrame } from '../components/SiteLayout';
export function AuthPage({ mode = 'login' }: { mode?: 'login' | 'register' | 'forgot' | 'reset' }) {
  return (
    <AuthShell>
      {mode === 'forgot' || mode === 'reset' ? (
        <ResetForm mode={mode} />
      ) : (
        <SignInForm mode={mode} />
      )}
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
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
          <div className="auth-form-container">{children}</div>
          <footer>
            AliveRadar <span>·</span> Every page, on your radar.
          </footer>
        </div>
      </div>
    </WebsiteFrame>
  );
}
function SignInForm({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
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
      api<OtpChallenge>(`/auth/${mode}`, { method: 'POST', body }),
    onSuccess: (data) => {
      saveChallenge(data);
      navigate(authPath(`/${mode}/otp`, next));
    },
  });
  return (
    <>
      <span className="form-eyebrow">WELCOME {registration ? 'ABOARD' : 'BACK'}</span>
      <h1>{registration ? 'Your peace of mind starts here.' : 'Good to see you again.'}</h1>
      <p className="auth-intro">
        {registration
          ? 'Create your AliveRadar account. We’ll email a code to verify your address.'
          : 'Enter your password, then verify the code sent to your email.'}
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
        <Link to={authPath(registration ? '/login' : '/register', next)}>
          {registration ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
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
