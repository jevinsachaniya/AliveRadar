import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { MonitorForm } from '../../apps/web/src/components/AddMonitorDialog';
import { WebsiteForm } from '../../apps/web/src/components/AddWebsiteDialog';
import { EmptyState, ErrorState, StatusBadge, UptimeBar } from '../../apps/web/src/components/ui';
import { AuthPage } from '../../apps/web/src/pages/Auth';
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}
describe('monitor form and meaningful dashboard states', () => {
  it('rejects a page from another website without sending a request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<WebsiteForm onSaved={vi.fn()} onCancel={vi.fn()} />, { wrapper });
    await userEvent.type(screen.getByLabelText('Website name'), 'My store');
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com');
    await userEvent.type(screen.getByLabelText('Page 2 name'), 'Checkout');
    await userEvent.type(screen.getByLabelText('Page 2 URL'), 'https://other.example.com/checkout');
    await userEvent.click(screen.getByRole('button', { name: 'Start monitoring website' }));
    expect(
      await screen.findByText('Use a URL on this website without credentials or a fragment.'),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it('submits named pages with the explicit email opt-in', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'website-1' }), { status: 201 }));
    const saved = vi.fn();
    render(<WebsiteForm onSaved={saved} onCancel={vi.fn()} />, { wrapper });
    await userEvent.type(screen.getByLabelText('Website name'), 'My store');
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com');
    await userEvent.type(screen.getByLabelText('Page 2 name'), 'Checkout');
    await userEvent.type(screen.getByLabelText('Page 2 URL'), '/checkout');
    await userEvent.click(screen.getByRole('button', { name: 'Start monitoring website' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(body.pages).toEqual([
      { name: 'Home', url: '/' },
      { name: 'Checkout', url: '/checkout' },
    ]);
    expect(body.emailEnabled).toBe(true);
    fetch.mockRestore();
  });
  it('validates a missing name and unsupported URL without sending a request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<MonitorForm onSaved={vi.fn()} onCancel={vi.fn()} />, { wrapper });
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'ftp://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create monitor' }));
    expect(await screen.findByText('Give your monitor a name.')).toBeInTheDocument();
    expect(
      await screen.findByText('Use an HTTP or HTTPS URL without credentials or a fragment.'),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it('submits a configured monitor to the real API adapter', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'monitor-1' }), { status: 201 }));
    const onSaved = vi.fn();
    render(<MonitorForm onSaved={onSaved} onCancel={vi.fn()} />, { wrapper });
    await userEvent.type(screen.getByPlaceholderText('e.g. Main website'), 'My website');
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create monitor' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/monitors',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('My website') }),
    );
    fetch.mockRestore();
  });
  it('communicates every status with text and treats missing history as unknown', () => {
    render(
      <>
        <StatusBadge status="UP" />
        <StatusBadge status="DOWN" />
        <StatusBadge status="PAUSED" />
        <StatusBadge status="PENDING" />
        <StatusBadge status="UNKNOWN" />
        <UptimeBar />
      </>,
    );
    for (const text of ['Up', 'Down', 'Paused', 'Pending', 'Unknown'])
      expect(screen.getByText(text)).toBeInTheDocument();
    expect(
      screen.getByLabelText('Observed daily uptime over the last 30 days').children,
    ).toHaveLength(30);
    expect(
      screen.getByLabelText('Observed daily uptime over the last 30 days').firstElementChild,
    ).toHaveAttribute('title', expect.stringContaining('No observed checks'));
  });
  it('has actionable empty and error states', async () => {
    const add = vi.fn(),
      retry = vi.fn();
    render(
      <>
        <EmptyState action="Add monitor" onAction={add} />
        <ErrorState error={new Error('Unavailable')} onRetry={retry} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add monitor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(add).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
  });
  it('reports an incorrect login response', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Email or password is incorrect.' } }), {
        status: 401,
      }),
    );
    render(<AuthPage />, { wrapper });
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'me@example.com');
    await userEvent.type(screen.getByPlaceholderText('Your password'), 'incorrect');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    fetch.mockRestore();
  });
});
