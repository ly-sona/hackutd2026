import { describe, expect, it } from 'vitest';
import { membershipExpiryForInvitation } from '../../backend/spacetimedb/src/membership-policy';

const now = 1_800_000_000_000n;
const sevenDays = 604_800_000n;

describe('temporary membership invitation renewal', () => {
  it('preserves the deadline of an unexpired temporary membership', () => {
    const deadline = now + 3_600_000n;
    expect(membershipExpiryForInvitation(deadline, now)).toBe(deadline);
  });

  it('renews an expired temporary membership without making it permanent', () => {
    const deadline = membershipExpiryForInvitation(now - 1n, now);
    expect(deadline).toBe(now + sevenDays);
    expect(deadline).toBeGreaterThan(now);
    expect(deadline).not.toBe(0n);
  });

  it('treats the exact expiration instant as expired', () => {
    expect(membershipExpiryForInvitation(now, now)).toBe(now + sevenDays);
  });

  it('preserves indefinite access only for new or already-indefinite memberships', () => {
    expect(membershipExpiryForInvitation(undefined, now)).toBe(0n);
    expect(membershipExpiryForInvitation(0n, now)).toBe(0n);
  });
});
