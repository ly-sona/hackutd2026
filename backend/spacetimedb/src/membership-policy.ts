export const TEMPORARY_MEMBERSHIP_MS = 7n * 24n * 60n * 60n * 1000n;

// Called only after an administrator-issued invitation has been validated.
// Zero means indefinite access; a temporary membership must never become indefinite.
export function membershipExpiryForInvitation(
  existingExpiresAt: bigint | undefined,
  now: bigint,
): bigint {
  if (existingExpiresAt === undefined || existingExpiresAt === 0n) return 0n;
  return existingExpiresAt > now
    ? existingExpiresAt
    : now + TEMPORARY_MEMBERSHIP_MS;
}
