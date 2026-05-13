import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRehearsalEvidence,
  applyRehearsalUpdates,
  normalizeRehearsalChecklist,
  summarizeRehearsalChecklist,
} from "../../src/lib/operations/rehearsal-checklist";

test("applyRehearsalEvidence marks incomplete items from event history only", () => {
  const base = normalizeRehearsalChecklist([
    { key: "manual_buy", checked: true, checkedAt: "2026-05-01T00:00:00.000Z" },
    { key: "manual_sell", checked: false, checkedAt: null },
  ]);

  const merged = applyRehearsalEvidence(base, {
    manual_buy: "2026-05-04T00:00:00.000Z",
    manual_sell: "2026-05-04T01:00:00.000Z",
    reconcile: "2026-05-04T02:00:00.000Z",
  });

  assert.equal(merged.find((item) => item.key === "manual_buy")?.checkedAt, "2026-05-01T00:00:00.000Z");
  assert.equal(merged.find((item) => item.key === "manual_sell")?.checkedAt, "2026-05-04T01:00:00.000Z");
  assert.equal(merged.find((item) => item.key === "reconcile")?.checked, true);
});

test("rehearsal summary reflects manual updates and inferred evidence together", () => {
  const updated = applyRehearsalUpdates(normalizeRehearsalChecklist([]), [
    { key: "telegram", checked: true },
  ], "2026-05-05T00:00:00.000Z");

  const merged = applyRehearsalEvidence(updated, {
    manual_buy: "2026-05-04T00:00:00.000Z",
    manual_sell: "2026-05-04T01:00:00.000Z",
    auto_exit: "2026-05-04T02:00:00.000Z",
    reconcile: "2026-05-04T03:00:00.000Z",
  });

  const summary = summarizeRehearsalChecklist(merged);
  assert.deepEqual(summary, {
    totalCount: 5,
    completedCount: 5,
    remainingCount: 0,
    completed: true,
  });
});
