const origin = 'https://aliveradar.invalid';

export const addWebsiteTarget = '/websites?add=website';

export function returnTarget(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) <= 32)
  )
    return '/';
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      !/^\/(?:overview|websites|monitors|incidents|status-pages|notifications|settings)(?:\/[a-zA-Z0-9_-]+)?$/.test(
        url.pathname,
      )
    )
      return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export function authPath(path: string, target: string | null) {
  const next = returnTarget(target);
  return next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`;
}
