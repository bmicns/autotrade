// ─── 엔진 공통 타입 ──────────────────────────────

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
  watchlist?: string[];
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
