import test from "node:test";
import assert from "node:assert/strict";

import { ENGINE_LOCK_TTL_MINUTES, resolveEngineLockState } from "../../src/lib/engine/recovery";

test("resolveEngineLockState marks fresh lock as active", () => {
  const nowMs = Date.parse("2026-05-14T06:05:00.000Z");
  const lockAt = "2026-05-14T06:01:00.000Z";

  assert.deepEqual(resolveEngineLockState(lockAt, nowMs), {
    locked: true,
    stale: false,
    lockedAt: lockAt,
    ageMinutes: 4,
  });
});

test("resolveEngineLockState marks expired lock as stale recovery target", () => {
  const nowMs = Date.parse("2026-05-14T06:06:00.000Z");
  const lockAt = "2026-05-14T06:00:00.000Z";

  assert.deepEqual(resolveEngineLockState(lockAt, nowMs), {
    locked: false,
    stale: true,
    lockedAt: lockAt,
    ageMinutes: ENGINE_LOCK_TTL_MINUTES + 1,
  });
});

test("resolveEngineLockState ignores empty or invalid values", () => {
  assert.deepEqual(resolveEngineLockState("", Date.now()), {
    locked: false,
    stale: false,
    lockedAt: null,
    ageMinutes: null,
  });

  assert.deepEqual(resolveEngineLockState("invalid-date", Date.now()), {
    locked: false,
    stale: false,
    lockedAt: "invalid-date",
    ageMinutes: null,
  });
});
