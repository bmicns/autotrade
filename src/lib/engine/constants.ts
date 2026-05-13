// ─── 엔진 공통 상수 ──────────────────────────────────
// 장 마감 후 일일 리포트 발송 기준 시각 (HHMM, KST)
export const END_OF_DAY_TIME = 1500;

// 승인 신호 매수 비율 (maxPerTrade 대비)
export const APPROVED_BUY_RATIO = 0.5;

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
export const KIS_RATE_LIMIT_DELAY_MS = 350;

// 종목별 일일 최대 진입 횟수 (첫 진입 포함)
export const MAX_DAILY_ENTRIES_PER_STOCK = 2;
export const SURGE_MAX_DAILY_ENTRIES_PER_STOCK = 4;
export const SURGE_REENTRY_BUY_RATIO = 0.7;
export const SURGE_TRAILING_PARTIAL_EXIT_RATIO = 35;
export const SURGE_TIGHT_STOP_LOSS = -2.8;
export const SURGE_TIGHT_TRAILING_STOP = -1.4;

// 최근 실패 누적 기반 자동 정지 기준
export const ENGINE_CONSECUTIVE_ERROR_HALT_COUNT = 3;
export const ENGINE_CONSECUTIVE_TOKEN_ERROR_HALT_COUNT = 2;
export const ENGINE_CONSECUTIVE_ORDER_FAILURE_HALT_COUNT = 3;
