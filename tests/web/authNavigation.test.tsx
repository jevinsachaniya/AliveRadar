import { describe, expect, it } from 'vitest';
import { authPath, returnTarget } from '../../apps/web/src/authNavigation';

describe('return to a monitoring action after authentication', () => {
  it('preserves an internal action and search filter through auth links', () => {
    expect(returnTarget('/websites?add=website')).toBe('/websites?add=website');
    expect(returnTarget('/monitors?focus=search')).toBe('/monitors?focus=search');
    expect(authPath('/register/otp', '/websites?add=website')).toBe(
      '/register/otp?next=%2Fwebsites%3Fadd%3Dwebsite',
    );
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%2f%2fevil.example',
    '/login',
    '/register/otp',
    '/api/v1/auth/demo',
    '/websites\n',
    '/websites/../../login',
  ])('rejects unsafe or looping return targets: %s', (value) => {
    expect(returnTarget(value)).toBe('/');
    expect(authPath('/login', value)).toBe('/login');
  });
});
