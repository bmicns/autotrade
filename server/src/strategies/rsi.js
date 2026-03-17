/**
 * RSI (Relative Strength Index) 전략
 * - RSI < 30 → 과매도 → 매수 시그널
 * - RSI > 70 → 과매수 → 매도 시그널
 */

export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function analyzeRSI(closes) {
  const rsi = calcRSI(closes);
  if (rsi === null) return { signal: "neutral", strength: 0, rsi: null, reason: "데이터 부족" };

  if (rsi < 25) return { signal: "buy", strength: 2, rsi, reason: `RSI ${rsi.toFixed(1)} — 강한 과매도` };
  if (rsi < 30) return { signal: "buy", strength: 1, rsi, reason: `RSI ${rsi.toFixed(1)} — 과매도` };
  if (rsi > 75) return { signal: "sell", strength: 2, rsi, reason: `RSI ${rsi.toFixed(1)} — 강한 과매수` };
  if (rsi > 70) return { signal: "sell", strength: 1, rsi, reason: `RSI ${rsi.toFixed(1)} — 과매수` };

  return { signal: "neutral", strength: 0, rsi, reason: `RSI ${rsi.toFixed(1)} — 중립` };
}
