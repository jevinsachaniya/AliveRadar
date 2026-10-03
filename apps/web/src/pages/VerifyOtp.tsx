import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, MailCheck, ShieldCheck } from 'lucide-react';
import { api, setCsrf } from '../api';
import type { Auth, OtpChallenge } from '../types';
import { clearChallenges, readChallenge, saveChallenge } from '../otp';
import { AuthShell } from './Auth';
import { authPath, returnTarget } from '../authNavigation';

export function VerifyOtp({ purpose }: { purpose: OtpChallenge['purpose'] }) {
  const [challenge, setChallenge] = useState(() => readChallenge(purpose));
  const [code, setCode] = useState('');
  const [time, setTime] = useState(Date.now);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const client = useQueryClient();
  useEffect(() => {
    const timer = window.setInterval(() => setTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const verify = useMutation({
    mutationFn: () =>
      api<Auth>(`/auth/${purpose}/verify-otp`, {
        method: 'POST',
        body: { token: challenge?.token, code },
      }),
    onSuccess: (data) => {
      clearChallenges();
      setCsrf(data.csrfToken);
      sessionStorage.removeItem('pulse-signed-out');
      client.clear();
      client.setQueryData(['auth'], data);
      navigate(returnTarget(next), { replace: true });
    },
  });
  const resend = useMutation({
    mutationFn: () =>
      api<OtpChallenge>(`/auth/${purpose}/resend-otp`, {
        method: 'POST',
        body: { token: challenge?.token },
      }),
    onSuccess: (data) => {
      saveChallenge(data);
      setChallenge(data);
      setTime(Date.now());
      setCode('');
      setSent(true);
      verify.reset();
    },
  });
  if (!challenge) return <Navigate to={authPath(`/${purpose}`, next)} replace />;
  const remaining = Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - time) / 1000));
  const cooldown = Math.max(0, Math.ceil((Date.parse(challenge.resendAvailableAt) - time) / 1000));
  const pending = verify.isPending || resend.isPending;
  return (
    <AuthShell>
      <div className="otp-symbol">
        <MailCheck size={28} />
      </div>
      <span className="form-eyebrow">
        {purpose === 'login' ? 'SECURE SIGN-IN' : 'VERIFY YOUR EMAIL'}
      </span>
      <h1>{purpose === 'login' ? 'Verify your sign-in.' : 'One last step.'}</h1>
      <p className="auth-intro otp-intro">
        Enter the 6-digit code we sent to <strong>{challenge.email}</strong>
      </p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 6 && remaining > 0 && !pending) verify.mutate();
        }}
      >
        <label>
          Verification code
          <input
            className="otp-input"
            aria-label="Verification code"
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            placeholder="000000"
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
              verify.reset();
            }}
          />
        </label>
        <p className="otp-expiry" role="status">
          {remaining > 0
            ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
            : 'Your code has expired. Start again to get a new code.'}
        </p>
        {(verify.error || resend.error) && (
          <p className="field-error" role="alert">
            {(verify.error || resend.error)?.message}
          </p>
        )}
        <button
          className="button primary auth-submit"
          disabled={pending || code.length !== 6 || remaining === 0}
        >
          {verify.isPending
            ? 'Verifying…'
            : purpose === 'login'
              ? 'Verify & sign in'
              : 'Verify & create account'}
          <ArrowRight size={17} />
        </button>
      </form>
      <div className="otp-resend">
        <span>Didn’t receive the email? Check your spam folder.</span>
        <button
          type="button"
          className="button secondary"
          disabled={pending || cooldown > 0 || remaining === 0}
          onClick={() => resend.mutate()}
        >
          {resend.isPending
            ? 'Sending…'
            : cooldown > 0
              ? `Resend code in ${cooldown}s`
              : 'Resend code'}
        </button>
        {sent && <p role="status">A new code is on its way. Use the newest email.</p>}
      </div>
      <p className="auth-switch">
        <Link
          to={authPath(`/${purpose}`, next)}
          onClick={() => sessionStorage.removeItem(`aliveradar-otp-${purpose}`)}
        >
          Change email or start again
        </Link>
      </p>
      <p className="otp-security">
        <ShieldCheck size={15} />
        Your code is private. Never share it.
      </p>
    </AuthShell>
  );
}
