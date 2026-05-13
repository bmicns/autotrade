import test from "node:test";
import assert from "node:assert/strict";

import { validateAdminAuthEnv, validateRequiredEnv } from "../../src/lib/config-validator";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(() => {
  restoreEnv();
});

test("validateRequiredEnv checks engine runtime requirements and warns on missing KIS env", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.CRON_SECRET = "cron";
  process.env.TELEGRAM_BOT_TOKEN = "bot";
  process.env.TELEGRAM_CHAT_ID = "chat";

  delete process.env.KIS_APP_KEY;
  delete process.env.KIS_APP_SECRET;
  delete process.env.KIS_ACCOUNT_NO;

  const result = validateRequiredEnv();

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.warnings.sort(), ["KIS_ACCOUNT_NO", "KIS_APP_KEY", "KIS_APP_SECRET"]);
});

test("validateAdminAuthEnv requires every admin login and session secret", () => {
  process.env.ADMIN_ID = "admin";
  process.env.ADMIN_PASSWORD = "pw";
  delete process.env.ADMIN_SECRET;
  delete process.env.SESSION_SECRET;

  const result = validateAdminAuthEnv();

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing.sort(), ["ADMIN_SECRET", "SESSION_SECRET"]);
  assert.deepEqual(result.warnings, []);
});
