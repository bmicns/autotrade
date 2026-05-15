const MAX_NON_TRAILING_LOSS_PCT = -3;

export function clampLossCutThreshold(stopLoss: number, floorPct = MAX_NON_TRAILING_LOSS_PCT) {
  return Math.max(stopLoss, floorPct);
}
