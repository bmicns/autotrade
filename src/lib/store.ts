import { create } from "zustand";
import { fetchBalance, fetchPrices } from "./kis/client";

type Tab = "home" | "signal" | "portfolio" | "stats" | "strategy" | "settings";

export interface Holding {
  code: string;
  name: string;
  market: string;
  quantity: number;
  avgPrice: number;
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
  appKey: string;
  appSecret: string;
  accountNo: string;
  token?: string;
  tokenExpiry?: string;
}

export interface TradeSettings {
  maxAmountPerTrade: number;    // 1회 매매 한도 (만원)
  maxTradesPerDay: number;      // 1일 최대 횟수
  stopLoss: number;             // 손절 라인 (%)
  takeProfit: number;           // 1차 익절 (%)
  takeProfitRatio: number;      // 익절 비율 (%)
  trailingStop: number;         // 트레일링 스탑 (%)
  morningStart: string;         // 오전 세션 시작
  morningEnd: string;           // 오전 세션 종료
  afternoonStart: string;       // 오후 세션 시작
  afternoonEnd: string;         // 오후 세션 종료
}

interface AppState {
  tab: Tab;
  setTab: (tab: Tab) => void;

  autoTrade: boolean;
  toggleAutoTrade: () => void;

  // 보유 종목 (KIS 잔고 or 더미)
  holdings: Holding[];
  addHolding: (h: Holding) => void;
  removeHolding: (code: string) => void;

  // 실시간 시세 (KIS에서 가져온 데이터)
  prices: Map<string, StockPrice>;

  // 계좌 정보
  totalEval: number;
  totalPnl: number;
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

  hydrate: () => void;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export const useAppStore = create<AppState>((set, get) => ({
  tab: "home",
  setTab: (tab) => set({ tab }),

  autoTrade: true,
  toggleAutoTrade: () => set((s) => ({ autoTrade: !s.autoTrade })),

  holdings: [],
  addHolding: (h) => {
    const next = [...get().holdings, h];
    saveToStorage("nx-holdings", next);
    set({ holdings: next });
  },
  removeHolding: (code) => {
    const next = get().holdings.filter((x) => x.code !== code);
    saveToStorage("nx-holdings", next);
    set({ holdings: next });
  },

  prices: new Map(),
  totalEval: 0,
  totalPnl: 0,
  cashBalance: 0,

  trades: [],
  addTrade: (t) => {
    const next = [t, ...get().trades];
    saveToStorage("nx-trades", next);
    set({ trades: next });
  },

  tradeSettings: loadFromStorage<TradeSettings>("nx-trade-settings", {
    maxAmountPerTrade: 100,
    maxTradesPerDay: 5,
    stopLoss: 5,
    takeProfit: 5,
    takeProfitRatio: 50,
    trailingStop: 3,
    morningStart: "09:30",
    morningEnd: "11:30",
    afternoonStart: "13:00",
    afternoonEnd: "14:50",
  }),
  setTradeSettings: (s) => {
    saveToStorage("nx-trade-settings", s);
    set({ tradeSettings: s });
  },

  kisConfig: { appKey: "", appSecret: "", accountNo: "" },
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

  fetchKISData: async () => {
    const { kisConfig } = get();
    if (!kisConfig.token || !kisConfig.accountNo) return;

    set({ kisLoading: true });
    try {
      // 1. 잔고 조회
      const balance = await fetchBalance(kisConfig);
      if (balance) {
        // KIS 연결 성공 → 더미 제거, KIS 잔고만 표시
        const holdings: Holding[] = balance.holdings.map((h) => ({
          code: h.code,
          name: h.name,
          market: h.market,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
        }));
        saveToStorage("nx-holdings", holdings);
        set({
          holdings,
          totalEval: balance.totalEval || balance.cashBalance,
          totalPnl: balance.totalPnl,
          cashBalance: balance.cashBalance,
          kisConnected: true,
        });

        // 보유 종목이 있으면 시세도 조회
        if (holdings.length > 0) {
          const codes = holdings.map((h) => h.code);
          const priceMap = await fetchPrices(kisConfig, codes);
          set({ prices: priceMap });
        }
      }
    } catch {
      set({ kisConnected: false });
    } finally {
      set({ kisLoading: false });
    }
  },

  hydrate: async () => {
    const holdings = loadFromStorage("nx-holdings", []);
    const trades = loadFromStorage<Trade[]>("nx-trades", []);

    // KIS 설정: Supabase 우선, 없으면 localStorage 폴백
    let kisConfig = loadFromStorage<KISConfig>("nx-kis", { appKey: "", appSecret: "", accountNo: "" });
    try {
      const res = await fetch("/api/kis/config");
      if (res.ok) {
        const remote = await res.json();
        if (remote.appKey) {
          kisConfig = remote;
          saveToStorage("nx-kis", kisConfig);
        }
      }
    } catch { /* localStorage 폴백 */ }

    const tradeSettings = loadFromStorage<TradeSettings>("nx-trade-settings", get().tradeSettings);
    set({ holdings, trades, kisConfig, tradeSettings });
  },
}));
