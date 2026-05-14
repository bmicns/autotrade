import test from "node:test";
import assert from "node:assert/strict";

import {
  hasTrustedOrigin,
  isSafeHttpMethod,
  requireCronBearerAuth,
  requireSessionRequest,
  requireSessionWriteRequest,
} from "../../src/lib/request-guard";
import { generateSessionToken } from "../../src/lib/session";

test("isSafeHttpMethod recognizes read-only methods", () => {
  assert.equal(isSafeHttpMethod("GET"), true);
  assert.equal(isSafeHttpMethod("head"), true);
  assert.equal(isSafeHttpMethod("POST"), false);
  assert.equal(isSafeHttpMethod("DELETE"), false);
});

test("hasTrustedOrigin accepts same-origin origin header", () => {
  const headers = new Headers({ origin: "https://nexio.example.com" });
  assert.equal(hasTrustedOrigin(headers, "https://nexio.example.com/api/engine-control"), true);
});

test("hasTrustedOrigin falls back to same-origin referer", () => {
  const headers = new Headers({ referer: "https://nexio.example.com/settings" });
  assert.equal(hasTrustedOrigin(headers, "https://nexio.example.com/api/manual-buy"), true);
});

test("hasTrustedOrigin rejects cross-origin or missing origin metadata", () => {
  const foreign = new Headers({ origin: "https://evil.example.com" });
  const missing = new Headers();

  assert.equal(hasTrustedOrigin(foreign, "https://nexio.example.com/api/manual-buy"), false);
  assert.equal(hasTrustedOrigin(missing, "https://nexio.example.com/api/manual-buy"), false);
});

test("requireSessionRequest accepts valid signed session cookie", () => {
  process.env.SESSION_SECRET = "test-session-secret";
  const token = generateSessionToken(process.env.SESSION_SECRET);
  const req = new Request("https://nexio.example.com/api/engine-control", {
    headers: { cookie: `nexio_session=${token}` },
  });

  assert.equal(requireSessionRequest(req), null);
});

test("requireSessionWriteRequest rejects invalid origin before state changes", () => {
  process.env.SESSION_SECRET = "test-session-secret";
  const token = generateSessionToken(process.env.SESSION_SECRET);
  const req = new Request("https://nexio.example.com/api/manual-buy", {
    method: "POST",
    headers: {
      cookie: `nexio_session=${token}`,
      origin: "https://evil.example.com",
    },
  });

  const response = requireSessionWriteRequest(req);
  assert.equal(response?.status, 403);
});

test("requireCronBearerAuth accepts matching CRON_SECRET bearer token", () => {
  process.env.CRON_SECRET = "cron-secret";
  const req = new Request("https://nexio.example.com/api/engine", {
    headers: { authorization: "Bearer cron-secret" },
  });

  assert.equal(requireCronBearerAuth(req), null);
});
