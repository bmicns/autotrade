import test from "node:test";
import assert from "node:assert/strict";

import { buildKisConfigUpsertPayload } from "../../src/lib/kis/config-payload";

test("buildKisConfigUpsertPayload preserves existing token fields when omitted", () => {
  const payload = buildKisConfigUpsertPayload(
    "default",
    {
      app_key: "db-key",
      app_secret: "db-secret",
      account_no: "1234567801",
      token: "existing-token",
      token_expiry: "2026-05-04T09:00:00.000Z",
    },
    {
      appKey: "env-key",
      appSecret: "env-secret",
      accountNo: "8765432101",
    },
    "2026-05-04T00:00:00.000Z",
  );

  assert.equal(payload.app_key, "env-key");
  assert.equal(payload.app_secret, "env-secret");
  assert.equal(payload.account_no, "8765432101");
  assert.equal(payload.token, "existing-token");
  assert.equal(payload.token_expiry, "2026-05-04T09:00:00.000Z");
});

test("buildKisConfigUpsertPayload overwrites token fields when explicitly provided", () => {
  const payload = buildKisConfigUpsertPayload(
    "default",
    {
      app_key: "db-key",
      app_secret: "db-secret",
      account_no: "1234567801",
      token: "existing-token",
      token_expiry: "2026-05-04T09:00:00.000Z",
    },
    {
      token: "new-token",
      tokenExpiry: "2026-05-04T10:00:00.000Z",
    },
    "2026-05-04T00:00:00.000Z",
  );

  assert.equal(payload.token, "new-token");
  assert.equal(payload.token_expiry, "2026-05-04T10:00:00.000Z");
  assert.equal(payload.app_key, "db-key");
  assert.equal(payload.account_no, "1234567801");
});

test("buildKisConfigUpsertPayload clears token fields when explicitly null", () => {
  const payload = buildKisConfigUpsertPayload(
    "default",
    {
      app_key: "db-key",
      app_secret: "db-secret",
      account_no: "1234567801",
      token: "existing-token",
      token_expiry: "2026-05-04T09:00:00.000Z",
    },
    {
      appKey: "paper-key",
      accountNo: "8765432101",
      token: null,
      tokenExpiry: null,
    },
    "2026-05-04T00:00:00.000Z",
  );

  assert.equal(payload.app_key, "paper-key");
  assert.equal(payload.account_no, "8765432101");
  assert.equal(payload.token, null);
  assert.equal(payload.token_expiry, null);
});
