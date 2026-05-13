import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKisProductCodeConfigKey,
  buildProfileEnvVar,
  DEFAULT_KIS_PROFILE_ID,
  normalizeKisProfileId,
  resolveKisProfileForAssetClass,
} from "../../src/lib/kis/profile";

test("normalizeKisProfileId falls back to default and sanitizes custom ids", () => {
  assert.equal(normalizeKisProfileId(undefined), DEFAULT_KIS_PROFILE_ID);
  assert.equal(normalizeKisProfileId(" US Live "), "us_live");
});

test("buildKisProductCodeConfigKey keeps legacy default key and scopes custom profiles", () => {
  assert.equal(buildKisProductCodeConfigKey("default"), "kis_account_product_code");
  assert.equal(buildKisProductCodeConfigKey("us"), "kis_account_product_code:us");
});

test("resolveKisProfileForAssetClass maps KR and US assets to dedicated profiles", () => {
  assert.equal(resolveKisProfileForAssetClass("kr_stock"), "kr");
  assert.equal(resolveKisProfileForAssetClass("kr_etf"), "kr");
  assert.equal(resolveKisProfileForAssetClass("us_stock"), "us");
  assert.equal(resolveKisProfileForAssetClass("us_etf"), "us");
});

test("getEnvKisConfig reads profile-specific env vars when profile is not default", () => {
  assert.equal(buildProfileEnvVar("KIS_APP_KEY", "us"), "KIS_APP_KEY_US");
  assert.equal(buildProfileEnvVar("KIS_ACCOUNT_NO", "default"), "KIS_ACCOUNT_NO");
});
