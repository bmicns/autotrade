/**
 * 거래량 분석 전략
 * - 거래량 급증 + 가격 상승 → 매수
 * - 거래량 급증 + 가격 하락 → 매도
 * - 20일 평균 거래량 대비 비율로 판단
 */

export function analyzeVolume(candles) {
  if (candles.length < 21) return { signal: "neutral", strength: 0, data: null, reason: "데이터 부족" };

  const recent = candles.slice(-21);
  const avgVolume = recent.slice(0, 20).reduce((s, c) => s + c.volume, 0) / 20;
  const todayVolume = recent[20].volume;
  const todayClose = recent[20].close;
  const prevClose = recent[19].close;
  const volumeRatio = todayVolume / avgVolume;
  const priceChange = (todayClose - prevClose) / prevClose;

  const data = {
    todayVolume,
    avgVolume: Math.round(avgVolume),
    volumeRatio: volumeRatio.toFixed(2),
    priceChange: (priceChange * 100).toFixed(2) + "%",
  };

  // 거래량 2배 이상 급증
  if (volumeRatio >= 2) {
    if (priceChange > 0.02) {
      return { signal: "buy", strength: 2, data, reason: `거래량 ${volumeRatio.toFixed(1)}배 급증 + 상승` };
    }
    if (priceChange < -0.02) {
      return { signal: "sell", strength: 2, data, reason: `거래량 ${volumeRatio.toFixed(1)}배 급증 + 하락` };
    }
  }

  // 거래량 1.5배 증가
  if (volumeRatio >= 1.5) {
    if (priceChange > 0.01) {
      return { signal: "buy", strength: 1, data, reason: `거래량 ${volumeRatio.toFixed(1)}배 증가 + 소폭 상승` };
    }
    if (priceChange < -0.01) {
      return { signal: "sell", strength: 1, data, reason: `거래량 ${volumeRatio.toFixed(1)}배 증가 + 소폭 하락` };
    }
  }

  return { signal: "neutral", strength: 0, data, reason: `거래량 ${volumeRatio.toFixed(1)}배 — 특이사항 없음` };
}
