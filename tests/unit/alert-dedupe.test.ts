import test from "node:test";
import assert from "node:assert/strict";

import { shouldSendAlert } from "../../src/lib/engine/alert-dedupe";

test("shouldSendAlert allows first or expired alerts", () => {
  assert.equal(shouldSendAlert({ lastSentAt: null, cooldownMinutes: 10 }), true);
  assert.equal(
    shouldSendAlert({
      lastSentAt: "2026-05-07T00:00:00.000Z",
      now: new Date("2026-05-07T00:11:00.000Z"),
      cooldownMinutes: 10,
    }),
    true,
  );
});

test("shouldSendAlert suppresses repeated alerts inside cooldown", () => {
  assert.equal(
    shouldSendAlert({
      lastSentAt: "2026-05-07T00:00:00.000Z",
      now: new Date("2026-05-07T00:05:00.000Z"),
      cooldownMinutes: 10,
    }),
    false,
  );
});
