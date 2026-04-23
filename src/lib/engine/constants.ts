// ─── 엔진 공통 상수 ──────────────────────────────────
// 장 마감 후 일일 리포트 발송 기준 시각 (HHMM, KST)
export const END_OF_DAY_TIME = 1500;

// 승인 신호 매수 비율 (maxPerTrade 대비)
export const APPROVED_BUY_RATIO = 0.5;

// 2차 익절 비율 (%)
export const SECOND_TP_RATIO = 30;

// 투자자 트렌드 보너스 점수
export const INVESTOR_BONUS_BOTH     =  25;  // 기관+외국인 동반매수
export const INVESTOR_BONUS_ORGN     =  15;  // 기관 순매수
export const INVESTOR_BONUS_FRGN     =  10;  // 외국인 순매수
export const INVESTOR_PENALTY_BOTH   = -25;  // 기관+외국인 동반매도
export const INVESTOR_PENALTY_ORGN   = -15;  // 기관 순매도
export const INVESTOR_PENALTY_FRGN   = -10;  // 외국인 순매도

// 장초반 스냅샷 gap 임계값
export const OPENING_GAP_STRONG =  0.01;   // > 1% + 거래량 → 강한 매수 보너스
export const OPENING_GAP_MILD   =  0.005;  // > 0.5% → 약한 매수 보너스
export const OPENING_GAP_DROP_STRONG = -0.02;  // < -2% → 강한 매도 패널티
export const OPENING_GAP_DROP_MILD   = -0.01;  // < -1% → 약한 매도 패널티

// marketCrashThreshold fallback
export const DEFAULT_MARKET_CRASH_THRESHOLD = -2.0;


// 장초반 스냅샷 보너스 점수
export const OPENING_BONUS_STRONG   =  15;  // gap > 1% + 거래량 충분
export const OPENING_BONUS_MILD     =   8;  // gap > 0.5%
export const OPENING_PENALTY_MILD   = -10;  // gap < -1%
export const OPENING_PENALTY_STRONG = -20;  // gap < -2%

// 시장 지수(KOSPI/KOSDAQ 평균) 보너스 점수
export const MARKET_BONUS_STRONG   =  15;  // avgRate >= 1.0%
export const MARKET_BONUS_MILD     =   8;  // avgRate >= 0.3%
export const MARKET_PENALTY_MILD   = -10;  // avgRate <= -0.3%
export const MARKET_PENALTY_STRONG = -20;  // avgRate <= -1.0%

// 시장 지수 임계값 (%)
export const KOSPI_TRENDING_THRESHOLD = 0.5;

// KIS API 호출 간격 (서버리스 Rate Limit 준수)
export const KIS_RATE_LIMIT_DELAY_MS = 200;

// 지정가 매수 할인율 (현재가 대비)
export const LIMIT_BUY_DISCOUNT = 0.995;

// 2차 익절 실행 비율 (phase=partial_tp → final_tp 전환 시 매도 비율)
export const SECOND_TP_SELL_RATIO = 30; // %
