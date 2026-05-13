import test from "node:test";
import assert from "node:assert/strict";

import { normalizeKisAccountInput, resolveKisAccountParts } from "../../src/lib/kis/account";

test("normalizeKisAccountInput splits 10-digit account into account and product code", () => {
  const normalized = normalizeKisAccountInput("5017974508", "01");
  assert.deepEqual(normalized, { accountNo: "50179745", accountProductCode: "08" });
});

test("normalizeKisAccountInput strips non-digits and preserves explicit product code for 8-digit account", () => {
  const normalized = normalizeKisAccountInput("5017-9745", "03");
  assert.deepEqual(normalized, { accountNo: "50179745", accountProductCode: "03" });
});

test("resolveKisAccountParts uses explicit product code when account number is 8 digits", () => {
  const parts = resolveKisAccountParts("50179745", "03");
  assert.deepEqual(parts, { cano: "50179745", productCode: "03" });
});

test("resolveKisAccountParts falls back to account suffix when account number is 10 digits", () => {
  const parts = resolveKisAccountParts("5017974508", "01");
  assert.deepEqual(parts, { cano: "50179745", productCode: "08" });
});
