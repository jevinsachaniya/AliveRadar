import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthPage } from '../../apps/web/src/pages/Auth';
import { VerifyOtp } from '../../apps/web/src/pages/VerifyOtp';
import { clearChallenges, readChallenge, saveChallenge } from '../../apps/web/src/otp';

const challenge = {
  token: 'a'.repeat(64),
  email: 'me@example.com',
  purpose: 'register' as const,
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  resendAvailableAt: new Date(Date.now() + 60000).toISOString(),
};
function view(path = '/register/otp') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/register/otp" element={<VerifyOtp purpose="register" />} />
          <Route path="/" element={<p>Authenticated portal</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  vi.restoreAllMocks();
  clearChallenges();
});

describe('email OTP authentication', () => {
  it('returns to registration when no pending challenge exists', () => {
    view();
    expect(screen.getByLabelText('Your name')).toBeVisible();
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  });
  it('holds signup on the OTP page without setting authenticated query data', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(challenge), { status: 202 }));
    const client = view('/register');
    await userEvent.type(screen.getByLabelText('Your name'), 'New User');
    await userEvent.type(screen.getByLabelText('Email address'), challenge.email);
    await userEvent.type(screen.getByLabelText('Password'), 'my-secure-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Create your account' }));
    expect(await screen.findByLabelText('Verification code')).toBeVisible();
    expect(client.getQueryData(['auth'])).toBeUndefined();
    expect(readChallenge('register')).toEqual(challenge);
    expect(fetch).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('aliveradar-otp-register')).not.toContain('my-secure-password');
  });
  it('shows a wrong-code error without authorizing and keeps resend on cooldown', async () => {
    saveChallenge(challenge);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Incorrect code.' } }), { status: 400 }),
    );
    const client = view();
    await userEvent.type(screen.getByLabelText('Verification code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify & create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect code.');
    expect(screen.getByRole('button', { name: /Resend code in/ })).toBeDisabled();
    expect(client.getQueryData(['auth'])).toBeUndefined();
  });
  it('accepts numeric codes and grants access only after successful verification', async () => {
    saveChallenge(challenge);
    const auth = {
      user: { id: 'verified', name: 'New User', email: challenge.email },
      csrfToken: 'verified-csrf',
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(auth), { status: 201 }));
    const client = view();
    await userEvent.type(screen.getByLabelText('Verification code'), '12x3456');
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify & create account' }));
    expect(await screen.findByText('Authenticated portal')).toBeVisible();
    expect(client.getQueryData(['auth'])).toEqual(auth);
    expect(readChallenge('register')).toBeNull();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/auth/register/verify-otp',
        expect.objectContaining({
          body: JSON.stringify({ token: challenge.token, code: '123456' }),
        }),
      ),
    );
  });
});
