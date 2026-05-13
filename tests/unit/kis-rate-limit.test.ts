import test from "node:test";
import assert from "node:assert/strict";

import { shouldRetryKisRequest, shouldRetryRateLimit } from "../../src/lib/engine/kis-rate-limit";

test("shouldRetryRateLimit detects KIS rate limit code", () => {
  assert.equal(shouldRetryRateLimit("HTTP 500: {\"msg_cd\":\"EGW00201\"}"), true);
});

test("shouldRetryRateLimit detects KIS rate limit message", () => {
  assert.equal(shouldRetryRateLimit("초당 거래건수를 초과하였습니다."), true);
});

test("shouldRetryRateLimit ignores unrelated errors", () => {
  assert.equal(shouldRetryRateLimit("HTTP 500: {\"msg_cd\":\"IGW00002\"}"), false);
});

test("shouldRetryKisRequest retries transient HTTP failures", () => {
  assert.equal(shouldRetryKisRequest("HTTP 500: internal error", 500), true);
  assert.equal(shouldRetryKisRequest("HTTP 429: too many requests", 429), true);
});

test("shouldRetryKisRequest ignores non-transient non-rate-limit failures", () => {
  assert.equal(shouldRetryKisRequest("HTTP 400: bad request", 400), false);
});
