import test from "node:test";
import assert from "node:assert/strict";

import { buildKisConfigState } from "../../src/lib/kis/config-state";

test("buildKisConfigState exposes active source and presence flags", () => {
  const state = buildKisConfigState({
    active: {
      source: "db",
      profileId: "kr",
      config: { appKey: "k", appSecret: "s", accountNo: "12345678", accountProductCode: "03" },
    },
    envConfig: { appKey: "env", appSecret: "envs", accountNo: "87654321", accountProductCode: "01" },
    dbConfig: { appKey: "k", appSecret: "s", accountNo: "12345678", accountProductCode: "03" },
  });

  assert.equal(state.profileId, "kr");
  assert.equal(state.profileLabel, "국내");
  assert.equal(state.source, "db");
  assert.equal(state.appKey, "k");
  assert.equal(state.maskedAccountNo, "12****78");
  assert.equal(state.accountProductCode, "03");
  assert.equal(state.environment, "dev");
  assert.equal(state.hasEnvConfig, true);
  assert.equal(state.hasDbConfig, true);
});
