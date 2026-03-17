/**
 * 이동평균선 (Moving Average) 전략
 * - 단기(5) > 중기(20) > 장기(60) → 정배열 → 매수
 * - 단기(5) < 중기(20) < 장기(60) → 역배열 → 매도
 * - 골든/데드크로스 감지
 */

function sma(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calcMovingAverages(closes) {
  return {
    ma5: sma(closes, 5),
    ma10: sma(closes, 10),
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
  };
}

export function analyzeMA(closes) {
  if (closes.length < 60) return { signal: "neutral", strength: 0, data: null, reason: "데이터 부족 (60일 미만)" };

  const ma = calcMovingAverages(closes);
  const price = closes[closes.length - 1];

  // 이전일 이평선 (크로스 감지용)
  const prevCloses = closes.slice(0, -1);
  const prevMa = calcMovingAverages(prevCloses);

  // 골든크로스: 5일선이 20일선 상향돌파
  if (prevMa.ma5 < prevMa.ma20 && ma.ma5 > ma.ma20) {
    return { signal: "buy", strength: 2, data: ma, reason: "이평선 골든크로스 (5일↑ 20일)" };
  }

  // 데드크로스: 5일선이 20일선 하향돌파
  if (prevMa.ma5 > prevMa.ma20 && ma.ma5 < ma.ma20) {
    return { signal: "sell", strength: 2, data: ma, reason: "이평선 데드크로스 (5일↓ 20일)" };
  }

  // 정배열: 5 > 20 > 60
  if (ma.ma5 > ma.ma20 && ma.ma20 > ma.ma60 && price > ma.ma5) {
    return { signal: "buy", strength: 1, data: ma, reason: "이평선 정배열" };
  }

  // 역배열: 5 < 20 < 60
  if (ma.ma5 < ma.ma20 && ma.ma20 < ma.ma60 && price < ma.ma5) {
    return { signal: "sell", strength: 1, data: ma, reason: "이평선 역배열" };
  }

  return { signal: "neutral", strength: 0, data: ma, reason: "이평선 혼조" };
}
