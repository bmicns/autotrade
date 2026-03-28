import { create } from "zustand";
import { DUMMY_HOLDINGS, DUMMY_STOCKS } from "./constants";

type Tab = "home" | "signal" | "portfolio" | "stats" | "strategy" | "settings";

export interface Holding {
  code: string;
  name: string;
  market: string;
  quantity: number;
  avgPrice: number;
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

interface AppState {
  // 네비게이션
  tab: Tab;
  setTab: (tab: Tab) => void;

  // 자동매매 토글
  autoTrade: boolean;
  toggleAutoTrade: () => void;

  // 보유 종목
  holdings: Holding[];
  addHolding: (h: Holding) => void;
  removeHolding: (code: string) => void;

  // 매매 이력
  trades: Trade[];
  addTrade: (t: Trade) => void;

  // 초기화
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

  holdings: DUMMY_HOLDINGS,
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

  trades: [],
  addTrade: (t) => {
    const next = [t, ...get().trades];
    saveToStorage("nx-trades", next);
    set({ trades: next });
  },

  hydrate: () => {
    const holdings = loadFromStorage("nx-holdings", DUMMY_HOLDINGS);
    const trades = loadFromStorage<Trade[]>("nx-trades", []);
    set({ holdings, trades });
  },
}));
