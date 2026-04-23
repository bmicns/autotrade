// VWAP + Volume Profile (POC) 계산
// 분봉 데이터 기반 당일 장중 지표 — adjustedScore 보너스로 사용

export interface MinuteCandle {
  time: string;   // HHMMSS
  close: number;
  high: number;
  low: number;
  volume: number; // 분당 거래량 (cntg_vol)
}

// ─── VWAP ────────────────────────────────────────
// 당일 시가~현재까지 (가격×거래량) 누적합 / 거래량 누적합
export function calcVWAP(candles: MinuteCandle[]): number {
  if (candles.length === 0) return 0;
  let sumPV = 0, sumV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    sumPV += typical * c.volume;
    sumV  += c.volume;
  }
  return sumV > 0 ? sumPV / sumV : 0;
}

// ─── Volume Profile POC ──────────────────────────
// 가장 많이 거래된 가격대 (Point of Control)
export function calcPOC(candles: MinuteCandle[]): number {
  if (candles.length < 5) return 0;
  const prices = candles.map((c) => c.close);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP;
  if (range === 0) return prices[0];

  // 가격 범위를 ~20개 버킷으로 나눔
  const raw = range / 20;
  const bucketSize = raw < 50 ? 10 : raw < 200 ? 50 : raw < 1000 ? 100 : raw < 5000 ? 500 : 1000;

  const buckets = new Map<number, number>();
  for (const c of candles) {
    const b = Math.round(c.close / bucketSize) * bucketSize;
    buckets.set(b, (buckets.get(b) ?? 0) + c.volume);
  }
  let maxVol = 0, poc = 0;
  for (const [p, v] of buckets) {
    if (v > maxVol) { maxVol = v; poc = p; }
  }
  return poc;
}

// ─── 장중 보너스 점수 계산 ────────────────────────
// VWAP 하방 = 저평가 → 매수 보너스
// POC 근처 = 강한 지지선 → 추가 보너스
export function calcIntradayBonus(
  price: number,
  vwap: number,
  poc: number,
): { bonus: number; label: string } {
  let bonus = 0;
  const labels: string[] = [];

  if (vwap > 0) {
    const r = (price - vwap) / vwap;
    if      (r < -0.02)  { bonus += 15; labels.push("VWAP↓↓"); }
    else if (r < -0.005) { bonus += 10; labels.push("VWAP↓");  }
    else if (r >  0.02)  { bonus -= 15; labels.push("VWAP↑↑"); }
    else if (r >  0.005) { bonus -= 10; labels.push("VWAP↑");  }
  }

  if (poc > 0) {
    const r = Math.abs(price - poc) / poc;
    if (r < 0.005)                       { bonus += 8; labels.push("POC근처"); }
    else if (price > poc && r < 0.01)    { bonus += 5; labels.push("POC돌파"); }
  }

  return { bonus, label: labels.join(" ") };
}
