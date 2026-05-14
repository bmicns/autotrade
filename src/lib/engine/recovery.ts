export const ENGINE_LOCK_TTL_MINUTES = 5;

export function resolveEngineLockState(
  lockValue: unknown,
  nowMs = Date.now(),
  ttlMinutes = ENGINE_LOCK_TTL_MINUTES,
) {
  const lockedAt = typeof lockValue === "string" && lockValue ? lockValue : null;
  if (!lockedAt) {
    return { locked: false, stale: false, lockedAt: null, ageMinutes: null };
  }

  const lockMs = new Date(lockedAt).getTime();
  if (!Number.isFinite(lockMs)) {
    return { locked: false, stale: false, lockedAt, ageMinutes: null };
  }

  const ageMinutes = Math.max(0, Math.floor((nowMs - lockMs) / 60000));
  const activeWindowMs = ttlMinutes * 60 * 1000;

  return {
    locked: nowMs - lockMs < activeWindowMs,
    stale: nowMs - lockMs >= activeWindowMs,
    lockedAt,
    ageMinutes,
  };
}
