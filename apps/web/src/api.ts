let csrfToken = '';
export function setCsrf(value: string) {
  csrfToken = value;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: { message: 'Service unavailable. Please try again.' } }));
    throw new HttpError(
      response.status,
      body.error?.details?.[0]?.message ?? body.error?.message ?? 'Request failed.',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
