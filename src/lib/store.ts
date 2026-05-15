import { create } from "zustand";
import { fetchBrokerBalance, fetchBrokerPrices } from "@/lib/broker/client";
import { loadFromStorage, removeFromStorage, saveToStorage } from "@/lib/browser-storage";
import { startKisHealthPolling, stopKisHealthPolling } from "@/lib/kis/health-poller";
import type { EngineControlSnapshot } from "@/lib/engine/control";
import type { BrokerId } from "@/lib/broker/types";
import { DEFAULT_BROKER_ID } from "@/lib/broker/registry";

type Tab = "home" | "signal" | "portfolio" | "stats" | "strategy" | "settings";
type MarketScope = "kr" | "us";

export interface Holding {
  code: string;
  name: string;
  market: string;
  quantity: number;
  avgPrice: number;
  currentPrice?: number;
  pnlRate?: number;
}

export interface StockPrice {
  code: string;
  name: string;
  market: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

export interface Trade {
  id: string;
  code: string;
  name: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  signalStrength: "strong" | "weak" | "manual";
  status: "pending" | "executed" | "rejected";
  executedAt: string;
}

export interface KISConfig {
  brokerId?: BrokerId;
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountProductCode?: string;
  token?: string;
  tokenExpiry?: string;
  source?: "env" | "db" | null;
  runtimeMode?: string;
  apiBaseUrl?: string;
  hasEnvConfig?: boolean;
  hasDbConfig?: boolean;
}

export interface TradeSettings {
  maxTradesPerDay: number;      // 1일 최대 횟수
  stopLoss: number;             // 손절 라인 (%)
  trailingStop: number;         // 트레일링 스탑 (%)
  morningStart: string;         // 오전 세션 시작
  morningEnd: string;           // 오전 세션 종료
  afternoonStart: string;       // 오후 세션 시작
  afternoonEnd: string;         // 오후 세션 종료
  dailyLossLimit: number;       // 일일 손실 한도 (%)
  maxHoldDays: number;          // 최대 보유 기간 (일)
}

interface AccountSummary {
  totalEval: number;
  totalPnl: number;
  totalPnlRate: number;
  cashBalance: number;
}

interface AppState {
  tab: Tab;
  setTab: (tab: Tab) => void;
  marketScope: MarketScope;
  setMarketScope: (scope: MarketScope) => void;

  autoTrade: boolean;
  toggleAutoTrade: () => void;

  // 보유 종목 (KIS 잔고 or 더미)
  holdings: Holding[];
  addHolding: (h: Holding) => void;
  removeHolding: (code: string) => void;

  // 실시간 시세 (KIS에서 가져온 데이터)
  prices: Map<string, StockPrice>;

  // 종목별 캔들(일봉) 데이터 — 최근 10일 종가
  candles: Map<string, number[]>;

  // 계좌 정보
  totalEval: number;
  totalPnl: number;
  totalPnlRate: number;
  cashBalance: number;

  // 매매 이력
  trades: Trade[];
  addTrade: (t: Trade) => void;

  // KIS API 설정
  kisConfig: KISConfig;
  setKISConfig: (c: KISConfig) => void;

  // 매매 설정
  tradeSettings: TradeSettings;
  setTradeSettings: (s: TradeSettings) => void;

  // KIS 데이터 로딩
  kisLoading: boolean;
  kisConnected: boolean;
  fetchKISData: () => Promise<void>;

  // KIS Health 폴링 상태
  kisHealthLastChecked: string | null;
  kisLatencyMs: number | null;
  startHealthPolling: () => void;
  stopHealthPolling: () => void;

  // 대기 신호 뱃지
  pendingCount: number;
  fetchPendingCount: () => Promise<void>;

  hydrate: () => void;
}

const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  maxTradesPerDay: 5,
  stopLoss: 5,
  trailingStop: 3,
  dailyLossLimit: 3,
  maxHoldDays: 5,
  morningStart: "09:30",
  morningEnd: "11:30",
  afternoonStart: "13:00",
  afternoonEnd: "14:50",
};

function mapEngineControlToTradeSettings(snapshot: Partial<EngineControlSnapshot>): TradeSettings {
  return {
    maxTradesPerDay: snapshot.max_trades_per_day ?? DEFAULT_TRADE_SETTINGS.maxTradesPerDay,
    stopLoss: snapshot.stop_loss ?? DEFAULT_TRADE_SETTINGS.stopLoss,
    trailingStop: snapshot.trailing_stop ?? DEFAULT_TRADE_SETTINGS.trailingStop,
    dailyLossLimit: snapshot.daily_loss_limit ?? DEFAULT_TRADE_SETTINGS.dailyLossLimit,
    maxHoldDays: snapshot.max_hold_days ?? DEFAULT_TRADE_SETTINGS.maxHoldDays,
    morningStart: snapshot.morning_start ?? DEFAULT_TRADE_SETTINGS.morningStart,
    morningEnd: snapshot.morning_end ?? DEFAULT_TRADE_SETTINGS.morningEnd,
    afternoonStart: snapshot.afternoon_start ?? DEFAULT_TRADE_SETTINGS.afternoonStart,
    afternoonEnd: snapshot.afternoon_end ?? DEFAULT_TRADE_SETTINGS.afternoonEnd,
  };
}

