// Buy-in per registered user, in dollars. Override with the ENTRY_FEE env var.
export const ENTRY_FEE = Number(process.env.ENTRY_FEE) || 25;

// After this moment, no new accounts can be created. New registration attempts
// are rejected server-side and the sign-up form is replaced with a closed notice.
// Default: Saturday Sept 5, 2026 at 11:00 AM Eastern (EDT, UTC-4 — DST is active).
// Override with the REGISTRATION_CLOSES_AT env var (any Date-parseable string,
// e.g. "2026-09-05T11:00:00-04:00").
export const REGISTRATION_CLOSES_AT = new Date(
  process.env.REGISTRATION_CLOSES_AT || '2026-09-05T11:00:00-04:00'
);

export function registrationClosed(now = new Date()) {
  return now.getTime() >= REGISTRATION_CLOSES_AT.getTime();
}
