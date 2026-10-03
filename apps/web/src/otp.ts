import type { OtpChallenge } from './types';

export function saveChallenge(challenge: OtpChallenge) {
  sessionStorage.setItem(`aliveradar-otp-${challenge.purpose}`, JSON.stringify(challenge));
}

export function readChallenge(purpose: OtpChallenge['purpose']): OtpChallenge | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`aliveradar-otp-${purpose}`) || 'null');
    if (
      value?.purpose === purpose &&
      /^[a-f0-9]{64}$/.test(value.token) &&
      typeof value.email === 'string' &&
      Number.isFinite(Date.parse(value.expiresAt)) &&
      Number.isFinite(Date.parse(value.resendAvailableAt))
    )
      return value;
  } catch {
    /* A missing or corrupt pending verification must never authorize access. */
  }
  return null;
}

export function clearChallenges() {
  sessionStorage.removeItem('aliveradar-otp-login');
  sessionStorage.removeItem('aliveradar-otp-register');
}
