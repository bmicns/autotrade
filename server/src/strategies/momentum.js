/**
 * momentum.js
 * 모멘텀 연속 전략
 * - 전일 상승 흐름이 지속될 종목을 찾아 매수
 * - 5개 조건 스코어링 방식
 */

/**
 * 모멘텀 연속 분석
 * @param {Array} candles - 일봉 데이터 [{date, open, high, low, close, volume}, ...]
 * @param {number} currentPrice - 현재가 (장중)
 * @returns {{ signal, strength, score, reason, details }}
 */
export function analyzeMomentum(candles, currentPrice) {
  if (!candles || candles.length < 6) {
    return {
      signal: "neutral",
      strength: 0,
      score: 0,
      reason: "데이터 부족 (최소 6일 필요)",
      details: {},
    };
  }

  const yesterday = candles[candles.length - 1];
  const dayBefore = candles[candles.length - 2];
  const threeDaysAgo = candles[candles.length - 3];
  const details = {};
  let score = 0;

  // 조건 1: 전일 양봉 (종가 > 시가)
  const bullishCandle = yesterday.close > yesterday.open;
  details.bullishCandle = bullishCandle;
  if (bullishCandle) score++;

  // 조건 2: 전일 종가 > 전전일 종가 (상승 추세)
  const uptrend = yesterday.close > dayBefore.close;
  details.uptrend = uptrend;
  if (uptrend) score++;

  // 조건 3: 전일 거래량 > 5일 평균의 1.2배
  const recentVolumes = candles.slice(-6, -1).map((c) => c.volume);
  const avgVolume5 = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const volumeIncrease = yesterday.volume > avgVolume5 * 1.2;
  const volumeRatio = avgVolume5 > 0 ? (yesterday.volume / avgVolume5).toFixed(2) : 0;
  details.volumeIncrease = volumeIncrease;
  details.volumeRatio = Number(volumeRatio);
  if (volumeIncrease) score++;

  // 조건 4: 3일 연속 종가 상승
  const threeDayUp =
    yesterday.close > dayBefore.close && dayBefore.close > threeDaysAgo.close;
  details.threeDayUp = threeDayUp;
  if (threeDayUp) score++;

  // 조건 5: 현재가가 전일 종가 대비 -1% ~ +3% (진입 가능 범위)
  const priceGap = (currentPrice - yesterday.close) / yesterday.close;
  const entryWindow = priceGap >= -0.01 && priceGap <= 0.03;
  details.entryWindow = entryWindow;
  details.priceGap = (priceGap * 100).toFixed(2) + "%";
  if (entryWindow) score++;

  // 판정
  let signal = "neutral";
  let strength = 0;
  let reason = "";

  if (score >= 4) {
    signal = "buy";
    strength = 2;
    reason = `강한 모멘텀 (${score}/5) — 전일 양봉, 상승추세 지속`;
  } else if (score === 3) {
    signal = "buy";
    strength = 1;
    reason = `보통 모멘텀 (${score}/5) — 일부 조건 충족`;
  } else {
    reason = `모멘텀 부족 (${score}/5)`;
  }

  return { signal, strength, score, reason, details };
}
