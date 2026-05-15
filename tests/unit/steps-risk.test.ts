import test from "node:test";
import assert from "node:assert/strict";

import { clampLossCutThreshold } from "../../src/lib/engine/risk-threshold";

test("clampLossCutThreshold tightens loose stop loss to -3%", () => {
  assert.equal(clampLossCutThreshold(-5), -3);
  assert.equal(clampLossCutThreshold(-3), -3);
});

test("clampLossCutThreshold preserves tighter stop loss than -3%", () => {
  assert.equal(clampLossCutThreshold(-2.8), -2.8);
  assert.equal(clampLossCutThreshold(-1.5), -1.5);
});
