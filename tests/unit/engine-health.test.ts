import test from "node:test";
import assert from "node:assert/strict";

import { resolveEngineHealth } from "../../src/lib/engine/control";

test("resolveEngineHealth returns stale during market hours when last run is too old", () => {
  const now = new Date("2026-05-04T03:30:00.000Z");
  const lastRunAt = new Date("2026-05-04T00:50:00.000Z").toISOString();
  const health = resolveEngineHealth({ now, lastRunAt, hasError: false });

  assert.equal(health.status, "stale");
  assert.equal(health.minutesSinceLastRun, 160);
});

test("resolveEngineHealth returns healthy outside market hours despite old run", () => {
  const now = new Date("2026-05-04T10:30:00.000Z");
  const lastRunAt = new Date("2026-05-04T03:00:00.000Z").toISOString();
  const health = resolveEngineHealth({ now, lastRunAt, hasError: false });

  assert.equal(health.status, "healthy");
});
