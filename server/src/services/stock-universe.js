/**
 * stock-universe.js
 * 전체 국내주식 2단계 스캔 시스템
 * 1단계: KOSPI/KOSDAQ 거래량 상위 종목 프리필터
 * 2단계: 필터링된 종목만 정밀 분석
 */
import { getTopVolumeStocks } from "./kis-api.js";
import { getUniverse, saveUniverse } from "../db/store.js";
import { log } from "../utils/logger.js";

/**
 * 프리필터: KOSPI + KOSDAQ 거래량 상위 종목 수집
 * 매일 장 시작 전 1회 실행
 */
export async function refreshUniverse(topN = 50) {
  log("info", "🔍 전체 종목 프리필터 시작...");

  const [kospi, kosdaq] = await Promise.all([
    getTopVolumeStocks("J", topN),
    getTopVolumeStocks("Q", topN),
  ]);

  // 중복 제거 (코드 기준)
  const seen = new Set();
  const combined = [];
  for (const stock of [...kospi, ...kosdaq]) {
    if (!seen.has(stock.code)) {
      seen.add(stock.code);
      combined.push(stock);
    }
  }

  // 거래대금 기준 정렬
  combined.sort((a, b) => b.tradeAmount - a.tradeAmount);

  saveUniverse(combined);
  log("info", `✅ 프리필터 완료: ${combined.length}개 종목 (KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length})`);
  return combined;
}

/**
 * 현재 스캔 대상 종목 반환
 * 캐시가 없거나 오래되면 자동 갱신
 */
export function getScanTargets(limit = 50) {
  const universe = getUniverse();
  if (!universe.stocks || universe.stocks.length === 0) {
    return [];
  }
  return universe.stocks.slice(0, limit);
}

/**
 * 모멘텀 후보 필터: 전일 상승 + 거래량 증가 종목만 추출
 */
export function getMomentumCandidates() {
  const universe = getUniverse();
  if (!universe.stocks) return [];

  return universe.stocks.filter(
    (s) => s.changeRate > 0 && s.volume > 0
  );
}
