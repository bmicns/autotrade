import test from "node:test";
import assert from "node:assert/strict";

import { buildKisConfigState } from "../../src/lib/kis/config-state";

test("buildKisConfigState exposes active source and presence flags", () => {
  const state = buildKisConfigState({
    active: {
      source: "db",
      config: { appKey: "k", appSecret: "s", accountNo: "1234567801" },
    },
    envConfig: { appKey: "env", appSecret: "envs", accountNo: "8765432101" },
    dbConfig: { appKey: "k", appSecret: "s", accountNo: "1234567801" },
  });

  assert.equal(state.source, "db");
  assert.equal(state.appKey, "k");
  assert.equal(state.hasEnvConfig, true);
  assert.equal(state.hasDbConfig, true);
});