async function hasOpenPositions(): Promise<boolean> {
  try {
    const res = await fetch("/api/positions");
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

function clearCachedHoldings() {
  removeFromStorage("nx-holdings");
  removeFromStorage("nx-account-summary");
}

function getFallbackSummary(holdings: Holding[], summary: AccountSummary): AccountSummary {
  if (summary.totalEval > 0) return summary;

  const stockEval = holdings.reduce(
    (sum, holding) => sum + (holding.currentPrice || holding.avgPrice || 0) * holding.quantity,
    0,
  );

  return {
    totalEval: stockEval + summary.cashBalance,
    totalPnl: summary.totalPnl,
    totalPnlRate: summary.totalPnlRate,
    cashBalance: summary.cashBalance,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  tab: "home",
  setTab: (tab) => set({ tab }),
  marketScope: "kr",
  setMarketScope: (marketScope) => {
    saveToStorage("nx-market-scope", marketScope);
    set({ marketScope });
  },

  autoTrade: true,
  toggleAutoTrade: () => set((s) => ({ autoTrade: !s.autoTrade })),

  holdings: [],
  addHolding: (h) => {
    set({ holdings: [...get().holdings, h] });
  },
  removeHolding: (code) => {
    set({ holdings: get().holdings.filter((x) => x.code !== code) });
  },

  prices: new Map(),
  candles: new Map(),
  totalEval: 0,
  totalPnl: 0,
  totalPnlRate: 0,
  cashBalance: 0,

  trades: [],
  addTrade: (t) => {
    const next = [t, ...get().trades];
    saveToStorage("nx-trades", next);
    set({ trades: next });
  },

  tradeSettings: loadFromStorage<TradeSettings>("nx-trade-settings", DEFAULT_TRADE_SETTINGS),
  setTradeSettings: (s) => {
    saveToStorage("nx-trade-settings", s);
    set({ tradeSettings: s });
  },

  kisConfig: { brokerId: DEFAULT_BROKER_ID, appKey: "", appSecret: "", accountNo: "", accountProductCode: "01" },
  setKISConfig: (c) => {
    saveToStorage("nx-kis", c);
    set({ kisConfig: c });
    // Supabase에도 저장
    fetch("/api/kis/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    }).catch(() => {});
  },

  kisLoading: false,
  kisConnected: false,

  kisHealthLastChecked: null,
  kisLatencyMs: null,

  startHealthPolling: () => {
    startKisHealthPolling({
      fetchHealth: () => fetch("/api/kis/health"),
      onSuccess: ({ connected, lastChecked, latencyMs }) => {
        set({
          kisConnected: connected,
          kisHealthLastChecked: lastChecked,
          kisLatencyMs: latencyMs,
        });
      },
    });
  },

  stopHealthPolling: () => {
    stopKisHealthPolling();
  },

  pendingCount: 0,
  fetchPendingCount: async () => {
    try {
      const res = await fetch("/api/pending-signals");
      if (res.ok) {
        const data = await res.json();
        set({ pendingCount: Array.isArray(data) ? data.length : 0 });
      }
    } catch { /* ignore */ }
  },

  fetchKISData: async () => {
    const { kisConfig, setKISConfig } = get();
    if (!kisConfig.appKey || !kisConfig.appSecret || !kisConfig.accountNo) return;

    set({ kisLoading: true });

    // 토큰 확보: 없거나 만료됐으면 자동 발급
    let config = { ...kisConfig };
    const tokenExpired = !config.token || (config.tokenExpiry && new Date(config.tokenExpiry) <= new Date());
    if (tokenExpired) {
      try {
        const res = await fetch("/api/kis/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appKey: config.appKey, appSecret: config.appSecret }),
        });
        const data = await res.json();
        if (data.token) {
          config = { ...config, token: data.token, tokenExpiry: new Date(Date.now() + 86400000).toISOString() };
          setKISConfig(config);
        } else {
          set({ kisLoading: false, kisConnected: false });
          return;
        }
      } catch {
        set({ kisLoading: false, kisConnected: false });
        return;
      }
    }

    try {
      // 1. 잔고 조회
      let balance = await fetchBrokerBalance({ brokerId: config.brokerId, config });

      // 잔고 실패 시 토큰 재발급 후 1회 재시도
      if (!balance && config.token) {
        try {
          const res = await fetch("/api/kis/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appKey: config.appKey, appSecret: config.appSecret }),
          });
          const data = await res.json();
          if (data.token) {
            config = { ...config, token: data.token, tokenExpiry: new Date(Date.now() + 86400000).toISOString() };
            setKISConfig(config);
            balance = await fetchBrokerBalance({ brokerId: config.brokerId, config });
          }
        } catch { /* 재시도 실패 → 아래에서 처리 */ }
      }

      if (balance) {
        const cachedHoldings = get().holdings;
        const cachedSummary: AccountSummary = {
          totalEval: get().totalEval,
          totalPnl: get().totalPnl,
          totalPnlRate: get().totalPnlRate,
          cashBalance: get().cashBalance,
        };

        // KIS 연결 성공 → 더미 제거, KIS 잔고만 표시
        const holdings: Holding[] = balance.holdings.map((h) => ({
          code: h.code,
          name: h.name,
          market: h.market,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          currentPrice: h.currentPrice,
          pnlRate: h.pnlRate,
        }));

        const summary: AccountSummary = {
          totalEval: balance.totalEval || balance.cashBalance,
          totalPnl: balance.totalPnl,
          totalPnlRate: balance.totalPnlRate,
          cashBalance: balance.cashBalance,
        };

        const emptyBalanceLooksSuspicious =
          holdings.length === 0 &&
          cachedHoldings.length > 0 &&
          await hasOpenPositions();

        if (emptyBalanceLooksSuspicious) {
          const fallbackSummary = getFallbackSummary(cachedHoldings, cachedSummary);
          set({
            holdings: cachedHoldings,
            totalEval: fallbackSummary.totalEval,
            totalPnl: fallbackSummary.totalPnl,
            totalPnlRate: fallbackSummary.totalPnlRate,
            cashBalance: fallbackSummary.cashBalance,
            kisConnected: true,
          });
          return;
        }

        // KIS가 0만 반환할 경우(장 마감 후 등) 이전 캐시가 있으면 금액 유지
        const summaryToSave: AccountSummary =
          summary.totalEval === 0 && summary.cashBalance === 0 && cachedSummary.totalEval > 0
            ? { ...cachedSummary }
            : summary;

        clearCachedHoldings();
        set({ holdings, ...summaryToSave, kisConnected: true });

        // 보유 종목이 있으면 시세도 조회
        if (holdings.length > 0) {
          const codes = holdings.map((h) => h.code);
          const priceMap = await fetchBrokerPrices({ brokerId: config.brokerId, config }, codes);
          set({ prices: priceMap });

          // 캔들 데이터 일괄 조회 (batch endpoint)
          try {
            const batchRes = await fetch("/api/kis/candles/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ codes }),
            });
            if (batchRes.ok) {
              const batchData = await batchRes.json();
              const candleMap = new Map<string, number[]>(
                Object.entries(batchData.candles as Record<string, number[]>)
                  .filter(([, v]) => v.length > 0)
              );
              set({ candles: candleMap });
            }
          } catch { /* 캔들 조회 실패 무시 */ }
        }
      } else {
        if (!(await hasOpenPositions())) {
          clearCachedHoldings();
          set({ holdings: [] });
        }
        set({ kisConnected: false });
      }
    } catch {
      if (!(await hasOpenPositions())) {
        clearCachedHoldings();
        set({ holdings: [] });
      }
      set({ kisConnected: false });
    } finally {
      set({ kisLoading: false });
    }
  },

  hydrate: async () => {
    const marketScope = loadFromStorage<MarketScope>("nx-market-scope", "kr");
    const trades = loadFromStorage<Trade[]>("nx-trades", []);
    clearCachedHoldings();

    // KIS 설정: Supabase 우선, 없으면 localStorage 폴백
    let kisConfig = loadFromStorage<KISConfig>("nx-kis", { brokerId: DEFAULT_BROKER_ID, appKey: "", appSecret: "", accountNo: "", accountProductCode: "01" });
    try {
      const res = await fetch("/api/kis/config");
      if (res.ok) {
        const remote = await res.json();
        if (remote.appKey) {
          kisConfig = { brokerId: DEFAULT_BROKER_ID, accountProductCode: "01", ...remote };
          saveToStorage("nx-kis", kisConfig);
        }
      }
    } catch { /* localStorage 폴백 */ }

    let tradeSettings = loadFromStorage<TradeSettings>("nx-trade-settings", get().tradeSettings);
    try {
      const res = await fetch("/api/engine-control");
      if (res.ok) {
        const remote = await res.json() as Partial<EngineControlSnapshot>;
        tradeSettings = mapEngineControlToTradeSettings(remote);
        saveToStorage("nx-trade-settings", tradeSettings);
      }
    } catch { /* localStorage 폴백 */ }
    set({
      holdings: [],
      trades,
      kisConfig,
      tradeSettings,
      marketScope,
      totalEval: 0,
      totalPnl: 0,
      totalPnlRate: 0,
      cashBalance: 0,
    });

    // appKey가 있으면 자동으로 KIS 데이터 로드 + 헬스 폴링 시작
    if (kisConfig.appKey && kisConfig.appSecret && kisConfig.accountNo) {
      get().fetchKISData();
      get().startHealthPolling();
    }

    // 대기 신호 뱃지 로드
    get().fetchPendingCount();
  },
}));
