// ─── 엔진 공통 타입 ──────────────────────────────

// ─── 국면별 파라미터 세트 ─────────────────────────
export interface RegimeParams {
  rsiBuy: number;
  rsiSell: number;
  strongScore: number;
  weakScore: number;
}

export interface EngineConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
  token: string;
  stopLoss: number;
  takeProfit: number;
  trailingStop: number;
  maxPerTrade: number;
  maxDailyTrades: number;
  takeProfitRatio: number;   // #1 익절 시 매도 비율 (0~100%)
  dailyLossLimit: number;    // #5 일일 최대 손실 한도 (%)
  maxHoldDays: number;       // 최대 보유 기간 (일)
  dynamicRisk: boolean;      // #2 ATR 동적 손절 사용 여부
  marketCrashThreshold?: number;  // 시장 급락 중단 임계값 (기본 -2.0)
  watchlist?: string[];
  maxPositions?: number;  // 동시 보유 종목 상한 (기본 5)
  rsiBuy?: number;        // RSI 매수 임계값 (기본 30)
  rsiSell?: number;       // RSI 매도 임계값 (기본 70)
  strongScore?: number;   // 강한 신호 점수 기준 (기본 70)
  weakScore?: number;     // 약한 신호 점수 기준 (기본 40)
  trendingParams?: RegimeParams;  // 추세장 파라미터 (없으면 기본값 사용)
  rangingParams?: RegimeParams;   // 횡보장 파라미터
}

export interface InvestorTrend {
  orgn: number;   // 기관 순매수 금액 (억원)
  frgn: number;   // 외국인 순매수 금액 (억원)
  bonus: number;  // 신호 보정 점수
  label: string;  // 설명
}

export interface MarketTrend {
  kospiRate: number;
  kosdaqRate: number;
  bonus: number;
  label: string;
}

export interface OrderResult {
  success: boolean;
  msg: string;
  ordNo?: string;
  raw?: Record<string, unknown>;
}

export interface FilterResult {
  passed: boolean;
  reason: string;
}

export interface OpenOrder {
  odno: string;
  orgn_odno: string;
  ord_gno_brno: string;
  pdno: string;
  rmn_qty: string;
}

export interface EngineAction {
  type: string;
  code: string;
  name?: string;
  detail: string;
}

// KIS 주가 조회 응답 공통 필드 (inquire-price output)
export interface KISPriceOutput {
  stck_prpr?: string;   // 현재가
  hts_kor_isnm?: string; // 종목명
  stck_oprc?: string;   // 시가
  stck_hgpr?: string;   // 고가
  bstp_kor_isnm?: string; // 업종명
  mang_issu_yn?: string; // 관리종목 여부
  mrkt_warn_cls_code?: string; // 시장경고 코드
  lstg_date?: string;   // 상장일
  [key: string]: string | undefined;
}

// KIS 연결 상태 (Health Check 응답 + store 상태)
export interface KISHealthStatus {
  connected: boolean;
  lastChecked: string;      // ISO 8601 (KST)
  latencyMs: number;
  errorCode?: string;       // KIS API error_code (예: "EGW00123")
  errorMessage?: string;    // KIS API error_description
}

// Telegram 알림 컨텍스트 (비밀키 포함 금지)
export interface KISApiErrorContext {
  operation: "token" | "balance" | "order" | "price";
  httpStatus?: number;      // HTTP 응답 코드
  kisCode?: string;         // KIS error_code
  kisMessage?: string;      // KIS error_description (200자 이하로 잘라서 전송)
  timestamp: string;        // ISO 8601
}

export interface StepContext {
  config: EngineConfig;
  applied: import("@/lib/learning").AppliedLearning;
  maxPerTrade: number;
  maxDailyTrades: number;
  maxPositions: number;
  maxPerSector: number;  // 섹터당 최대 보유 종목 수 (0이면 비활성)
  takeProfitRatio: number;
  dailyLossLimit: number;
  strongScore: number;    // 강한 신호 점수 기준
  weakScore: number;      // 약한 신호 점수 기준
  rsiBuy: number;         // RSI 매수 임계값
  rsiSell: number;        // RSI 매도 임계값
  strategyAllocations: import("@/lib/engine/strategies").StrategyAllocations;
  customWeights: { trending: Record<string, number>; ranging: Record<string, number> } | undefined;
}
