import test from "node:test";
import assert from "node:assert/strict";

import { hasTrustedOrigin, isSafeHttpMethod } from "../../src/lib/request-guard";

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
