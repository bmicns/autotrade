/**
 * 볼린저 밴드 (Bollinger Bands)
 * - 가격이 하단밴드 이하 → 과매도 → 매수
 * - 가격이 상단밴드 이상 → 과매수 → 매도
 */

function sma(data, period) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function stdDev(data, period) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
    result.push(Math.sqrt(variance));
  }
  return result;
}

export function calcBollinger(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return null;

  const middle = sma(closes, period);
  const sd = stdDev(closes, period);

  return {
    upper: middle.map((m, i) => m + multiplier * sd[i]),
    middle,
    lower: middle.map((m, i) => m - multiplier * sd[i]),
    bandwidth: middle.map((m, i) => ((multiplier * sd[i] * 2) / m) * 100),
  };
}

export function analyzeBollinger(closes) {
  const bb = calcBollinger(closes);
  if (!bb) return { signal: "neutral", strength: 0, data: null, reason: "데이터 부족" };

  const lastIdx = bb.middle.length - 1;
  const price = closes[closes.length - 1];
  const upper = bb.upper[lastIdx];
  const lower = bb.lower[lastIdx];
  const middle = bb.middle[lastIdx];
  const bandwidth = bb.bandwidth[lastIdx];

  const pctB = (price - lower) / (upper - lower);

  if (pctB <= 0) {
    return { signal: "buy", strength: 2, data: { pctB, bandwidth }, reason: `볼린저 하단 이탈 (%B=${pctB.toFixed(2)})` };
  }
  if (pctB < 0.2) {
    return { signal: "buy", strength: 1, data: { pctB, bandwidth }, reason: `볼린저 하단 근접 (%B=${pctB.toFixed(2)})` };
  }
  if (pctB >= 1) {
    return { signal: "sell", strength: 2, data: { pctB, bandwidth }, reason: `볼린저 상단 이탈 (%B=${pctB.toFixed(2)})` };
  }
  if (pctB > 0.8) {
    return { signal: "sell", strength: 1, data: { pctB, bandwidth }, reason: `볼린저 상단 근접 (%B=${pctB.toFixed(2)})` };
  }

  return { signal: "neutral", strength: 0, data: { pctB, bandwidth }, reason: `볼린저 중립 (%B=${pctB.toFixed(2)})` };
}
