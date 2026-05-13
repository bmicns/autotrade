import test from "node:test";
import assert from "node:assert/strict";

import { resolveAlertPriority, summarizeOperationalAlerts } from "../../src/lib/engine/alert-priority";

test("resolveAlertPriority ranks critical operational alerts first", () => {
  assert.equal(resolveAlertPriority("브로커-DB 정합성 불일치 2건"), "P1");
  assert.equal(resolveAlertPriority("최근 주문 lifecycle 경고 2건"), "P2");
  assert.equal(resolveAlertPriority("수동 intent 진행 중 1건"), "P3");
});

test("summarizeOperationalAlerts returns highest-priority headline", () => {
  assert.deepEqual(
    summarizeOperationalAlerts([
      "수동 intent 진행 중 1건",
      "최근 주문 lifecycle 경고 2건",
      "브로커-DB 정합성 불일치 2건",
    ]),
    {
      priority: "P1",
      headline: "브로커-DB 정합성 불일치 2건",
    },
  );
});
