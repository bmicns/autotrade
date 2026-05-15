export interface MarketContext {
  kospi_rate: number;
  kosdaq_rate: number;
  avg_rate: number;
  bonus: number;
  label: string;
}

export interface SurgeStats {
  earlyEntryCount: number;
  reentryCount: number;
  partialExitCount: number;
  pendingCount: number;
  cooldownSkipCount: number;
  lateSkipCount: number;
  newsCooldownSkipCount: number;
  newsRiskSkipCount: number;
}

export interface NewsStats {
  holdingRiskCount: number;
  entryRiskSkipCount: number;
  holdingAlertSentCount?: number;
  holdingAlertSentStockCount?: number;
  holdingAlertNoteWarningCount?: number;
  holdingAlertFailedCount?: number;
}

export interface HoldingNewsAlertLog {
  success: boolean;
  count: number;
  noteWarningCount: number;
  noteWarningNotes: string[];
  noteWarningItems?: Array<{ note: string; recentStocks: string[] }>;
  error?: string;
  run_at: string;
}

export interface DirectOrderNoteStat {
  note: string;
  count: number;
  buyCount: number;
  sellCount: number;
  market: string;
  lastRunAt: string;
  netFlow?: number;
  sellToBuyRatio?: number;
  completionRate?: number;
  residualExposure?: number;
}

export interface DirectOrderLog {
  stock_code: string;
  side: string;
  market: string;
  price: number;
  qty: number;
  currency: string;
  note?: string;
  run_at: string;
}

export interface EngineControlSnapshot {
  surge_news_risk_cooldown_minutes?: number;
  surge_news_positive_bonus?: number;
  surge_news_negative_penalty?: number;
  manual_us_buy_note_templates?: string[];
  manual_us_sell_note_templates?: string[];
}

export interface OverseasHoldingSummary {
  configured: boolean;
  connected: boolean;
  holdings: Array<{
    symbol: string;
    name: string;
    exchangeCode: string;
    quantity: number;
    currentPrice: number;
    currency: string;
    kind: "stock" | "etf";
    pnlRate: number;
  }>;
  summary?: {
    totalUsd: number;
    positionCount: number;
  };
}
