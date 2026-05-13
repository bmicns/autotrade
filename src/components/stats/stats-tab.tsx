"use client";

import { Fragment, useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/ui/icons";
import { BacktestSection } from "@/components/stats/backtest-section";
import { LearningSection } from "@/components/stats/learning-section";
import { StockStatsSection } from "@/components/stats/stock-stats-section";
import { EngineLogSection } from "@/components/stats/engine-log-section";
import { PortfolioChart } from "@/components/stats/portfolio-chart";
import { useStats, type Period } from "@/hooks/useStats";

const PERIODS: { id: Period; label: string }[] = [
  { id: "1w", label: "1주" },
  { id: "1m", label: "1개월" },
  { id: "3m", label: "3개월" },
  { id: "all", label: "전체" },
];

const EXIT_LABELS: Record<string, string> = {
  stop_loss: "손절",
  take_profit: "레거시 청산",
  trailing_stop: "트레일링",
  reconcile_orphan: "리컨실 정리",
  signal_sell: "신호 매도",
  unknown: "기타",
};

const STRATEGY_LABELS: Record<string, string> = {
  watchlist_pullback: "관심종목 눌림목",
  surge_momentum: "급등 모멘텀",
  institutional_follow: "기관 추종",
  unclassified: "미분류",
};

const SURGE_ENTRY_TAG_LABELS: Record<string, string> = {
  surge_early_entry: "선캐치",
  surge_reentry: "재진입",
  surge_standard_entry: "일반진입",
  unknown: "미분류",
};

const SURGE_ENTRY_TAG_ORDER = [
  "surge_early_entry",
  "surge_reentry",
  "surge_standard_entry",
  "unknown",
] as const;

const SURGE_TIME_BUCKETS = [
  { key: "open", label: "장초반", minHour: 9, maxHour: 9 },
  { key: "morning", label: "오전", minHour: 10, maxHour: 11 },
  { key: "afternoon", label: "오후", minHour: 12, maxHour: 14 },
  { key: "close", label: "장마감", minHour: 15, maxHour: 23 },
] as const;

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DEFAULT_DIRECT_ORDER_NOTE_TEMPLATES = ["선캐치", "재진입", "눌림목", "뉴스반응", "리스크축소"] as const;

function resolveEntryTagFromNote(note: string): string | null {
  const normalized = note.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("선캐치")) return "surge_early_entry";
  if (normalized.includes("재진입")) return "surge_reentry";
  if (normalized.includes("일반진입")) return "surge_standard_entry";
  return null;
}

function summarizeDirectOrderNoteFlow(buyAmount: number, sellAmount: number) {
  const largerSide = Math.max(buyAmount, sellAmount);
  return {
    netFlow: sellAmount - buyAmount,
    sellToBuyRatio: buyAmount > 0 ? sellAmount / buyAmount : 0,
    completionRate: largerSide > 0 ? Math.min(buyAmount, sellAmount) / largerSide : 0,
    residualExposure: Math.max(0, buyAmount - sellAmount),
  };
}

function resolveSurgeTimeBucketLabel(iso: string): string {
  const hour = Number(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }));
  return SURGE_TIME_BUCKETS.find((bucket) => hour >= bucket.minHour && hour <= bucket.maxHour)?.label || "기타";
}

function resolveKstWeekdayLabel(iso: string): string {
  const weekday = new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Seoul", weekday: "short" });
  const weekdayMap: Record<string, string> = {
    Sun: "일",
    Mon: "월",
    Tue: "화",
    Wed: "수",
    Thu: "목",
    Fri: "금",
    Sat: "토",
  };
  return weekdayMap[weekday] ?? "기타";
}

function resolvePositionMarket(entrySignal: Record<string, unknown> | null): "kr" | "us" {
  return entrySignal?.directOrderMarket === "us" ? "us" : "kr";
}

interface Props {
  marketMode?: "all" | "kr" | "us";
}

export function StatsTab({ marketMode = "all" }: Props) {
  const [period, setPeriod] = useState<Period>("all");
  const [statsMarketTab, setStatsMarketTab] = useState<"all" | "kr" | "us">("all");
  const [surgeSearch, setSurgeSearch] = useState("");
  const [surgeExitFilter, setSurgeExitFilter] = useState("all");
  const [surgeOutcomeFilter, setSurgeOutcomeFilter] = useState<"all" | "win" | "loss">("all");
  const [directOrderSearch, setDirectOrderSearch] = useState("");
  const [directOrderMarketFilter, setDirectOrderMarketFilter] = useState<"all" | "kr" | "us">("all");
  const [directOrderSideFilter, setDirectOrderSideFilter] = useState<"all" | "buy" | "sell">("all");
  const [directOrderDatePreset, setDirectOrderDatePreset] = useState<"1d" | "7d" | "30d" | "all">("7d");
  const [directOrderNoteFilter, setDirectOrderNoteFilter] = useState("");
  const [directOrderNoteTemplates, setDirectOrderNoteTemplates] = useState<string[]>([...DEFAULT_DIRECT_ORDER_NOTE_TEMPLATES]);
  const [blockedKeywordStats, setBlockedKeywordStats] = useState<Array<{
    keyword: string;
    count: number;
    cooldownCount: number;
    riskCount: number;
    approvedCount: number;
  }>>([]);
  const [blockedStockStats, setBlockedStockStats] = useState<Array<{
    stock_code: string;
    stock_name?: string;
    count: number;
    cooldownCount: number;
    riskCount: number;
    approvedCount: number;
    lastBlockedAt?: string;
  }>>([]);
  const [directOrderStats, setDirectOrderStats] = useState<{
    krBuyCount: number;
    krSellCount: number;
    usBuyCount: number;
    usSellCount: number;
  } | null>(null);
  const [holdingNewsAlertStats, setHoldingNewsAlertStats] = useState<{
    sentCount: number;
    sentStockCount: number;
    noteWarningSentCount: number;
    noteWarningItemCount: number;
    failedCount: number;
  } | null>(null);
  const [holdingNewsAlertLogs, setHoldingNewsAlertLogs] = useState<Array<{
    success: boolean;
    count: number;
    noteWarningCount: number;
    noteWarningNotes: string[];
    noteWarningItems: Array<{ note: string; recentStocks: string[] }>;
    error?: string;
    run_at: string;
  }>>([]);
  const [directOrderLogs, setDirectOrderLogs] = useState<Array<{
    stock_code: string;
    stock_name?: string;
    action_type: string;
    side: string;
    market: string;
    price: number;
    qty: number;
    currency: string;
    note?: string;
    run_at: string;
  }>>([]);
  const [overseasSummary, setOverseasSummary] = useState<{
    configured: boolean;
    connected: boolean;
    holdings: Array<{
      symbol: string;
      quantity: number;
      currentPrice: number;
      kind: "stock" | "etf";
      exchangeCode: string;
    }>;
    summary?: {
      totalUsd: number;
      positionCount: number;
    };
  } | null>(null);
  const { stats, learningData, stockStats, loading, fetchStats } = useStats();

  useEffect(() => { fetchStats(period); }, [fetchStats, period]);
  useEffect(() => {
    setStatsMarketTab(marketMode);
  }, [marketMode]);
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/engine-log?page=1&limit=10");
        if (!res.ok) throw new Error(`engine-log ${res.status}`);
        const data = await res.json() as {
          blockedNewsKeywordStats?: Array<{
            keyword: string;
            count: number;
            cooldownCount: number;
            riskCount: number;
            approvedCount: number;
          }>;
          blockedNewsStockStats?: Array<{
            stock_code: string;
            stock_name?: string;
            count: number;
            cooldownCount: number;
            riskCount: number;
            approvedCount: number;
            lastBlockedAt?: string;
          }>;
          directOrderStats?: {
            krBuyCount: number;
            krSellCount: number;
            usBuyCount: number;
            usSellCount: number;
          } | null;
          holdingNewsAlertStats?: {
            sentCount: number;
            sentStockCount: number;
            noteWarningSentCount: number;
            noteWarningItemCount: number;
            failedCount: number;
          } | null;
          holdingNewsAlertLogs?: Array<{
            success: boolean;
            count: number;
            noteWarningCount: number;
            noteWarningNotes: string[];
            noteWarningItems: Array<{ note: string; recentStocks: string[] }>;
            error?: string;
            run_at: string;
          }>;
          directOrderLogs?: Array<{
            stock_code: string;
            stock_name?: string;
            action_type: string;
            side: string;
            market: string;
            price: number;
            qty: number;
            currency: string;
            note?: string;
            run_at: string;
          }>;
        };
        if (!cancelled) {
          setBlockedKeywordStats(Array.isArray(data.blockedNewsKeywordStats) ? data.blockedNewsKeywordStats.slice(0, 8) : []);
          setBlockedStockStats(Array.isArray(data.blockedNewsStockStats) ? data.blockedNewsStockStats.slice(0, 8) : []);
          setDirectOrderStats(data.directOrderStats ?? null);
          setHoldingNewsAlertStats(data.holdingNewsAlertStats ?? null);
          setHoldingNewsAlertLogs(Array.isArray(data.holdingNewsAlertLogs) ? data.holdingNewsAlertLogs.slice(0, 8) : []);
          setDirectOrderLogs(Array.isArray(data.directOrderLogs) ? data.directOrderLogs.slice(0, 8) : []);
        }
      } catch {
        if (!cancelled) {
          setBlockedKeywordStats([]);
          setBlockedStockStats([]);
          setDirectOrderStats(null);
          setHoldingNewsAlertStats(null);
          setHoldingNewsAlertLogs([]);
          setDirectOrderLogs([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine-control")
      .then((res) => res.json())
      .then((data: { manual_us_buy_note_templates?: string[]; manual_us_sell_note_templates?: string[] }) => {
        if (cancelled) return;
        const merged = Array.from(new Set([
          ...(Array.isArray(data.manual_us_buy_note_templates) ? data.manual_us_buy_note_templates : []),
          ...(Array.isArray(data.manual_us_sell_note_templates) ? data.manual_us_sell_note_templates : []),
        ].filter(Boolean)));
        setDirectOrderNoteTemplates(merged.length > 0 ? merged : [...DEFAULT_DIRECT_ORDER_NOTE_TEMPLATES]);
      })
      .catch(() => {
        if (!cancelled) setDirectOrderNoteTemplates([...DEFAULT_DIRECT_ORDER_NOTE_TEMPLATES]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kis/overseas-holdings")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setOverseasSummary(data);
      })
      .catch(() => {
        if (!cancelled) setOverseasSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 13, color: COLORS.dim }}>성과 데이터 로딩 중...</span>
      </div>
    );
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <div>
        <div style={{ padding: "40px 20px 24px", textAlign: "center" }}>
          <Icon name="bar" size={48} color={COLORS.dim} strokeWidth={1} />
          <div style={{ marginTop: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>매매 통계 없음</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 13, color: COLORS.dim, lineHeight: 1.6 }}>
              엔진이 매매를 실행하면 성과 데이터가 자동으로 집계됩니다.
            </span>
          </div>
        </div>
        <div style={{ height: 1, background: COLORS.line }} />
        <div style={{ padding: "0 16px 40px" }}>
          <EngineLogSection />
        </div>
      </div>
    );
  }

  const allClosed = stats.positions?.filter((p) => p.status === "closed") || [];
  const allOpen = stats.positions?.filter((p) => p.status === "open") || [];
  const closed = allClosed.filter((position) => statsMarketTab === "all" || resolvePositionMarket(position.entry_signal) === statsMarketTab);
  const open = allOpen.filter((position) => statsMarketTab === "all" || resolvePositionMarket(position.entry_signal) === statsMarketTab);
  const surgeClosed = closed.filter((position) => position.strategy_key === "surge_momentum");
  const effectiveDirectOrderMarketFilter = statsMarketTab === "all" ? directOrderMarketFilter : statsMarketTab;
  const filteredDirectOrderLogs = directOrderLogs.filter((log) => {
    const search = directOrderSearch.trim().toLowerCase();
    const noteSearch = directOrderNoteFilter.trim().toLowerCase();
    const matchesSearch = search.length === 0
      || log.stock_code.toLowerCase().includes(search)
      || (log.stock_name ?? "").toLowerCase().includes(search);
    const matchesNote = noteSearch.length === 0 || (log.note ?? "").toLowerCase().includes(noteSearch);
    const matchesMarket = effectiveDirectOrderMarketFilter === "all" || log.market === effectiveDirectOrderMarketFilter;
    const matchesSide = directOrderSideFilter === "all" || log.side === directOrderSideFilter;
    const ageMs = Date.now() - new Date(log.run_at).getTime();
    const maxAgeMs = directOrderDatePreset === "1d"
      ? 86400000
      : directOrderDatePreset === "7d"
        ? 7 * 86400000
        : directOrderDatePreset === "30d"
          ? 30 * 86400000
          : Number.POSITIVE_INFINITY;
    const matchesDate = ageMs <= maxAgeMs;
    return matchesSearch && matchesNote && matchesMarket && matchesSide && matchesDate;
  });
  const directOrderStockRanking = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const key = `${log.market}:${log.stock_code}`;
      const current = map.get(key) || {
        stockCode: log.stock_code,
        stockName: log.stock_name || log.stock_code,
        market: log.market,
        tradeCount: 0,
        buyCount: 0,
        sellCount: 0,
        totalQty: 0,
        totalPrice: 0,
        priceSamples: 0,
        lastSide: log.side,
        lastRunAt: log.run_at,
        recentLogs: [] as Array<{ side: string; qty: number; price: number; currency: string; note?: string; runAt: string }>,
      };
      current.tradeCount += 1;
      current.totalQty += log.qty;
      if (Number.isFinite(log.price) && log.price > 0) {
        current.totalPrice += log.price;
        current.priceSamples += 1;
      }
      if (log.side === "buy") current.buyCount += 1;
      if (log.side === "sell") current.sellCount += 1;
      if (new Date(log.run_at).getTime() > new Date(current.lastRunAt).getTime()) {
        current.lastRunAt = log.run_at;
        current.lastSide = log.side;
      }
      current.recentLogs.push({
        side: log.side,
        qty: log.qty,
        price: log.price,
        currency: log.currency,
        note: log.note,
        runAt: log.run_at,
      });
      current.recentLogs.sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
      current.recentLogs = current.recentLogs.slice(0, 3);
      map.set(key, current);
      return map;
    }, new Map<string, {
      stockCode: string;
      stockName: string;
      market: string;
      tradeCount: number;
      buyCount: number;
      sellCount: number;
      totalQty: number;
      totalPrice: number;
      priceSamples: number;
      lastSide: string;
      lastRunAt: string;
      recentLogs: Array<{ side: string; qty: number; price: number; currency: string; note?: string; runAt: string }>;
    }>()),
  )
    .map(([, item]) => item)
    .sort((a, b) => b.tradeCount - a.tradeCount || b.totalQty - a.totalQty)
    .slice(0, 8);
  const groupedDirectOrderRanking = [
    { market: "kr", label: "국내 직접 주문 랭킹" },
    { market: "us", label: "미국 직접 주문 랭킹" },
  ].map((group) => ({
    ...group,
    rows: directOrderStockRanking.filter((item) => item.market === group.market),
  })).filter((group) => group.rows.length > 0);
  const directOrderNoteRanking = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const noteKey = (log.note ?? "").trim();
      if (!noteKey) return map;
      const current = map.get(noteKey) || {
        note: noteKey,
        tradeCount: 0,
        buyCount: 0,
        sellCount: 0,
        markets: new Set<string>(),
        recentStocks: [] as Array<{ stockCode: string; side: string; runAt: string }>,
        lastRunAt: log.run_at,
      };
      current.tradeCount += 1;
      if (log.side === "buy") current.buyCount += 1;
      if (log.side === "sell") current.sellCount += 1;
      current.markets.add(log.market);
      if (new Date(log.run_at).getTime() > new Date(current.lastRunAt).getTime()) {
        current.lastRunAt = log.run_at;
      }
      current.recentStocks.push({
        stockCode: log.stock_code,
        side: log.side,
        runAt: log.run_at,
      });
      current.recentStocks.sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
      current.recentStocks = current.recentStocks.slice(0, 3);
      map.set(noteKey, current);
      return map;
    }, new Map<string, {
      note: string;
      tradeCount: number;
      buyCount: number;
      sellCount: number;
      markets: Set<string>;
      recentStocks: Array<{ stockCode: string; side: string; runAt: string }>;
      lastRunAt: string;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      markets: Array.from(item.markets).sort(),
    }))
    .sort((a, b) => b.tradeCount - a.tradeCount || new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
    .slice(0, 8);
  const directOrderNoteRecentTrades = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const noteKey = (log.note ?? "").trim();
      if (!noteKey) return map;
      const current = map.get(noteKey) || {
        note: noteKey,
        trades: [] as Array<{ stockCode: string; side: string; market: string; qty: number; price: number; currency: string; runAt: string }>,
        lastRunAt: log.run_at,
      };
      current.trades.push({
        stockCode: log.stock_code,
        side: log.side,
        market: log.market,
        qty: log.qty,
        price: log.price,
        currency: log.currency,
        runAt: log.run_at,
      });
      current.trades.sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
      current.trades = current.trades.slice(0, 5);
      if (new Date(log.run_at).getTime() > new Date(current.lastRunAt).getTime()) {
        current.lastRunAt = log.run_at;
      }
      map.set(noteKey, current);
      return map;
    }, new Map<string, {
      note: string;
      trades: Array<{ stockCode: string; side: string; market: string; qty: number; price: number; currency: string; runAt: string }>;
      lastRunAt: string;
    }>()),
  )
    .map(([, item]) => item)
    .sort((a, b) => new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
    .slice(0, 6);
  const directOrderNoteFlow = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const noteKey = (log.note ?? "").trim();
      if (!noteKey) return map;
      const amount = Math.max(0, log.qty) * Math.max(0, log.price);
      const current = map.get(noteKey) || {
        note: noteKey,
        buyAmount: 0,
        sellAmount: 0,
        buyTrades: 0,
        sellTrades: 0,
        totalTrades: 0,
      };
      current.totalTrades += 1;
      if (log.side === "buy") {
        current.buyTrades += 1;
        current.buyAmount += amount;
      } else if (log.side === "sell") {
        current.sellTrades += 1;
        current.sellAmount += amount;
      }
      map.set(noteKey, current);
      return map;
    }, new Map<string, {
      note: string;
      buyAmount: number;
      sellAmount: number;
      buyTrades: number;
      sellTrades: number;
      totalTrades: number;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      ...summarizeDirectOrderNoteFlow(item.buyAmount, item.sellAmount),
      avgTicket: item.totalTrades > 0 ? (item.buyAmount + item.sellAmount) / item.totalTrades : 0,
    }))
    .sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow) || b.totalTrades - a.totalTrades)
    .slice(0, 8);
  const directOrderNoteAlerts = directOrderNoteFlow
    .filter((item) => item.totalTrades >= 2)
    .filter((item) => item.completionRate < 0.45 || item.residualExposure > 0)
    .sort((a, b) => b.residualExposure - a.residualExposure || a.completionRate - b.completionRate || b.totalTrades - a.totalTrades)
    .slice(0, 8);
  const directOrderNotePositionStats = Array.from(
    closed.reduce((map, position) => {
      const entrySignal = (position.entry_signal as {
        directOrderNote?: string | null;
        directOrderMarket?: string | null;
      } | null) ?? null;
      const note = String(entrySignal?.directOrderNote ?? "").trim();
      if (!note) return map;
      const current = map.get(note) || {
        note,
        tradeCount: 0,
        winCount: 0,
        stopLossCount: 0,
        totalPnl: 0,
        market: String(entrySignal?.directOrderMarket ?? ""),
      };
      current.tradeCount += 1;
      current.totalPnl += Number(position.pnl_amount) || 0;
      if ((Number(position.pnl_amount) || 0) > 0) current.winCount += 1;
      if (position.exit_reason === "stop_loss") current.stopLossCount += 1;
      if (!current.market && entrySignal?.directOrderMarket) current.market = entrySignal.directOrderMarket;
      map.set(note, current);
      return map;
    }, new Map<string, {
      note: string;
      tradeCount: number;
      winCount: number;
      stopLossCount: number;
      totalPnl: number;
      market: string;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      winRate: item.tradeCount > 0 ? (item.winCount / item.tradeCount) * 100 : 0,
      stopLossRate: item.tradeCount > 0 ? (item.stopLossCount / item.tradeCount) * 100 : 0,
      avgPnl: item.tradeCount > 0 ? item.totalPnl / item.tradeCount : 0,
    }))
    .sort((a, b) => b.tradeCount - a.tradeCount || b.totalPnl - a.totalPnl)
    .slice(0, 8);
  const directOrderNoteAlertRecentStocks = new Map(
    directOrderNoteAlerts.map((item) => [
      item.note,
      filteredDirectOrderLogs
        .filter((log) => (log.note ?? "").trim() === item.note)
        .slice(0, 3),
    ]),
  );
  const directOrderNoteTimeStats = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const noteKey = (log.note ?? "").trim();
      if (!noteKey) return map;
      const timeBucket = resolveSurgeTimeBucketLabel(log.run_at);
      const key = `${noteKey}:${timeBucket}`;
      const amount = Math.max(0, log.qty) * Math.max(0, log.price);
      const current = map.get(key) || {
        note: noteKey,
        timeBucket,
        tradeCount: 0,
        buyAmount: 0,
        sellAmount: 0,
      };
      current.tradeCount += 1;
      if (log.side === "buy") current.buyAmount += amount;
      if (log.side === "sell") current.sellAmount += amount;
      map.set(key, current);
      return map;
    }, new Map<string, {
      note: string;
      timeBucket: string;
      tradeCount: number;
      buyAmount: number;
      sellAmount: number;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      netFlow: item.sellAmount - item.buyAmount,
      sellToBuyRatio: item.buyAmount > 0 ? item.sellAmount / item.buyAmount : 0,
    }))
    .sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow) || b.tradeCount - a.tradeCount)
    .slice(0, 12);
  const directOrderNoteMarketStats = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const noteKey = (log.note ?? "").trim();
      if (!noteKey) return map;
      const key = `${noteKey}:${log.market}`;
      const amount = Math.max(0, log.qty) * Math.max(0, log.price);
      const current = map.get(key) || {
        note: noteKey,
        market: log.market,
        tradeCount: 0,
        buyAmount: 0,
        sellAmount: 0,
      };
      current.tradeCount += 1;
      if (log.side === "buy") current.buyAmount += amount;
      if (log.side === "sell") current.sellAmount += amount;
      map.set(key, current);
      return map;
    }, new Map<string, {
      note: string;
      market: string;
      tradeCount: number;
      buyAmount: number;
      sellAmount: number;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      netFlow: item.sellAmount - item.buyAmount,
      sellToBuyRatio: item.buyAmount > 0 ? item.sellAmount / item.buyAmount : 0,
    }))
    .sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow) || b.tradeCount - a.tradeCount)
    .slice(0, 12);
  const directOrderNoteWeekdayStats = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const noteKey = (log.note ?? "").trim();
      if (!noteKey) return map;
      const weekday = resolveKstWeekdayLabel(log.run_at);
      const key = `${noteKey}:${weekday}`;
      const amount = Math.max(0, log.qty) * Math.max(0, log.price);
      const current = map.get(key) || {
        note: noteKey,
        weekday,
        tradeCount: 0,
        buyAmount: 0,
        sellAmount: 0,
      };
      current.tradeCount += 1;
      if (log.side === "buy") current.buyAmount += amount;
      if (log.side === "sell") current.sellAmount += amount;
      map.set(key, current);
      return map;
    }, new Map<string, {
      note: string;
      weekday: string;
      tradeCount: number;
      buyAmount: number;
      sellAmount: number;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      netFlow: item.sellAmount - item.buyAmount,
      sellToBuyRatio: item.buyAmount > 0 ? item.sellAmount / item.buyAmount : 0,
    }))
    .sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow) || b.tradeCount - a.tradeCount)
    .slice(0, 12);
  const directOrderNoteMonthlyStats = Array.from(
    filteredDirectOrderLogs.reduce((map, log) => {
      const noteKey = (log.note ?? "").trim();
      if (!noteKey) return map;
      const month = log.run_at.slice(0, 7);
      const key = `${noteKey}:${month}`;
      const amount = Math.max(0, log.qty) * Math.max(0, log.price);
      const current = map.get(key) || {
        note: noteKey,
        month,
        tradeCount: 0,
        buyAmount: 0,
        sellAmount: 0,
      };
      current.tradeCount += 1;
      if (log.side === "buy") current.buyAmount += amount;
      if (log.side === "sell") current.sellAmount += amount;
      map.set(key, current);
      return map;
    }, new Map<string, {
      note: string;
      month: string;
      tradeCount: number;
      buyAmount: number;
      sellAmount: number;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      netFlow: item.sellAmount - item.buyAmount,
      sellToBuyRatio: item.buyAmount > 0 ? item.sellAmount / item.buyAmount : 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month) || Math.abs(b.netFlow) - Math.abs(a.netFlow))
    .slice(0, 12);
  const holdingNewsAlertDailyStats = Array.from(
    holdingNewsAlertLogs.reduce((map, log) => {
      const day = log.run_at.slice(0, 10);
      const current = map.get(day) || {
        day,
        sentCount: 0,
        stockCount: 0,
        noteWarningCount: 0,
        failedCount: 0,
      };
      if (log.success) {
        current.sentCount += 1;
        current.stockCount += log.count;
        current.noteWarningCount += log.noteWarningCount;
      } else {
        current.failedCount += 1;
      }
      map.set(day, current);
      return map;
    }, new Map<string, {
      day: string;
      sentCount: number;
      stockCount: number;
      noteWarningCount: number;
      failedCount: number;
    }>()),
  )
    .map(([, item]) => item)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 10);
  const holdingNewsAlertNoteStats = Array.from(
    holdingNewsAlertLogs.reduce((map, log) => {
      if (!log.success) return map;
      for (const note of log.noteWarningNotes) {
        const current = map.get(note) || {
          note,
          sentCount: 0,
          warningCount: 0,
          lastRunAt: log.run_at,
        };
        current.sentCount += 1;
        current.warningCount += 1;
        if (new Date(log.run_at).getTime() > new Date(current.lastRunAt).getTime()) {
          current.lastRunAt = log.run_at;
        }
        map.set(note, current);
      }
      return map;
    }, new Map<string, {
      note: string;
      sentCount: number;
      warningCount: number;
      lastRunAt: string;
    }>()),
  )
    .map(([, item]) => item)
    .sort((a, b) => b.warningCount - a.warningCount || b.sentCount - a.sentCount || new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
    .slice(0, 8);
  const holdingNewsAlertNoteStockStats = Array.from(
    holdingNewsAlertLogs.reduce((map, log) => {
      if (!log.success) return map;
      for (const item of log.noteWarningItems) {
        for (const stock of item.recentStocks) {
          const key = `${item.note}:${stock}`;
          const current = map.get(key) || {
            note: item.note,
            stock,
            count: 0,
            lastRunAt: log.run_at,
          };
          current.count += 1;
          if (new Date(log.run_at).getTime() > new Date(current.lastRunAt).getTime()) {
            current.lastRunAt = log.run_at;
          }
          map.set(key, current);
        }
      }
      return map;
    }, new Map<string, {
      note: string;
      stock: string;
      count: number;
      lastRunAt: string;
    }>()),
  )
    .map(([, item]) => item)
    .sort((a, b) => b.count - a.count || new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
    .slice(0, 10);
  const holdingNewsAlertStockStats = Array.from(
    holdingNewsAlertLogs.reduce((map, log) => {
      if (!log.success) return map;
      for (const item of log.noteWarningItems) {
        for (const stock of item.recentStocks) {
          const current = map.get(stock) || {
            stock,
            count: 0,
            notes: new Set<string>(),
            lastRunAt: log.run_at,
          };
          current.count += 1;
          current.notes.add(item.note);
          if (new Date(log.run_at).getTime() > new Date(current.lastRunAt).getTime()) {
            current.lastRunAt = log.run_at;
          }
          map.set(stock, current);
        }
      }
      return map;
    }, new Map<string, {
      stock: string;
      count: number;
      notes: Set<string>;
      lastRunAt: string;
    }>()),
  )
    .map(([, item]) => ({
      stock: item.stock,
      count: item.count,
      notes: Array.from(item.notes).sort(),
      lastRunAt: item.lastRunAt,
    }))
    .sort((a, b) => b.count - a.count || b.notes.length - a.notes.length || new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
    .slice(0, 10);
  const holdingNewsAlertDirectOrderCrossStats = Array.from(
    holdingNewsAlertDailyStats.reduce((map, dayItem) => {
      const logsForDay = filteredDirectOrderLogs.filter((log) => log.run_at.slice(0, 10) === dayItem.day);
      const perNote = logsForDay.reduce((noteMap, log) => {
        const note = (log.note ?? "").trim();
        if (!note) return noteMap;
        const amount = Math.max(0, log.qty) * Math.max(0, log.price);
        const current = noteMap.get(note) || {
          note,
          tradeCount: 0,
          buyAmount: 0,
          sellAmount: 0,
        };
        current.tradeCount += 1;
        if (log.side === "buy") current.buyAmount += amount;
        if (log.side === "sell") current.sellAmount += amount;
        noteMap.set(note, current);
        return noteMap;
      }, new Map<string, {
        note: string;
        tradeCount: number;
        buyAmount: number;
        sellAmount: number;
      }>());
      const topNotes = Array.from(perNote.values())
        .map((item) => ({
          ...item,
          netFlow: item.sellAmount - item.buyAmount,
        }))
        .sort((a, b) => b.tradeCount - a.tradeCount || Math.abs(b.netFlow) - Math.abs(a.netFlow))
        .slice(0, 3);
      map.set(dayItem.day, {
        day: dayItem.day,
        noteWarningCount: dayItem.noteWarningCount,
        sentCount: dayItem.sentCount,
        topNotes,
      });
      return map;
    }, new Map<string, {
      day: string;
      noteWarningCount: number;
      sentCount: number;
      topNotes: Array<{ note: string; tradeCount: number; buyAmount: number; sellAmount: number; netFlow: number }>;
    }>()),
  )
    .map(([, item]) => item)
    .filter((item) => item.noteWarningCount > 0 && item.topNotes.length > 0)
    .sort((a, b) => b.noteWarningCount - a.noteWarningCount || b.sentCount - a.sentCount || b.day.localeCompare(a.day))
    .slice(0, 8);
  const holdingNewsAlertDirectOrderTimeStats = Array.from(
    holdingNewsAlertDailyStats.reduce((map, dayItem) => {
      const logsForDay = filteredDirectOrderLogs.filter((log) => log.run_at.slice(0, 10) === dayItem.day);
      const perBucket = logsForDay.reduce((bucketMap, log) => {
        const timeBucket = resolveSurgeTimeBucketLabel(log.run_at);
        const amount = Math.max(0, log.qty) * Math.max(0, log.price);
        const current = bucketMap.get(timeBucket) || {
          timeBucket,
          tradeCount: 0,
          buyAmount: 0,
          sellAmount: 0,
        };
        current.tradeCount += 1;
        if (log.side === "buy") current.buyAmount += amount;
        if (log.side === "sell") current.sellAmount += amount;
        bucketMap.set(timeBucket, current);
        return bucketMap;
      }, new Map<string, {
        timeBucket: string;
        tradeCount: number;
        buyAmount: number;
        sellAmount: number;
      }>());
      const topBuckets = Array.from(perBucket.values())
        .map((item) => ({
          ...item,
          netFlow: item.sellAmount - item.buyAmount,
        }))
        .sort((a, b) => b.tradeCount - a.tradeCount || Math.abs(b.netFlow) - Math.abs(a.netFlow))
        .slice(0, 4);
      map.set(dayItem.day, {
        day: dayItem.day,
        noteWarningCount: dayItem.noteWarningCount,
        topBuckets,
      });
      return map;
    }, new Map<string, {
      day: string;
      noteWarningCount: number;
      topBuckets: Array<{ timeBucket: string; tradeCount: number; buyAmount: number; sellAmount: number; netFlow: number }>;
    }>()),
  )
    .map(([, item]) => item)
    .filter((item) => item.noteWarningCount > 0 && item.topBuckets.length > 0)
    .sort((a, b) => b.noteWarningCount - a.noteWarningCount || b.day.localeCompare(a.day))
    .slice(0, 8);
  const holdingNewsAlertNoteFlowCrossStats = holdingNewsAlertNoteStats
    .map((item) => {
      const flow = directOrderNoteFlow.find((flowItem) => flowItem.note === item.note);
      return {
        note: item.note,
        warningCount: item.warningCount,
        sentCount: item.sentCount,
        tradeCount: flow?.totalTrades ?? 0,
        netFlow: flow?.netFlow ?? 0,
        completionRate: flow?.completionRate ?? 0,
        residualExposure: flow?.residualExposure ?? 0,
        buyAmount: flow?.buyAmount ?? 0,
        sellAmount: flow?.sellAmount ?? 0,
      };
    })
    .filter((item) => item.warningCount > 0)
    .sort((a, b) => b.warningCount - a.warningCount || b.tradeCount - a.tradeCount || Math.abs(b.netFlow) - Math.abs(a.netFlow))
    .slice(0, 8);
  const holdingNewsAlertNotePositionStats = holdingNewsAlertNoteStats
    .map((item) => {
      const entryTag = resolveEntryTagFromNote(item.note);
      const matched = entryTag
        ? surgeClosed.filter((position) => (((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown") === entryTag)
        : [];
      const totalPnl = matched.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
      const wins = matched.filter((position) => (position.pnl_amount ?? 0) > 0).length;
      const stopLosses = matched.filter((position) => (position.exit_reason ?? "unknown") === "stop_loss").length;
      return {
        note: item.note,
        entryTag,
        tradeCount: matched.length,
        winRate: matched.length > 0 ? (wins / matched.length) * 100 : 0,
        stopLossRate: matched.length > 0 ? (stopLosses / matched.length) * 100 : 0,
        avgPnl: matched.length > 0 ? totalPnl / matched.length : 0,
      };
    })
    .filter((item) => item.entryTag && item.tradeCount > 0)
    .sort((a, b) => b.tradeCount - a.tradeCount || a.stopLossRate - b.stopLossRate || b.winRate - a.winRate)
    .slice(0, 8);
  const surgeEntryBreakdown = Array.from(
    surgeClosed.reduce((map, position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const current = map.get(entryTag) || { count: 0, wins: 0, totalPnl: 0 };
      current.count += 1;
      current.totalPnl += position.pnl_amount ?? 0;
      if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
      map.set(entryTag, current);
      return map;
    }, new Map<string, { count: number; wins: number; totalPnl: number }>()),
  ).map(([entryTag, value]) => ({
    entryTag,
    count: value.count,
    winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
    totalPnl: value.totalPnl,
  })).sort((a, b) => b.totalPnl - a.totalPnl);
  const surgeExitOptions = Array.from(new Set(surgeClosed.map((position) => position.exit_reason || "unknown")));
  const filteredSurgeClosed = surgeClosed.filter((position) => {
    const search = surgeSearch.trim().toLowerCase();
    const matchesSearch = search.length === 0
      || (position.stock_name || "").toLowerCase().includes(search)
      || position.stock_code.toLowerCase().includes(search);
    const reason = position.exit_reason || "unknown";
    const matchesExit = surgeExitFilter === "all" || surgeExitFilter === reason;
    const pnl = position.pnl_amount ?? 0;
    const matchesOutcome = surgeOutcomeFilter === "all"
      || (surgeOutcomeFilter === "win" && pnl > 0)
      || (surgeOutcomeFilter === "loss" && pnl <= 0);
    return matchesSearch && matchesExit && matchesOutcome;
  });
  const surgeTradeCount = surgeClosed.length;
  const surgeWinCount = surgeClosed.filter((position) => (position.pnl_amount ?? 0) > 0).length;
  const surgeWinRate = surgeTradeCount > 0 ? (surgeWinCount / surgeTradeCount) * 100 : 0;
  const surgeTotalPnl = surgeClosed.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
  const surgeAvgReturn = surgeTradeCount > 0
    ? surgeClosed.reduce((sum, position) => sum + (position.pnl_percent ?? 0), 0) / surgeTradeCount
    : 0;
  const surgeNewsKeywordStats = Array.from(
    surgeClosed.reduce((map, position) => {
      const entrySignal = (position.entry_signal as { newsKeywords?: string[] } | null) ?? null;
      const keywords = Array.isArray(entrySignal?.newsKeywords) ? entrySignal.newsKeywords : [];
      for (const keyword of keywords) {
        const current = map.get(keyword) || { count: 0, wins: 0, totalPnl: 0 };
        current.count += 1;
        current.totalPnl += position.pnl_amount ?? 0;
        if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
        map.set(keyword, current);
      }
      return map;
    }, new Map<string, { count: number; wins: number; totalPnl: number }>()),
  )
    .map(([keyword, value]) => ({
      keyword,
      count: value.count,
      winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
      totalPnl: value.totalPnl,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl)
    .slice(0, 8);
  const surgeNewsKeywordDetailStats = Array.from(
    surgeClosed.reduce((map, position) => {
      const entrySignal = (position.entry_signal as { newsKeywords?: string[] } | null) ?? null;
      const keywords = Array.isArray(entrySignal?.newsKeywords) ? entrySignal.newsKeywords : [];
      for (const keyword of keywords) {
        const current = map.get(keyword) || { count: 0, totalHoldDays: 0, partialExitCount: 0 };
        current.count += 1;
        current.totalHoldDays += position.hold_days ?? 0;
        if ((position.partial_exit_qty ?? 0) > 0) current.partialExitCount += 1;
        map.set(keyword, current);
      }
      return map;
    }, new Map<string, { count: number; totalHoldDays: number; partialExitCount: number }>()),
  )
    .map(([keyword, value]) => ({
      keyword,
      count: value.count,
      avgHoldDays: value.count > 0 ? value.totalHoldDays / value.count : 0,
      partialExitRate: value.count > 0 ? (value.partialExitCount / value.count) * 100 : 0,
    }))
    .sort((a, b) => b.partialExitRate - a.partialExitRate || b.count - a.count)
    .slice(0, 8);
  const surgeNewsKeywordReentryStats = Array.from(
    surgeClosed.reduce((map, position) => {
      const entrySignal = (position.entry_signal as { newsKeywords?: string[]; entryTag?: string } | null) ?? null;
      const keywords = Array.isArray(entrySignal?.newsKeywords) ? entrySignal.newsKeywords : [];
      const entryTag = entrySignal?.entryTag || "unknown";
      for (const keyword of keywords) {
        const current = map.get(keyword) || { count: 0, reentryCount: 0, profitableReentryCount: 0 };
        current.count += 1;
        if (entryTag === "surge_reentry") {
          current.reentryCount += 1;
          if ((position.pnl_amount ?? 0) > 0) current.profitableReentryCount += 1;
        }
        map.set(keyword, current);
      }
      return map;
    }, new Map<string, { count: number; reentryCount: number; profitableReentryCount: number }>()),
  )
    .map(([keyword, value]) => ({
      keyword,
      count: value.count,
      reentryRate: value.count > 0 ? (value.reentryCount / value.count) * 100 : 0,
      profitableReentryRate: value.reentryCount > 0 ? (value.profitableReentryCount / value.reentryCount) * 100 : 0,
    }))
    .sort((a, b) => b.profitableReentryRate - a.profitableReentryRate || b.reentryRate - a.reentryRate || b.count - a.count)
    .slice(0, 8);
  const surgeNewsKeywordStopLossStats = Array.from(
    surgeClosed.reduce((map, position) => {
      const entrySignal = (position.entry_signal as { newsKeywords?: string[] } | null) ?? null;
      const keywords = Array.isArray(entrySignal?.newsKeywords) ? entrySignal.newsKeywords : [];
      for (const keyword of keywords) {
        const current = map.get(keyword) || { count: 0, stopLossCount: 0 };
        current.count += 1;
        if ((position.exit_reason || "unknown") === "stop_loss") current.stopLossCount += 1;
        map.set(keyword, current);
      }
      return map;
    }, new Map<string, { count: number; stopLossCount: number }>()),
  )
    .map(([keyword, value]) => ({
      keyword,
      count: value.count,
      stopLossRate: value.count > 0 ? (value.stopLossCount / value.count) * 100 : 0,
    }))
    .sort((a, b) => b.stopLossRate - a.stopLossRate || b.count - a.count)
    .slice(0, 8);
  const surgeNewsKeywordTimeMatrix = SURGE_TIME_BUCKETS.map((bucket) => {
    const items = surgeNewsKeywordStats
      .map((keywordStat) => {
        const positions = surgeClosed.filter((position) => {
          const entrySignal = (position.entry_signal as { newsKeywords?: string[] } | null) ?? null;
          const keywords = Array.isArray(entrySignal?.newsKeywords) ? entrySignal.newsKeywords : [];
          const hour = new Date(position.entry_date).getHours();
          return hour >= bucket.minHour && hour <= bucket.maxHour && keywords.includes(keywordStat.keyword);
        });
        if (positions.length === 0) return null;
        const totalPnl = positions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
        const winRate = positions.length > 0
          ? (positions.filter((position) => (position.pnl_amount ?? 0) > 0).length / positions.length) * 100
          : 0;
        return {
          keyword: keywordStat.keyword,
          tradeCount: positions.length,
          totalPnl,
          winRate,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.totalPnl ?? 0) - (a?.totalPnl ?? 0)) as Array<{ keyword: string; tradeCount: number; totalPnl: number; winRate: number }>;
    return {
      key: bucket.key,
      label: bucket.label,
      items: items.slice(0, 5),
    };
  }).filter((row) => row.items.length > 0);
  const surgeBlockedKeywordImpactStats = blockedKeywordStats
    .map((blocked) => {
      const keywordPerf = surgeNewsKeywordStats.find((item) => item.keyword === blocked.keyword);
      const keywordHold = surgeNewsKeywordDetailStats.find((item) => item.keyword === blocked.keyword);
      const keywordStopLoss = surgeNewsKeywordStopLossStats.find((item) => item.keyword === blocked.keyword);
      const keywordReentry = surgeNewsKeywordReentryStats.find((item) => item.keyword === blocked.keyword);
      return {
        keyword: blocked.keyword,
        blockedCount: blocked.count,
        cooldownCount: blocked.cooldownCount,
        riskCount: blocked.riskCount,
        approvedCount: blocked.approvedCount,
        tradeCount: keywordPerf?.count ?? 0,
        winRate: keywordPerf?.winRate ?? 0,
        totalPnl: keywordPerf?.totalPnl ?? 0,
        stopLossRate: keywordStopLoss?.stopLossRate ?? 0,
        avgHoldDays: keywordHold?.avgHoldDays ?? 0,
        reentrySuccessRate: keywordReentry?.profitableReentryRate ?? 0,
      };
    })
    .filter((item) => item.blockedCount > 0)
    .sort((a, b) => b.blockedCount - a.blockedCount || a.winRate - b.winRate || b.stopLossRate - a.stopLossRate)
    .slice(0, 8);
  const surgeBlockedStockImpactStats = blockedStockStats
    .map((blocked) => {
      const positions = surgeClosed.filter((position) => position.stock_code === blocked.stock_code);
      const followUpPositions = blocked.lastBlockedAt
        ? positions.filter((position) => new Date(position.entry_date).getTime() > new Date(blocked.lastBlockedAt!).getTime())
        : [];
      const tradeCount = positions.length;
      const winCount = positions.filter((position) => (position.pnl_amount ?? 0) > 0).length;
      const totalPnl = positions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
      const stopLossCount = positions.filter((position) => (position.exit_reason || "unknown") === "stop_loss").length;
      const partialExitCount = positions.filter((position) => (position.partial_exit_qty ?? 0) > 0).length;
      const avgHoldDays = tradeCount > 0
        ? positions.reduce((sum, position) => sum + (position.hold_days ?? 0), 0) / tradeCount
        : 0;
      const lastExitDate = positions
        .map((position) => position.exit_date)
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;
      const followUpTradeCount = followUpPositions.length;
      const followUpTotalPnl = followUpPositions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
      const followUpWinRate = followUpTradeCount > 0
        ? (followUpPositions.filter((position) => (position.pnl_amount ?? 0) > 0).length / followUpTradeCount) * 100
        : 0;
      const nextEntryDelayHours = blocked.lastBlockedAt && followUpTradeCount > 0
        ? (new Date(followUpPositions
            .map((position) => position.entry_date)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]).getTime() - new Date(blocked.lastBlockedAt).getTime()) / 3600000
        : null;
      return {
        stockCode: blocked.stock_code,
        stockName: blocked.stock_name || blocked.stock_code,
        blockedCount: blocked.count,
        cooldownCount: blocked.cooldownCount,
        riskCount: blocked.riskCount,
        approvedCount: blocked.approvedCount,
        lastBlockedAt: blocked.lastBlockedAt ?? null,
        tradeCount,
        winRate: tradeCount > 0 ? (winCount / tradeCount) * 100 : 0,
        stopLossRate: tradeCount > 0 ? (stopLossCount / tradeCount) * 100 : 0,
        partialExitRate: tradeCount > 0 ? (partialExitCount / tradeCount) * 100 : 0,
        totalPnl,
        avgHoldDays,
        lastExitDate,
        followUpTradeCount,
        followUpTotalPnl,
        followUpWinRate,
        nextEntryDelayHours,
      };
    })
    .filter((item) => item.blockedCount > 0)
    .sort((a, b) => b.blockedCount - a.blockedCount || a.winRate - b.winRate || b.stopLossRate - a.stopLossRate)
    .slice(0, 8);
  const surgeBlockedFollowupSummary = (() => {
    if (surgeBlockedStockImpactStats.length === 0) return null;
    const followed = surgeBlockedStockImpactStats.filter((item) => item.followUpTradeCount > 0);
    const totalBlockedStocks = surgeBlockedStockImpactStats.length;
    const followupStockCount = followed.length;
    const followupTradeCount = followed.reduce((sum, item) => sum + item.followUpTradeCount, 0);
    const followupTotalPnl = followed.reduce((sum, item) => sum + item.followUpTotalPnl, 0);
    const totalFollowupWins = followed.reduce((sum, item) => sum + Math.round((item.followUpWinRate / 100) * item.followUpTradeCount), 0);
    const avgDelayHours = followed.length > 0
      ? followed.reduce((sum, item) => sum + (item.nextEntryDelayHours ?? 0), 0) / followed.length
      : 0;
    const followupStopLossCount = followed.reduce((sum, item) => {
      const positions = surgeClosed.filter((position) => {
        if (position.stock_code !== item.stockCode) return false;
        if (!item.lastBlockedAt) return false;
        return new Date(position.entry_date).getTime() > new Date(item.lastBlockedAt).getTime()
          && (position.exit_reason || "unknown") === "stop_loss";
      });
      return sum + positions.length;
    }, 0);
    return {
      totalBlockedStocks,
      followupStockCount,
      followupStockRate: totalBlockedStocks > 0 ? (followupStockCount / totalBlockedStocks) * 100 : 0,
      followupTradeCount,
      followupWinRate: followupTradeCount > 0 ? (totalFollowupWins / followupTradeCount) * 100 : 0,
      followupTotalPnl,
      avgDelayHours,
      followupStopLossRate: followupTradeCount > 0 ? (followupStopLossCount / followupTradeCount) * 100 : 0,
    };
  })();
  const surgeBlockedFollowupExitBreakdown = (() => {
    const followupPositions = surgeBlockedStockImpactStats.flatMap((item) => {
      if (!item.lastBlockedAt) return [];
      const blockedAt = item.lastBlockedAt;
      return surgeClosed.filter((position) =>
        position.stock_code === item.stockCode
        && new Date(position.entry_date).getTime() > new Date(blockedAt).getTime()
      );
    });

    return Array.from(
      followupPositions.reduce((map, position) => {
        const reason = position.exit_reason || "unknown";
        const current = map.get(reason) || { count: 0, totalPnl: 0, wins: 0 };
        current.count += 1;
        current.totalPnl += position.pnl_amount ?? 0;
        if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
        map.set(reason, current);
        return map;
      }, new Map<string, { count: number; totalPnl: number; wins: number }>()),
    )
      .map(([reason, value]) => ({
        reason,
        count: value.count,
        winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
        avgPnl: value.count > 0 ? value.totalPnl / value.count : 0,
      }))
      .sort((a, b) => b.count - a.count || b.avgPnl - a.avgPnl);
  })();
  const surgeLearningPenaltyStats = (() => {
    const hasLearningPenalty = (position: typeof surgeClosed[number]) => {
      const penalties = ((position.entry_signal as {
        learningAdjustments?: {
          penalties?: { entryTag?: number; timeBucket?: number; newsKeyword?: number };
        };
      } | null)?.learningAdjustments?.penalties) ?? null;
      return Boolean((penalties?.entryTag ?? 0) > 0 || (penalties?.timeBucket ?? 0) > 0 || (penalties?.newsKeyword ?? 0) > 0);
    };
    const penalized = surgeClosed.filter((position) => hasLearningPenalty(position));
    const tradeCount = penalized.length;
    const winCount = penalized.filter((position) => (position.pnl_amount ?? 0) > 0).length;
    const totalPnl = penalized.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
    const stopLossCount = penalized.filter((position) => (position.exit_reason || "unknown") === "stop_loss").length;
    const bySource = Array.from(
      penalized.reduce((map, position) => {
        const penalties = ((position.entry_signal as {
          learningAdjustments?: {
            penalties?: { entryTag?: number; timeBucket?: number; newsKeyword?: number };
          };
        } | null)?.learningAdjustments?.penalties) ?? {};
        const sources = [
          (penalties.entryTag ?? 0) > 0 ? "진입타입" : null,
          (penalties.timeBucket ?? 0) > 0 ? "시간대" : null,
          (penalties.newsKeyword ?? 0) > 0 ? "뉴스키워드" : null,
        ].filter(Boolean) as string[];
        for (const source of sources) {
          const current = map.get(source) || { count: 0, wins: 0, totalPnl: 0 };
          current.count += 1;
          current.totalPnl += position.pnl_amount ?? 0;
          if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
          map.set(source, current);
        }
        return map;
      }, new Map<string, { count: number; wins: 0 | number; totalPnl: number }>()),
    ).map(([source, value]) => ({
      source,
      count: value.count,
      winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
      totalPnl: value.totalPnl,
    })).sort((a, b) => b.count - a.count || b.totalPnl - a.totalPnl);

    return {
      tradeCount,
      winRate: tradeCount > 0 ? (winCount / tradeCount) * 100 : 0,
      totalPnl,
      stopLossRate: tradeCount > 0 ? (stopLossCount / tradeCount) * 100 : 0,
      bySource,
      hasLearningPenalty,
    };
  })();
  const surgeLearningPenaltyComparison = (() => {
    const penalized = surgeClosed.filter((position) => surgeLearningPenaltyStats.hasLearningPenalty(position));
    const plain = surgeClosed.filter((position) => !surgeLearningPenaltyStats.hasLearningPenalty(position));
    const summarize = (positions: typeof surgeClosed) => {
      const tradeCount = positions.length;
      const winCount = positions.filter((position) => (position.pnl_amount ?? 0) > 0).length;
      const stopLossCount = positions.filter((position) => (position.exit_reason || "unknown") === "stop_loss").length;
      const totalPnl = positions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
      const avgPnl = tradeCount > 0 ? totalPnl / tradeCount : 0;
      return {
        tradeCount,
        winRate: tradeCount > 0 ? (winCount / tradeCount) * 100 : 0,
        stopLossRate: tradeCount > 0 ? (stopLossCount / tradeCount) * 100 : 0,
        totalPnl,
        avgPnl,
      };
    };
    return {
      penalized: summarize(penalized),
      plain: summarize(plain),
    };
  })();
  const surgeLearningPenaltyStrengthStats = (() => {
    const bucketOf = (score: number) => {
      if (score >= 10) return "강함";
      if (score >= 5) return "중간";
      return "약함";
    };
    const bucketMap = surgeClosed.reduce((map, position) => {
      const penalties = ((position.entry_signal as {
        learningAdjustments?: {
          penalties?: { entryTag?: number; timeBucket?: number; newsKeyword?: number };
        };
      } | null)?.learningAdjustments?.penalties) ?? null;
      const totalPenalty = (penalties?.entryTag ?? 0) + (penalties?.timeBucket ?? 0) + (penalties?.newsKeyword ?? 0);
      if (totalPenalty <= 0) return map;
      const bucket = bucketOf(totalPenalty);
      const current = map.get(bucket) || { count: 0, wins: 0, totalPnl: 0, stopLossCount: 0, penaltySum: 0 };
      current.count += 1;
      current.penaltySum += totalPenalty;
      current.totalPnl += position.pnl_amount ?? 0;
      if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
      if ((position.exit_reason || "unknown") === "stop_loss") current.stopLossCount += 1;
      map.set(bucket, current);
      return map;
    }, new Map<string, { count: number; wins: number; totalPnl: number; stopLossCount: number; penaltySum: number }>());

    return ["강함", "중간", "약함"]
      .map((bucket) => {
        const value = bucketMap.get(bucket);
        if (!value) return null;
        return {
          bucket,
          count: value.count,
          avgPenalty: value.count > 0 ? value.penaltySum / value.count : 0,
          winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
          stopLossRate: value.count > 0 ? (value.stopLossCount / value.count) * 100 : 0,
          avgPnl: value.count > 0 ? value.totalPnl / value.count : 0,
        };
      })
      .filter(Boolean) as Array<{ bucket: string; count: number; avgPenalty: number; winRate: number; stopLossRate: number; avgPnl: number }>;
  })();
  const surgeLearningModeComparison = (() => {
    const summarize = (positions: typeof surgeClosed) => {
      const tradeCount = positions.length;
      const winCount = positions.filter((position) => (position.pnl_amount ?? 0) > 0).length;
      const stopLossCount = positions.filter((position) => (position.exit_reason || "unknown") === "stop_loss").length;
      const totalPnl = positions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
      return {
        tradeCount,
        winRate: tradeCount > 0 ? (winCount / tradeCount) * 100 : 0,
        stopLossRate: tradeCount > 0 ? (stopLossCount / tradeCount) * 100 : 0,
        avgPnl: tradeCount > 0 ? totalPnl / tradeCount : 0,
        totalPnl,
      };
    };
    const onPositions = surgeClosed.filter((position) => ((position.entry_signal as { learningRiskEnabled?: boolean } | null)?.learningRiskEnabled) === true);
    const offPositions = surgeClosed.filter((position) => ((position.entry_signal as { learningRiskEnabled?: boolean } | null)?.learningRiskEnabled) === false);
    return {
      on: summarize(onPositions),
      off: summarize(offPositions),
    };
  })();
  const filteredSurgeTradeCount = filteredSurgeClosed.length;
  const filteredSurgeWinCount = filteredSurgeClosed.filter((position) => (position.pnl_amount ?? 0) > 0).length;
  const filteredSurgeWinRate = filteredSurgeTradeCount > 0 ? (filteredSurgeWinCount / filteredSurgeTradeCount) * 100 : 0;
  const filteredSurgeTotalPnl = filteredSurgeClosed.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
  const surgeExitBreakdown = Array.from(
    surgeClosed.reduce((map, position) => {
      const reason = position.exit_reason || "unknown";
      const current = map.get(reason) || { count: 0, totalPnl: 0 };
      current.count += 1;
      current.totalPnl += position.pnl_amount ?? 0;
      map.set(reason, current);
      return map;
    }, new Map<string, { count: number; totalPnl: number }>()),
  ).map(([reason, value]) => ({
    reason,
    count: value.count,
    avgPnl: value.count > 0 ? value.totalPnl / value.count : 0,
  }));
  const surgeExitHoldBreakdown = Array.from(
    surgeClosed.reduce((map, position) => {
      const reason = position.exit_reason || "unknown";
      const current = map.get(reason) || { count: 0, totalHoldDays: 0, wins: 0 };
      current.count += 1;
      current.totalHoldDays += position.hold_days ?? 0;
      if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
      map.set(reason, current);
      return map;
    }, new Map<string, { count: number; totalHoldDays: number; wins: number }>()),
  ).map(([reason, value]) => ({
    reason,
    count: value.count,
    avgHoldDays: value.count > 0 ? value.totalHoldDays / value.count : 0,
    winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
  }));
  const surgeMonthlyByEntryTag = Array.from(
    surgeClosed.reduce((map, position) => {
      if (!position.exit_date) return map;
      const month = position.exit_date.slice(0, 7);
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const monthEntry = map.get(month) || new Map<string, { count: number; totalPnl: number }>();
      const tagEntry = monthEntry.get(entryTag) || { count: 0, totalPnl: 0 };
      tagEntry.count += 1;
      tagEntry.totalPnl += position.pnl_amount ?? 0;
      monthEntry.set(entryTag, tagEntry);
      map.set(month, monthEntry);
      return map;
    }, new Map<string, Map<string, { count: number; totalPnl: number }>>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      items: SURGE_ENTRY_TAG_ORDER
        .map((entryTag) => {
          const value = values.get(entryTag);
          return value
            ? { entryTag, count: value.count, totalPnl: value.totalPnl }
            : null;
        })
        .filter(Boolean) as Array<{ entryTag: string; count: number; totalPnl: number }>,
    }))
    .filter((row) => row.items.length > 0);
  const surgeMonthlyWinRateByEntryTag = Array.from(
    surgeClosed.reduce((map, position) => {
      if (!position.exit_date) return map;
      const month = position.exit_date.slice(0, 7);
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const monthEntry = map.get(month) || new Map<string, { count: number; wins: number }>();
      const tagEntry = monthEntry.get(entryTag) || { count: 0, wins: 0 };
      tagEntry.count += 1;
      if ((position.pnl_amount ?? 0) > 0) tagEntry.wins += 1;
      monthEntry.set(entryTag, tagEntry);
      map.set(month, monthEntry);
      return map;
    }, new Map<string, Map<string, { count: number; wins: number }>>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      items: SURGE_ENTRY_TAG_ORDER
        .map((entryTag) => {
          const value = values.get(entryTag);
          return value
            ? { entryTag, count: value.count, winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0 }
            : null;
        })
        .filter(Boolean) as Array<{ entryTag: string; count: number; winRate: number }>,
    }))
    .filter((row) => row.items.length > 0);
  const surgeReentryStockRanking = Array.from(
    surgeClosed.reduce((map, position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      if (entryTag !== "surge_reentry") return map;
      const key = position.stock_code;
      const current = map.get(key) || {
        stockCode: position.stock_code,
        stockName: position.stock_name || position.stock_code,
        count: 0,
        wins: 0,
        totalPnl: 0,
      };
      current.count += 1;
      current.totalPnl += position.pnl_amount ?? 0;
      if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
      map.set(key, current);
      return map;
    }, new Map<string, { stockCode: string; stockName: string; count: number; wins: number; totalPnl: number }>()),
  )
    .map(([, item]) => ({
      ...item,
      winRate: item.count > 0 ? (item.wins / item.count) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || b.totalPnl - a.totalPnl)
    .slice(0, 8);
  const surgeEarlyHoldStats = (() => {
    const earlyEntries = surgeClosed.filter((position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      return entryTag === "surge_early_entry";
    });
    const tradeCount = earlyEntries.length;
    const avgHoldDays = tradeCount > 0
      ? earlyEntries.reduce((sum, position) => sum + (position.hold_days ?? 0), 0) / tradeCount
      : 0;
    const avgReturn = tradeCount > 0
      ? earlyEntries.reduce((sum, position) => sum + (position.pnl_percent ?? 0), 0) / tradeCount
      : 0;
    const winRate = tradeCount > 0
      ? (earlyEntries.filter((position) => (position.pnl_amount ?? 0) > 0).length / tradeCount) * 100
      : 0;
    const earlyCodes = new Set(earlyEntries.map((position) => position.stock_code));
    const reentryCodes = new Set(
      surgeClosed
        .filter((position) => (((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown") === "surge_reentry")
        .map((position) => position.stock_code),
    );
    const convertedCount = Array.from(earlyCodes).filter((code) => reentryCodes.has(code)).length;
    const conversionRate = earlyCodes.size > 0 ? (convertedCount / earlyCodes.size) * 100 : 0;
    return { tradeCount, avgHoldDays, avgReturn, winRate, convertedCount, conversionRate };
  })();
  const surgeDailyPnl = Array.from(
    surgeClosed.reduce((map, position) => {
      if (!position.exit_date) return map;
      const day = new Date(position.exit_date).toLocaleDateString("ko-KR");
      const current = map.get(day) || { count: 0, totalPnl: 0, wins: 0 };
      current.count += 1;
      current.totalPnl += position.pnl_amount ?? 0;
      if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
      map.set(day, current);
      return map;
    }, new Map<string, { count: number; totalPnl: number; wins: number }>()),
  )
    .map(([day, value]) => ({
      day,
      count: value.count,
      totalPnl: value.totalPnl,
      winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
    }))
    .sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime())
    .slice(0, 10);
  const surgeFunnelStats = (() => {
    const earlyEntries = surgeClosed.filter((position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      return entryTag === "surge_early_entry";
    });
    const earlyCodes = new Set(earlyEntries.map((position) => position.stock_code));
    const reentryPositions = surgeClosed.filter((position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      return entryTag === "surge_reentry" && earlyCodes.has(position.stock_code);
    });
    const reentryCodes = new Set(reentryPositions.map((position) => position.stock_code));
    const profitableReentryCodes = new Set(
      reentryPositions
        .filter((position) => (position.pnl_amount ?? 0) > 0)
        .map((position) => position.stock_code),
    );
    const earlyCount = earlyCodes.size;
    const reentryCount = reentryCodes.size;
    const profitableReentryCount = profitableReentryCodes.size;
    return {
      earlyCount,
      reentryCount,
      profitableReentryCount,
      reentryRate: earlyCount > 0 ? (reentryCount / earlyCount) * 100 : 0,
      profitableReentryRate: reentryCount > 0 ? (profitableReentryCount / reentryCount) * 100 : 0,
    };
  })();
  const surgeTimeBucketStats = SURGE_TIME_BUCKETS.map((bucket) => {
    const positions = surgeClosed.filter((position) => {
      const hour = new Date(position.entry_date).getHours();
      return hour >= bucket.minHour && hour <= bucket.maxHour;
    });
    const tradeCount = positions.length;
    const totalPnl = positions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
    const winRate = tradeCount > 0
      ? (positions.filter((position) => (position.pnl_amount ?? 0) > 0).length / tradeCount) * 100
      : 0;
    return {
      key: bucket.key,
      label: bucket.label,
      tradeCount,
      totalPnl,
      winRate,
    };
  }).filter((item) => item.tradeCount > 0);
  const surgePartialExitByEntryTag = SURGE_ENTRY_TAG_ORDER.map((entryTag) => {
    const positions = surgeClosed.filter((position) => {
      const tag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      return tag === entryTag;
    });
    if (positions.length === 0) return null;
    const partialExitCount = positions.filter((position) => (position.partial_exit_qty ?? 0) > 0).length;
    return {
      entryTag,
      tradeCount: positions.length,
      partialExitCount,
      partialExitRate: positions.length > 0 ? (partialExitCount / positions.length) * 100 : 0,
    };
  }).filter(Boolean) as Array<{ entryTag: string; tradeCount: number; partialExitCount: number; partialExitRate: number }>;
  const surgeStockTradeHistory = Array.from(
    surgeClosed.reduce((map, position) => {
      const key = position.stock_code;
      const current = map.get(key) || {
        stockCode: position.stock_code,
        stockName: position.stock_name || position.stock_code,
        tradeCount: 0,
        totalPnl: 0,
        wins: 0,
        lastExitDate: position.exit_date,
        entryTags: new Set<string>(),
      };
      current.tradeCount += 1;
      current.totalPnl += position.pnl_amount ?? 0;
      if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
      if (position.exit_date && (!current.lastExitDate || new Date(position.exit_date) > new Date(current.lastExitDate))) {
        current.lastExitDate = position.exit_date;
      }
      current.entryTags.add(((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown");
      map.set(key, current);
      return map;
    }, new Map<string, {
      stockCode: string;
      stockName: string;
      tradeCount: number;
      totalPnl: number;
      wins: number;
      lastExitDate: string | null;
      entryTags: Set<string>;
    }>()),
  )
    .map(([, item]) => ({
      stockCode: item.stockCode,
      stockName: item.stockName,
      tradeCount: item.tradeCount,
      totalPnl: item.totalPnl,
      winRate: item.tradeCount > 0 ? (item.wins / item.tradeCount) * 100 : 0,
      lastExitDate: item.lastExitDate,
      entryTags: Array.from(item.entryTags),
    }))
    .sort((a, b) => b.tradeCount - a.tradeCount || b.totalPnl - a.totalPnl)
    .slice(0, 8);
  const surgeTimeByEntryMatrix = SURGE_TIME_BUCKETS.map((bucket) => {
    const items = SURGE_ENTRY_TAG_ORDER.map((entryTag) => {
      const positions = surgeClosed.filter((position) => {
        const hour = new Date(position.entry_date).getHours();
        const tag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
        return hour >= bucket.minHour && hour <= bucket.maxHour && tag === entryTag;
      });
      if (positions.length === 0) return null;
      const totalPnl = positions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
      const winRate = (positions.filter((position) => (position.pnl_amount ?? 0) > 0).length / positions.length) * 100;
      return {
        entryTag,
        tradeCount: positions.length,
        totalPnl,
        winRate,
      };
    }).filter(Boolean) as Array<{ entryTag: string; tradeCount: number; totalPnl: number; winRate: number }>;
    return { key: bucket.key, label: bucket.label, items };
  }).filter((row) => row.items.length > 0);
  const surgePartialExitTimeStats = SURGE_TIME_BUCKETS.map((bucket) => {
    const positions = surgeClosed.filter((position) => {
      const hour = new Date(position.entry_date).getHours();
      return hour >= bucket.minHour && hour <= bucket.maxHour;
    });
    if (positions.length === 0) return null;
    const partialPositions = positions.filter((position) => (position.partial_exit_qty ?? 0) > 0);
    const successfulPartialPositions = partialPositions.filter((position) => (position.pnl_amount ?? 0) > 0);
    return {
      key: bucket.key,
      label: bucket.label,
      tradeCount: positions.length,
      partialCount: partialPositions.length,
      partialRate: positions.length > 0 ? (partialPositions.length / positions.length) * 100 : 0,
      successRate: partialPositions.length > 0 ? (successfulPartialPositions.length / partialPositions.length) * 100 : 0,
    };
  }).filter(Boolean) as Array<{
    key: string;
    label: string;
    tradeCount: number;
    partialCount: number;
    partialRate: number;
    successRate: number;
  }>;
  const surgeReentryCountBuckets = Array.from(
    surgeReentryStockRanking.reduce((map, item) => {
      const label = item.count >= 4 ? "4회+" : `${item.count}회`;
      const current = map.get(label) || { stockCount: 0, totalPnl: 0, weightedWinRate: 0, totalTrades: 0 };
      current.stockCount += 1;
      current.totalPnl += item.totalPnl;
      current.weightedWinRate += item.winRate * item.count;
      current.totalTrades += item.count;
      map.set(label, current);
      return map;
    }, new Map<string, { stockCount: number; totalPnl: number; weightedWinRate: number; totalTrades: number }>()),
  )
    .map(([label, item]) => ({
      label,
      stockCount: item.stockCount,
      tradeCount: item.totalTrades,
      winRate: item.totalTrades > 0 ? item.weightedWinRate / item.totalTrades : 0,
      totalPnl: item.totalPnl,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko-KR", { numeric: true }));
  const surgeStockCycleTimeline = Array.from(
    surgeClosed.reduce((map, position) => {
      const key = position.stock_code;
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const current = map.get(key) || {
        stockCode: position.stock_code,
        stockName: position.stock_name || position.stock_code,
        earlyCount: 0,
        reentryCount: 0,
        partialExitCount: 0,
        totalPnl: 0,
        lastExitDate: position.exit_date,
      };
      if (entryTag === "surge_early_entry") current.earlyCount += 1;
      if (entryTag === "surge_reentry") current.reentryCount += 1;
      if ((position.partial_exit_qty ?? 0) > 0) current.partialExitCount += 1;
      current.totalPnl += position.pnl_amount ?? 0;
      if (position.exit_date && (!current.lastExitDate || new Date(position.exit_date) > new Date(current.lastExitDate))) {
        current.lastExitDate = position.exit_date;
      }
      map.set(key, current);
      return map;
    }, new Map<string, {
      stockCode: string;
      stockName: string;
      earlyCount: number;
      reentryCount: number;
      partialExitCount: number;
      totalPnl: number;
      lastExitDate: string | null;
    }>()),
  )
    .map(([, item]) => item)
    .filter((item) => item.earlyCount > 0 || item.reentryCount > 0)
    .sort((a, b) => (b.earlyCount + b.reentryCount) - (a.earlyCount + a.reentryCount) || b.totalPnl - a.totalPnl)
    .slice(0, 8);
  const surgeWeekdayStats = Array.from(
    surgeClosed.reduce((map, position) => {
      const weekday = WEEKDAY_LABELS[new Date(position.entry_date).getDay()] || "기타";
      const current = map.get(weekday) || { count: 0, wins: 0, totalPnl: 0 };
      current.count += 1;
      current.totalPnl += position.pnl_amount ?? 0;
      if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
      map.set(weekday, current);
      return map;
    }, new Map<string, { count: number; wins: number; totalPnl: number }>()),
  )
    .map(([weekday, item]) => ({
      weekday,
      tradeCount: item.count,
      winRate: item.count > 0 ? (item.wins / item.count) * 100 : 0,
      totalPnl: item.totalPnl,
    }))
    .sort((a, b) => WEEKDAY_LABELS.indexOf(a.weekday as typeof WEEKDAY_LABELS[number]) - WEEKDAY_LABELS.indexOf(b.weekday as typeof WEEKDAY_LABELS[number]));
  const surgeReentryDelayStats = (() => {
    const stockWindows = surgeClosed.reduce((map, position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const current = map.get(position.stock_code) || { stockCode: position.stock_code, firstEarlyAt: null as Date | null, firstReentryAt: null as Date | null };
      const entryAt = new Date(position.entry_date);
      if (entryTag === "surge_early_entry" && (!current.firstEarlyAt || entryAt < current.firstEarlyAt)) current.firstEarlyAt = entryAt;
      if (entryTag === "surge_reentry" && (!current.firstReentryAt || entryAt < current.firstReentryAt)) current.firstReentryAt = entryAt;
      map.set(position.stock_code, current);
      return map;
    }, new Map<string, { stockCode: string; firstEarlyAt: Date | null; firstReentryAt: Date | null }>());

    const delays = Array.from(stockWindows.values())
      .filter((item) => item.firstEarlyAt && item.firstReentryAt && item.firstReentryAt >= item.firstEarlyAt)
      .map((item) => item.firstReentryAt!.getTime() - item.firstEarlyAt!.getTime());

    const avgDelayHours = delays.length > 0
      ? delays.reduce((sum, value) => sum + value, 0) / delays.length / 3600000
      : 0;

    return {
      stockCount: delays.length,
      avgDelayHours,
    };
  })();
  const surgeReentryDelayBuckets = (() => {
    const stockWindows = surgeClosed.reduce((map, position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const current = map.get(position.stock_code) || { firstEarlyAt: null as Date | null, firstReentryAt: null as Date | null };
      const entryAt = new Date(position.entry_date);
      if (entryTag === "surge_early_entry" && (!current.firstEarlyAt || entryAt < current.firstEarlyAt)) current.firstEarlyAt = entryAt;
      if (entryTag === "surge_reentry" && (!current.firstReentryAt || entryAt < current.firstReentryAt)) current.firstReentryAt = entryAt;
      map.set(position.stock_code, current);
      return map;
    }, new Map<string, { firstEarlyAt: Date | null; firstReentryAt: Date | null }>());

    const delays = Array.from(stockWindows.values())
      .filter((item) => item.firstEarlyAt && item.firstReentryAt && item.firstReentryAt >= item.firstEarlyAt)
      .map((item) => (item.firstReentryAt!.getTime() - item.firstEarlyAt!.getTime()) / 3600000);

    const buckets = [
      { label: "1시간 이내", min: 0, max: 1 },
      { label: "1-3시간", min: 1, max: 3 },
      { label: "3-24시간", min: 3, max: 24 },
      { label: "1일+", min: 24, max: Number.POSITIVE_INFINITY },
    ];

    return buckets
      .map((bucket) => {
        const count = delays.filter((hours) => hours >= bucket.min && hours < bucket.max).length;
        return { label: bucket.label, count };
      })
      .filter((item) => item.count > 0);
  })();
  const surgeMonthWeekdayHeatmap = Array.from(
    surgeClosed.reduce((map, position) => {
      const month = position.entry_date.slice(0, 7);
      const weekday = WEEKDAY_LABELS[new Date(position.entry_date).getDay()] || "기타";
      const hour = new Date(position.entry_date).getHours();
      const timeBucket = SURGE_TIME_BUCKETS.find((bucket) => hour >= bucket.minHour && hour <= bucket.maxHour)?.label || "기타";
      const monthEntry = map.get(month) || new Map<string, { count: number; totalPnl: number }>();
      const cellKey = `${weekday}-${timeBucket}`;
      const cell = monthEntry.get(cellKey) || { count: 0, totalPnl: 0 };
      cell.count += 1;
      cell.totalPnl += position.pnl_amount ?? 0;
      monthEntry.set(cellKey, cell);
      map.set(month, monthEntry);
      return map;
    }, new Map<string, Map<string, { count: number; totalPnl: number }>>()),
  )
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 3)
    .map(([month, cells]) => ({
      month,
      rows: WEEKDAY_LABELS.slice(1, 6).map((weekday) => ({
        weekday,
        cells: SURGE_TIME_BUCKETS.map((bucket) => {
          const value = cells.get(`${weekday}-${bucket.label}`) || { count: 0, totalPnl: 0 };
          return {
            timeLabel: bucket.label,
            count: value.count,
            totalPnl: value.totalPnl,
          };
        }),
      })),
    }));
  const surgeAvgPnlByEntryTag = SURGE_ENTRY_TAG_ORDER.map((entryTag) => {
    const positions = surgeClosed.filter((position) => {
      const tag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      return tag === entryTag;
    });
    if (positions.length === 0) return null;
    const totalPnl = positions.reduce((sum, position) => sum + (position.pnl_amount ?? 0), 0);
    const totalReturn = positions.reduce((sum, position) => sum + (position.pnl_percent ?? 0), 0);
    return {
      entryTag,
      tradeCount: positions.length,
      avgPnl: totalPnl / positions.length,
      avgReturn: totalReturn / positions.length,
    };
  }).filter(Boolean) as Array<{ entryTag: string; tradeCount: number; avgPnl: number; avgReturn: number }>;
  const surgeReentryDelayByStock = Array.from(
    surgeClosed.reduce((map, position) => {
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const current = map.get(position.stock_code) || {
        stockCode: position.stock_code,
        stockName: position.stock_name || position.stock_code,
        firstEarlyAt: null as Date | null,
        firstReentryAt: null as Date | null,
        totalPnl: 0,
      };
      const entryAt = new Date(position.entry_date);
      if (entryTag === "surge_early_entry" && (!current.firstEarlyAt || entryAt < current.firstEarlyAt)) current.firstEarlyAt = entryAt;
      if (entryTag === "surge_reentry" && (!current.firstReentryAt || entryAt < current.firstReentryAt)) current.firstReentryAt = entryAt;
      current.totalPnl += position.pnl_amount ?? 0;
      map.set(position.stock_code, current);
      return map;
    }, new Map<string, {
      stockCode: string;
      stockName: string;
      firstEarlyAt: Date | null;
      firstReentryAt: Date | null;
      totalPnl: number;
    }>()),
  )
    .map(([, item]) => ({
      ...item,
      delayHours: item.firstEarlyAt && item.firstReentryAt && item.firstReentryAt >= item.firstEarlyAt
        ? (item.firstReentryAt.getTime() - item.firstEarlyAt.getTime()) / 3600000
        : null,
    }))
    .filter((item) => item.delayHours !== null)
    .sort((a, b) => (a.delayHours ?? 0) - (b.delayHours ?? 0))
    .slice(0, 8);
  const surgeTopStocksByEntryTag = SURGE_ENTRY_TAG_ORDER.map((entryTag) => {
    const rows = Array.from(
      surgeClosed.reduce((map, position) => {
        const tag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
        if (tag !== entryTag) return map;
        const key = position.stock_code;
        const current = map.get(key) || {
          stockCode: position.stock_code,
          stockName: position.stock_name || position.stock_code,
          tradeCount: 0,
          totalPnl: 0,
          wins: 0,
        };
        current.tradeCount += 1;
        current.totalPnl += position.pnl_amount ?? 0;
        if ((position.pnl_amount ?? 0) > 0) current.wins += 1;
        map.set(key, current);
        return map;
      }, new Map<string, { stockCode: string; stockName: string; tradeCount: number; totalPnl: number; wins: number }>()),
    )
      .map(([, item]) => ({
        ...item,
        winRate: item.tradeCount > 0 ? (item.wins / item.tradeCount) * 100 : 0,
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, 5);
    return rows.length > 0 ? { entryTag, rows } : null;
  }).filter(Boolean) as Array<{
    entryTag: string;
    rows: Array<{ stockCode: string; stockName: string; tradeCount: number; totalPnl: number; winRate: number }>;
  }>;
  const surgeMonthlyReentryDelay = (() => {
    const stockWindows = surgeClosed.reduce((map, position) => {
      const month = position.entry_date.slice(0, 7);
      const entryTag = ((position.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown";
      const bucket = map.get(month) || new Map<string, { firstEarlyAt: Date | null; firstReentryAt: Date | null }>();
      const current = bucket.get(position.stock_code) || { firstEarlyAt: null as Date | null, firstReentryAt: null as Date | null };
      const entryAt = new Date(position.entry_date);
      if (entryTag === "surge_early_entry" && (!current.firstEarlyAt || entryAt < current.firstEarlyAt)) current.firstEarlyAt = entryAt;
      if (entryTag === "surge_reentry" && (!current.firstReentryAt || entryAt < current.firstReentryAt)) current.firstReentryAt = entryAt;
      bucket.set(position.stock_code, current);
      map.set(month, bucket);
      return map;
    }, new Map<string, Map<string, { firstEarlyAt: Date | null; firstReentryAt: Date | null }>>());

    return Array.from(stockWindows.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => {
        const delays = Array.from(bucket.values())
          .filter((item) => item.firstEarlyAt && item.firstReentryAt && item.firstReentryAt >= item.firstEarlyAt)
          .map((item) => (item.firstReentryAt!.getTime() - item.firstEarlyAt!.getTime()) / 3600000);
        return {
          month,
          stockCount: delays.length,
          avgDelayHours: delays.length > 0 ? delays.reduce((sum, value) => sum + value, 0) / delays.length : 0,
        };
      })
      .filter((item) => item.stockCount > 0);
  })();

  if (statsMarketTab === "us") {
    return (
      <div>
        {marketMode === "all" && <div style={{ padding: "16px 20px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { key: "all", label: "전체" },
              { key: "kr", label: "국내" },
              { key: "us", label: "해외" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatsMarketTab(tab.key as "all" | "kr" | "us")}
                style={{
                  padding: "10px 0",
                  borderRadius: 10,
                  border: `1px solid ${statsMarketTab === tab.key ? COLORS.hero : COLORS.line}`,
                  background: statsMarketTab === tab.key ? COLORS.hero : COLORS.sub,
                  color: statsMarketTab === tab.key ? "#fff" : COLORS.dim,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>}

        {overseasSummary?.configured && (
          <div style={{ padding: "16px 20px 0" }}>
            <div style={{ padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8", letterSpacing: "0.05em", textTransform: "uppercase" }}>해외 익스포저</span>
                <span style={{ fontSize: 11, color: COLORS.dim }}>{overseasSummary.connected ? "실잔고 기준" : "연결 확인 중"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {[
                  { label: "포지션", value: `${overseasSummary.summary?.positionCount ?? 0}개` },
                  { label: "평가금액", value: `USD ${(overseasSummary.summary?.totalUsd ?? 0).toFixed(2)}` },
                  { label: "ETF", value: `${overseasSummary.holdings.filter((holding) => holding.kind === "etf").length}개` },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#1D4ED8" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "16px 20px 12px", display: "flex", gap: 6 }}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: period === p.id ? 700 : 500, fontFamily: "inherit",
                background: period === p.id ? COLORS.hero : COLORS.sub,
                color: period === p.id ? "#fff" : COLORS.dim,
              }}
            >{p.label}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 16px 16px" }}>
          {[
            { label: "미국 매수", value: `${directOrderStats?.usBuyCount ?? 0}회`, sub: "직접 주문", color: COLORS.ink },
            { label: "미국 매도", value: `${directOrderStats?.usSellCount ?? 0}회`, sub: "직접 주문", color: COLORS.ink },
            { label: "USD 평가", value: `USD ${(overseasSummary?.summary?.totalUsd ?? 0).toFixed(2)}`, sub: `${overseasSummary?.summary?.positionCount ?? 0}개 보유`, color: "#1D4ED8" },
            { label: "해외 로그", value: `${filteredDirectOrderLogs.length}건`, sub: `${directOrderNoteRanking.length}개 메모`, color: COLORS.ink },
          ].map((card) => (
            <div key={card.label} style={{ background: COLORS.sub, borderRadius: 12, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {holdingNewsAlertStats && (
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 점검 전송</span>
                <span style={{ fontSize: 11, color: COLORS.dim }}>해외 포함 운영 요약</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                {[
                  { label: "전송", value: holdingNewsAlertStats.sentCount },
                  { label: "종목수", value: holdingNewsAlertStats.sentStockCount },
                  { label: "메모전송", value: holdingNewsAlertStats.noteWarningSentCount },
                  { label: "메모경고", value: holdingNewsAlertStats.noteWarningItemCount },
                  { label: "실패", value: holdingNewsAlertStats.failedCount },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "0 16px" }}><EngineLogSection /></div>
      </div>
    );
  }

  return (
    <div>
      {marketMode === "all" && <div style={{ padding: "16px 20px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { key: "all", label: "전체" },
            { key: "kr", label: "국내" },
            { key: "us", label: "해외" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatsMarketTab(tab.key as "all" | "kr" | "us")}
              style={{
                padding: "10px 0",
                borderRadius: 10,
                border: `1px solid ${statsMarketTab === tab.key ? COLORS.hero : COLORS.line}`,
                background: statsMarketTab === tab.key ? COLORS.hero : COLORS.sub,
                color: statsMarketTab === tab.key ? "#fff" : COLORS.dim,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>}
      {statsMarketTab !== "kr" && overseasSummary?.configured && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8", letterSpacing: "0.05em", textTransform: "uppercase" }}>해외 익스포저</span>
              <span style={{ fontSize: 11, color: COLORS.dim }}>{overseasSummary.connected ? "실잔고 기준" : "연결 확인 중"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {[
                { label: "포지션", value: `${overseasSummary.summary?.positionCount ?? 0}개` },
                { label: "평가금액", value: `USD ${(overseasSummary.summary?.totalUsd ?? 0).toFixed(2)}` },
                { label: "ETF", value: `${overseasSummary.holdings.filter((holding) => holding.kind === "etf").length}개` },
              ].map((item) => (
                <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                  <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#1D4ED8" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(holdingNewsAlertStats || holdingNewsAlertLogs.length > 0) && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 점검 전송</span>
              <span style={{ fontSize: 11, color: COLORS.dim }}>수동 점검 기준</span>
            </div>

            {holdingNewsAlertStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginBottom: holdingNewsAlertLogs.length > 0 ? 10 : 0 }}>
                {[
                  { label: "전송", value: holdingNewsAlertStats.sentCount },
                  { label: "종목수", value: holdingNewsAlertStats.sentStockCount },
                  { label: "메모전송", value: holdingNewsAlertStats.noteWarningSentCount },
                  { label: "메모경고", value: holdingNewsAlertStats.noteWarningItemCount },
                  { label: "실패", value: holdingNewsAlertStats.failedCount },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertLogs.length > 0 && (
              <div style={{ borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                {holdingNewsAlertLogs.map((log, index) => (
                  <div
                    key={`${log.run_at}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertLogs.length - 1 ? "none" : `1px solid `,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>
                          {log.success ? `${log.count}개 종목 전송` : "전송 실패"}
                        </span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 5px",
                          borderRadius: 4,
                          background: log.success ? "#FFF7ED" : "#FEF2F2",
                          color: log.success ? "#C2410C" : "#B91C1C",
                          border: `1px solid ${log.success ? "#FED7AA" : "#FECACA"}`,
                        }}>
                          {log.success ? "SENT" : "FAILED"}
                        </span>
                      </div>
                      {log.success && log.noteWarningCount > 0 && (
                        <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>
                          메모경고 {log.noteWarningCount}개
                          {log.noteWarningNotes.length > 0 ? ` · ${log.noteWarningNotes.join(", ")}` : ""}
                        </div>
                      )}
                      {log.error && (
                        <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>{log.error}</div>
                      )}
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>
                      {new Date(log.run_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertDailyStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  일자별 뉴스 점검 전송
                </div>
                {holdingNewsAlertDailyStats.map((item, index) => (
                  <div
                    key={`${item.day}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertDailyStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.day}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        전송 {item.sentCount}회 · 종목수 {item.stockCount}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        메모경고 {item.noteWarningCount}개 · 실패 {item.failedCount}회
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.noteWarningCount}</div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>메모경고</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertNoteStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  메모경고 태그 누적 랭킹
                </div>
                {holdingNewsAlertNoteStats.map((item, index) => (
                  <div
                    key={`${item.note}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertNoteStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        전송 {item.sentCount}회 · 최근 {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.warningCount}</div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>누적 경고</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertNoteFlowCrossStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  메모경고 태그별 직접 주문 흐름 교차
                </div>
                {holdingNewsAlertNoteFlowCrossStats.map((item, index) => (
                  <div
                    key={`${item.note}-flow-cross-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertNoteFlowCrossStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        경고 {item.warningCount}회 · 전송 {item.sentCount}회 · 주문 {item.tradeCount}회
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        완결도 {item.completionRate > 0 ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                        {item.residualExposure > 0 ? ` · 잔류 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: item.netFlow >= 0 ? "#C2410C" : COLORS.fall }}>
                        {item.netFlow >= 0 ? "+" : ""}{Math.round(item.netFlow).toLocaleString("ko-KR")}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                        매수 {Math.round(item.buyAmount).toLocaleString("ko-KR")} / 매도 {Math.round(item.sellAmount).toLocaleString("ko-KR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertNotePositionStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  메모경고 태그별 포지션 성과
                </div>
                {holdingNewsAlertNotePositionStats.map((item, index) => (
                  <div
                    key={`${item.note}-position-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertNotePositionStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        연결 태그 {SURGE_ENTRY_TAG_LABELS[item.entryTag || "unknown"] || "미분류"} · 거래 {item.tradeCount}건
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        승률 {item.winRate.toFixed(0)}% · 손절률 {item.stopLossRate.toFixed(0)}%
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: item.avgPnl >= 0 ? "#C2410C" : COLORS.fall }}>
                        {item.avgPnl >= 0 ? "+" : ""}{Math.round(item.avgPnl).toLocaleString("ko-KR")}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>평균 손익</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertNoteStockStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  메모경고 태그별 최근 종목 랭킹
                </div>
                {holdingNewsAlertNoteStockStats.map((item, index) => (
                  <div
                    key={`${item.note}-${item.stock}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertNoteStockStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                        <span style={{ fontSize: 10, color: COLORS.dim }}>{item.stock}</span>
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        최근 {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.count}</div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>반복 전송</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertStockStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  메모경고 종목별 누적 랭킹
                </div>
                {holdingNewsAlertStockStats.map((item, index) => (
                  <div
                    key={`${item.stock}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertStockStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stock}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>
                        {item.notes.join(", ")}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        최근 {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.count}</div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>누적 경고</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertDirectOrderCrossStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  메모경고 많은 날 직접 주문 메모 흐름
                </div>
                {holdingNewsAlertDirectOrderCrossStats.map((item, index) => (
                  <div
                    key={`${item.day}-${index}`}
                    style={{
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertDirectOrderCrossStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.day}</div>
                        <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                          메모경고 {item.noteWarningCount}개 · 전송 {item.sentCount}회
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.topNotes.length}</div>
                        <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>주문메모</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                      {item.topNotes.map((noteItem, noteIndex) => (
                        <div key={`${item.day}-${noteItem.note}-${noteIndex}`} style={{ fontSize: 11, color: COLORS.dim }}>
                          {noteItem.note} · {noteItem.tradeCount}회 · {noteItem.netFlow >= 0 ? "+" : ""}{Math.round(noteItem.netFlow).toLocaleString("ko-KR")}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {holdingNewsAlertDirectOrderTimeStats.length > 0 && (
              <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                  메모경고 많은 날 시간대별 직접 주문
                </div>
                {holdingNewsAlertDirectOrderTimeStats.map((item, index) => (
                  <div
                    key={`${item.day}-time-${index}`}
                    style={{
                      padding: "10px 12px",
                      borderBottom: index === holdingNewsAlertDirectOrderTimeStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.day}</div>
                        <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                          메모경고 {item.noteWarningCount}개
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.topBuckets.length}</div>
                        <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>시간대</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                      {item.topBuckets.map((bucket, bucketIndex) => (
                        <div key={`${item.day}-${bucket.timeBucket}-${bucketIndex}`} style={{ fontSize: 11, color: COLORS.dim }}>
                          {bucket.timeBucket} · {bucket.tradeCount}회 · {bucket.netFlow >= 0 ? "+" : ""}{Math.round(bucket.netFlow).toLocaleString("ko-KR")}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(directOrderStats || directOrderLogs.length > 0) && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, letterSpacing: "0.05em", textTransform: "uppercase" }}>직접 주문 운영</span>
              <span style={{ fontSize: 11, color: COLORS.dim }}>최근 체결 기준</span>
            </div>

            {directOrderStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: directOrderLogs.length > 0 ? 10 : 0 }}>
                {[
                  { label: "국내 매수", value: directOrderStats.krBuyCount, color: COLORS.rise },
                  { label: "국내 매도", value: directOrderStats.krSellCount, color: "#1D4ED8" },
                  { label: "미국 매수", value: directOrderStats.usBuyCount, color: COLORS.rise },
                  { label: "미국 매도", value: directOrderStats.usSellCount, color: "#1D4ED8" },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {directOrderLogs.length > 0 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.2fr", gap: 8, marginBottom: 10 }}>
                  <input
                    value={directOrderSearch}
                    onChange={(e) => setDirectOrderSearch(e.target.value)}
                    placeholder="종목 검색"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#FFF", color: COLORS.ink, outline: "none", boxSizing: "border-box" }}
                  />
                  <select
                    value={directOrderMarketFilter}
                    onChange={(e) => setDirectOrderMarketFilter(e.target.value as "all" | "kr" | "us")}
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#FFF", color: COLORS.ink, outline: "none" }}
                  >
                    <option value="all">전체 시장</option>
                    <option value="kr">국내</option>
                    <option value="us">미국</option>
                  </select>
                  <select
                    value={directOrderSideFilter}
                    onChange={(e) => setDirectOrderSideFilter(e.target.value as "all" | "buy" | "sell")}
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#FFF", color: COLORS.ink, outline: "none" }}
                  >
                    <option value="all">전체 방향</option>
                    <option value="buy">매수</option>
                    <option value="sell">매도</option>
                  </select>
                  <select
                    value={directOrderDatePreset}
                    onChange={(e) => setDirectOrderDatePreset(e.target.value as "1d" | "7d" | "30d" | "all")}
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#FFF", color: COLORS.ink, outline: "none" }}
                  >
                    <option value="1d">최근 1일</option>
                    <option value="7d">최근 7일</option>
                    <option value="30d">최근 30일</option>
                    <option value="all">전체</option>
                  </select>
                  <input
                    value={directOrderNoteFilter}
                    onChange={(e) => setDirectOrderNoteFilter(e.target.value)}
                    placeholder="메모 검색"
                    list="direct-order-note-templates"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#FFF", color: COLORS.ink, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <datalist id="direct-order-note-templates">
                  {directOrderNoteTemplates.map((template) => (
                    <option key={template} value={template} />
                  ))}
                </datalist>

                <div style={{ borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                {filteredDirectOrderLogs.map((log, index) => (
                  <div
                    key={`${log.stock_code}-${log.run_at}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: index === directOrderLogs.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{log.stock_name || log.stock_code}</span>
                        {log.stock_name && <span style={{ fontSize: 10, color: COLORS.dim }}>{log.stock_code}</span>}
                        <span style={{ fontSize: 10, color: COLORS.dim }}>{log.market.toUpperCase()}</span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 5px",
                          borderRadius: 4,
                          background: log.side === "buy" ? "#F0FDF4" : "#EFF6FF",
                          color: log.side === "buy" ? "#15803D" : "#1D4ED8",
                          border: `1px solid ${log.side === "buy" ? "#BBF7D0" : "#BFDBFE"}`,
                        }}>
                          {log.side === "buy" ? "BUY" : "SELL"}
                        </span>
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        {log.qty}주 · {log.currency === "USD" ? `$${log.price.toFixed(2)}` : `${Math.round(log.price).toLocaleString("ko-KR")}원`}
                      </div>
                      {log.note && (
                        <div style={{ marginTop: 4, fontSize: 11, color: COLORS.mid, wordBreak: "break-word" }}>
                          메모 · {log.note}
                        </div>
                      )}
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>
                      {new Date(log.run_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
                {filteredDirectOrderLogs.length === 0 && (
                  <div style={{ padding: "14px 12px", fontSize: 12, color: COLORS.dim, textAlign: "center" }}>
                    조건에 맞는 직접 주문 체결이 없습니다.
                  </div>
                )}
                </div>

                {groupedDirectOrderRanking.length > 0 && (
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                    {groupedDirectOrderRanking.map((group) => (
                      <div key={group.market} style={{ borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                          {group.label}
                        </div>
                        {group.rows.map((item, index) => (
                          <div
                            key={`${item.market}:${item.stockCode}:${index}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "10px 12px",
                              borderBottom: index === group.rows.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stockName || item.stockCode}</span>
                                {item.stockName && item.stockName !== item.stockCode && <span style={{ fontSize: 10, color: COLORS.dim }}>{item.stockCode}</span>}
                                <span style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: "2px 5px",
                                  borderRadius: 4,
                                  background: item.lastSide === "buy" ? "#F0FDF4" : "#EFF6FF",
                                  color: item.lastSide === "buy" ? "#15803D" : "#1D4ED8",
                                  border: `1px solid ${item.lastSide === "buy" ? "#BBF7D0" : "#BFDBFE"}`,
                                }}>
                                  최근 {item.lastSide === "buy" ? "매수" : "매도"}
                                </span>
                              </div>
                              <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                                매수 {item.buyCount} · 매도 {item.sellCount} · 총 {item.totalQty}주
                              </div>
                              <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                                평균 체결가 {item.priceSamples > 0 ? item.market === "us" ? `$${(item.totalPrice / item.priceSamples).toFixed(2)}` : `${Math.round(item.totalPrice / item.priceSamples).toLocaleString("ko-KR")}원` : "—"}
                              </div>
                              {item.recentLogs.length > 0 && (
                                <div style={{ marginTop: 5, display: "grid", gap: 3 }}>
                                  {item.recentLogs.map((log, logIndex) => (
                                    <div key={`${item.stockCode}-${log.runAt}-${logIndex}`} style={{ fontSize: 10, color: COLORS.dim }}>
                                      {log.side === "buy" ? "매수" : "매도"} {log.qty}주 · {log.currency === "USD" ? `$${log.price.toFixed(2)}` : `${Math.round(log.price).toLocaleString("ko-KR")}원`} · {new Date(log.runAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                      {log.note ? ` · 메모 ${log.note}` : ""}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink }}>{item.tradeCount}회</div>
                              <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                                {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {directOrderNoteRanking.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 직접 주문 랭킹
                    </div>
                    {directOrderNoteRanking.map((item, index) => (
                      <div
                        key={`${item.note}-${index}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 12px",
                          borderBottom: index === directOrderNoteRanking.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                            <span style={{ fontSize: 10, color: COLORS.dim }}>{item.markets.map((market) => market.toUpperCase()).join(" · ")}</span>
                          </div>
                          <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                            매수 {item.buyCount} · 매도 {item.sellCount}
                          </div>
                          {item.recentStocks.length > 0 && (
                            <div style={{ marginTop: 5, display: "grid", gap: 3 }}>
                              {item.recentStocks.map((stock, stockIndex) => (
                                <div key={`${item.note}-${stock.stockCode}-${stock.runAt}-${stockIndex}`} style={{ fontSize: 10, color: COLORS.dim }}>
                                  {stock.stockCode} · {stock.side === "buy" ? "매수" : "매도"} · {new Date(stock.runAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink }}>{item.tradeCount}회</div>
                          <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                            {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {directOrderNoteRecentTrades.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 최근 5거래
                    </div>
                    {directOrderNoteRecentTrades.map((item, index) => (
                      <div
                        key={`${item.note}-recent-${index}`}
                        style={{
                          padding: "10px 12px",
                          borderBottom: index === directOrderNoteRecentTrades.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                          <span style={{ fontSize: 10, color: COLORS.dim }}>
                            {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                          {item.trades.map((trade, tradeIndex) => (
                            <div key={`${item.note}-${trade.stockCode}-${trade.runAt}-${tradeIndex}`} style={{ fontSize: 10, color: COLORS.dim }}>
                              {trade.stockCode} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주 · {trade.currency === "USD" ? `$${trade.price.toFixed(2)}` : `${Math.round(trade.price).toLocaleString("ko-KR")}원`} · {new Date(trade.runAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {directOrderNoteFlow.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 주문 흐름 회고
                    </div>
                    {directOrderNoteFlow.map((item, index) => {
                      const isPositive = item.netFlow >= 0;
                      return (
                        <div
                          key={`${item.note}-flow-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderBottom: index === directOrderNoteFlow.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                            <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                              매수 {item.buyTrades}회 / 매도 {item.sellTrades}회
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                              매수금액 {Math.round(item.buyAmount).toLocaleString("ko-KR")} / 매도금액 {Math.round(item.sellAmount).toLocaleString("ko-KR")}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                              완결도 {item.completionRate > 0 ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                              {item.residualExposure > 0 ? ` · 잔류노출 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: isPositive ? COLORS.rise : COLORS.fall }}>
                              {isPositive ? "+" : ""}{Math.round(item.netFlow).toLocaleString("ko-KR")}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                              회수율 {item.sellToBuyRatio > 0 ? `${(item.sellToBuyRatio * 100).toFixed(0)}%` : "—"}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                              평균 체결 {Math.round(item.avgTicket).toLocaleString("ko-KR")}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ padding: "8px 12px", fontSize: 10, color: COLORS.dim, background: "#FCFCFD", borderTop: `1px solid ${COLORS.line}` }}>
                      실제 포지션 손익이 아니라 직접 주문 이벤트 기준 매수/매도 금액 흐름 회고입니다.
                    </div>
                  </div>
                )}

                {directOrderNotePositionStats.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 포지션 성과
                    </div>
                    {directOrderNotePositionStats.map((item, index) => (
                      <div
                        key={`${item.note}-position-${index}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 12px",
                          borderBottom: index === directOrderNotePositionStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                          <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                            {item.market ? `${item.market.toUpperCase()} · ` : ""}{item.tradeCount}건 · 승률 {item.winRate.toFixed(0)}%
                          </div>
                          <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                            손절률 {item.stopLossRate.toFixed(0)}% · 평균손익 {Math.round(item.avgPnl).toLocaleString("ko-KR")}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                            {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                            누적손익
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: "8px 12px", fontSize: 10, color: COLORS.dim, background: "#FCFCFD", borderTop: `1px solid ${COLORS.line}` }}>
                      직접 주문 메모가 포지션 entry_signal에 저장된 신규 체결부터 성과가 집계됩니다.
                    </div>
                  </div>
                )}

                {directOrderNoteAlerts.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid `, fontSize: 11, fontWeight: 700, color: "#C2410C" }}>
                      메모별 미완결 경고
                    </div>
                    {directOrderNoteAlerts.map((item, index) => (
                      <div
                        key={`${item.note}-alert-${index}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 12px",
                          borderBottom: index === directOrderNoteAlerts.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                          <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                            {item.totalTrades}회 · 완결도 {item.completionRate > 0 ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                          </div>
                        <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                          매수 {Math.round(item.buyAmount).toLocaleString("ko-KR")} / 매도 {Math.round(item.sellAmount).toLocaleString("ko-KR")}
                        </div>
                        {(directOrderNoteAlertRecentStocks.get(item.note) ?? []).length > 0 && (
                          <div style={{ marginTop: 5, display: "grid", gap: 2 }}>
                            {(directOrderNoteAlertRecentStocks.get(item.note) ?? []).map((trade, tradeIndex) => (
                              <div key={`${item.note}-${trade.stock_code}-${trade.run_at}-${tradeIndex}`} style={{ fontSize: 10, color: COLORS.dim }}>
                                {trade.stock_name || trade.stock_code}{trade.stock_name ? ` (${trade.stock_code})` : ""} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>
                            {item.residualExposure > 0 ? Math.round(item.residualExposure).toLocaleString("ko-KR") : "잔류 없음"}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                            잔류노출
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {directOrderNoteTimeStats.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 시간대 흐름
                    </div>
                    {directOrderNoteTimeStats.map((item, index) => {
                      const isPositive = item.netFlow >= 0;
                      return (
                        <div
                          key={`${item.note}-${item.timeBucket}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderBottom: index === directOrderNoteTimeStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                              <span style={{ fontSize: 10, color: COLORS.dim }}>{item.timeBucket}</span>
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                              {item.tradeCount}회 · 매수 {Math.round(item.buyAmount).toLocaleString("ko-KR")} / 매도 {Math.round(item.sellAmount).toLocaleString("ko-KR")}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: isPositive ? COLORS.rise : COLORS.fall }}>
                              {isPositive ? "+" : ""}{Math.round(item.netFlow).toLocaleString("ko-KR")}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                              회수율 {item.sellToBuyRatio > 0 ? `${(item.sellToBuyRatio * 100).toFixed(0)}%` : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {directOrderNoteMarketStats.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 시장 흐름
                    </div>
                    {directOrderNoteMarketStats.map((item, index) => {
                      const isPositive = item.netFlow >= 0;
                      return (
                        <div
                          key={`${item.note}-${item.market}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderBottom: index === directOrderNoteMarketStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                              <span style={{ fontSize: 10, color: COLORS.dim }}>{item.market.toUpperCase()}</span>
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                              {item.tradeCount}회 · 매수 {Math.round(item.buyAmount).toLocaleString("ko-KR")} / 매도 {Math.round(item.sellAmount).toLocaleString("ko-KR")}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: isPositive ? COLORS.rise : COLORS.fall }}>
                              {isPositive ? "+" : ""}{Math.round(item.netFlow).toLocaleString("ko-KR")}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                              회수율 {item.sellToBuyRatio > 0 ? `${(item.sellToBuyRatio * 100).toFixed(0)}%` : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {directOrderNoteWeekdayStats.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 요일 흐름
                    </div>
                    {directOrderNoteWeekdayStats.map((item, index) => {
                      const isPositive = item.netFlow >= 0;
                      return (
                        <div
                          key={`${item.note}-${item.weekday}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderBottom: index === directOrderNoteWeekdayStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                              <span style={{ fontSize: 10, color: COLORS.dim }}>{item.weekday}</span>
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                              {item.tradeCount}회 · 매수 {Math.round(item.buyAmount).toLocaleString("ko-KR")} / 매도 {Math.round(item.sellAmount).toLocaleString("ko-KR")}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: isPositive ? COLORS.rise : COLORS.fall }}>
                              {isPositive ? "+" : ""}{Math.round(item.netFlow).toLocaleString("ko-KR")}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                              회수율 {item.sellToBuyRatio > 0 ? `${(item.sellToBuyRatio * 100).toFixed(0)}%` : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {directOrderNoteMonthlyStats.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: COLORS.dim }}>
                      메모별 월별 추세
                    </div>
                    {directOrderNoteMonthlyStats.map((item, index) => {
                      const isPositive = item.netFlow >= 0;
                      return (
                        <div
                          key={`${item.note}-${item.month}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderBottom: index === directOrderNoteMonthlyStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                              <span style={{ fontSize: 10, color: COLORS.dim }}>{item.month}</span>
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                              {item.tradeCount}회 · 매수 {Math.round(item.buyAmount).toLocaleString("ko-KR")} / 매도 {Math.round(item.sellAmount).toLocaleString("ko-KR")}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: isPositive ? COLORS.rise : COLORS.fall }}>
                              {isPositive ? "+" : ""}{Math.round(item.netFlow).toLocaleString("ko-KR")}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                              회수율 {item.sellToBuyRatio > 0 ? `${(item.sellToBuyRatio * 100).toFixed(0)}%` : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 기간 선택 ── */}
      <div style={{ padding: "16px 20px 12px", display: "flex", gap: 6 }}>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: period === p.id ? 700 : 500, fontFamily: "inherit",
              background: period === p.id ? COLORS.hero : COLORS.sub,
              color: period === p.id ? "#fff" : COLORS.dim,
            }}
          >{p.label}</button>
        ))}
      </div>

      {/* engine_runs 기반 데이터 안내 */}
      {stats.dataSource === "engine_runs" && (
        <div style={{ margin: "0 16px 8px", padding: "8px 12px", borderRadius: 8, background: "#FFF8E7", border: "1px solid #F6CC6B", fontSize: 11, color: "#92670A" }}>
          ※ 포지션 DB 미적재 — 엔진 실행 로그 기반 집계 (수익률% 기준, 손익액 제외)
        </div>
      )}

      {/* ── 요약 카드 4개 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 16px 16px" }}>
        {[
          { label: "승률", value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.winCount}승 ${stats.lossCount}패`, color: stats.winRate >= 50 ? COLORS.rise : COLORS.fall },
          { label: "평균 수익률", value: `${stats.avgReturn >= 0 ? "+" : ""}${stats.avgReturn.toFixed(2)}%`, sub: `${stats.closedTrades}건 청산`, color: stats.avgReturn >= 0 ? COLORS.rise : COLORS.fall },
          { label: "총 손익", value: stats.dataSource === "engine_runs" ? "—" : `${stats.totalPnl >= 0 ? "+" : ""}${Math.round(stats.totalPnl).toLocaleString("ko-KR")}원`, sub: stats.dataSource === "engine_runs" ? "원화 미산출" : `PF ${stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}`, color: stats.dataSource === "engine_runs" ? COLORS.dim : stats.totalPnl >= 0 ? COLORS.rise : COLORS.fall },
          { label: "최대 낙폭", value: `${stats.maxDrawdown.toFixed(1)}%`, sub: `평균 ${stats.avgHoldDays.toFixed(0)}일 보유`, color: stats.maxDrawdown > 10 ? COLORS.fall : COLORS.dim },
        ].map((card, i) => (
          <div key={i} style={{
            background: COLORS.sub, borderRadius: 12, padding: "14px 16px",
            border: `1px solid ${COLORS.line}`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <PortfolioChart />

      <div style={{ height: 1, background: COLORS.line }} />

      {/* ── 지표 적중률 ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>지표별 적중률</span>
        {!stats.indicatorAccuracy.some((ind) => ind.totalUsed > 0) && (
          <span style={{ fontSize: 10, color: COLORS.dim }}>매수 포지션 누적 후 표시</span>
        )}
      </div>
      <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {stats.indicatorAccuracy.map((ind) => (
          <div key={ind.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid, width: 52, flexShrink: 0 }}>{ind.name}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLORS.sub, overflow: "hidden" }}>
              <div style={{
                width: `${Math.min(ind.accuracy, 100)}%`, height: "100%", borderRadius: 4,
                background: ind.accuracy >= 60 ? COLORS.rise : ind.accuracy >= 40 ? "#F59E0B" : COLORS.fall,
                transition: "width 0.5s ease",
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.mid, width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {ind.totalUsed > 0 ? `${ind.accuracy.toFixed(0)}%` : "—"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* ── 청산 사유별 분석 ── */}
      {stats.exitReasonBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>청산 사유</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {stats.exitReasonBreakdown.map((er) => (
              <div key={er.reason} style={{
                padding: "10px 14px", borderRadius: 10,
                background: COLORS.sub, border: `1px solid ${COLORS.line}`,
                flex: "1 1 auto", minWidth: 100,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{EXIT_LABELS[er.reason] || er.reason}</span>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.ink }}>{er.count}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: er.avgPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                    평균 {er.avgPnl >= 0 ? "+" : ""}{Math.round(er.avgPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {/* ── 전략별 성과 ── */}
      {stats.strategyBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>전략별 성과</span>
          </div>
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.7fr 1fr", background: COLORS.sub, padding: "10px 14px" }}>
                {["전략", "거래", "승률", "손익"].map((h) => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                ))}
              </div>
              {stats.strategyBreakdown.map((item) => (
                <div key={item.strategyKey} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.7fr 1fr", padding: "10px 14px", borderTop: `1px solid ${COLORS.line}`, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{STRATEGY_LABELS[item.strategyKey] || item.strategyKey}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.trades}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeTradeCount > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 전용 성과</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
            {[
              { label: "급등주 거래", value: `${surgeTradeCount}건`, sub: `${surgeWinCount}승`, color: COLORS.ink },
              { label: "급등주 승률", value: `${surgeWinRate.toFixed(1)}%`, sub: "surge_momentum", color: surgeWinRate >= 50 ? COLORS.rise : COLORS.fall },
              { label: "급등주 손익", value: `${surgeTotalPnl >= 0 ? "+" : ""}${Math.round(surgeTotalPnl).toLocaleString("ko-KR")}원`, sub: "실현 손익", color: surgeTotalPnl >= 0 ? COLORS.rise : COLORS.fall },
              { label: "급등주 평균", value: `${surgeAvgReturn >= 0 ? "+" : ""}${surgeAvgReturn.toFixed(2)}%`, sub: "평균 수익률", color: surgeAvgReturn >= 0 ? COLORS.rise : COLORS.fall },
            ].map((card) => (
              <div key={card.label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeEntryBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 진입 타입</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeEntryBreakdown.map((item) => (
              <div key={item.entryTag} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 110 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{SURGE_ENTRY_TAG_LABELS[item.entryTag] || item.entryTag}</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#C2410C" }}>{item.count}건</span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                    승률 {item.winRate.toFixed(0)}%
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeNewsKeywordStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 뉴스 키워드 성과</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["키워드", "거래", "승률", "손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeNewsKeywordStats.map((item, index) => (
                <div key={`${item.keyword}-${index}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.keyword}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
              새로 누적되는 급등주 진입부터 뉴스 키워드가 저장되어 반영됩니다.
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeNewsKeywordDetailStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 키워드 보유/부분청산</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.9fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["키워드", "거래", "보유일", "부분청산"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeNewsKeywordDetailStats.map((item, index) => (
                <div key={`${item.keyword}-detail-${index}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.9fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.keyword}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.avgHoldDays.toFixed(1)}일</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.partialExitRate >= 50 ? COLORS.rise : COLORS.fall, textAlign: "right" }}>
                    {item.partialExitRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeNewsKeywordReentryStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 키워드 재진입 성공률</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.9fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["키워드", "거래", "재진입", "성공률"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeNewsKeywordReentryStats.map((item, index) => (
                <div key={`${item.keyword}-reentry-${index}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.9fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.keyword}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.reentryRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.profitableReentryRate >= 50 ? COLORS.rise : COLORS.fall, textAlign: "right" }}>
                    {item.profitableReentryRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeNewsKeywordStopLossStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 키워드 손절률</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["키워드", "거래", "손절률"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeNewsKeywordStopLossStats.map((item, index) => (
                <div key={`${item.keyword}-stoploss-${index}`} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.keyword}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.stopLossRate >= 40 ? COLORS.fall : COLORS.ink, textAlign: "right" }}>
                    {item.stopLossRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeBlockedKeywordImpactStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>차단 키워드 실제 성과</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.7fr 0.7fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["키워드", "차단", "거래", "승률", "손절", "손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeBlockedKeywordImpactStats.map((item, index) => (
                <div key={`${item.keyword}-blocked-impact-${index}`} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.7fr 0.7fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.keyword}</div>
                    <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                      쿨다운 {item.cooldownCount} · 리스크 {item.riskCount} · 승인 {item.approvedCount}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>{item.blockedCount}회</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.tradeCount}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.stopLossRate >= 40 ? COLORS.fall : COLORS.ink }}>{item.stopLossRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.tradeCount > 0 ? `${item.totalPnl >= 0 ? "+" : ""}${Math.round(item.totalPnl).toLocaleString("ko-KR")}원` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
              최근 뉴스 차단 키워드와 실제 체결된 급등주 키워드 성과를 같은 화면에서 비교합니다.
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeBlockedStockImpactStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>차단 종목 후속 성과</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.6fr 0.6fr 0.7fr 0.7fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["종목", "차단", "거래", "승률", "손절", "손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeBlockedStockImpactStats.map((item, index) => (
                <div key={`${item.stockCode}-blocked-stock-${index}`} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.6fr 0.6fr 0.7fr 0.7fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stockName}</div>
                    <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                      {item.stockCode} · 쿨다운 {item.cooldownCount} · 리스크 {item.riskCount} · 승인 {item.approvedCount}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                      후속 {item.followUpTradeCount}건 · 지연 {item.nextEntryDelayHours === null ? "—" : `${item.nextEntryDelayHours.toFixed(1)}h`} · 후속승률 {item.followUpTradeCount > 0 ? `${item.followUpWinRate.toFixed(0)}%` : "—"}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>{item.blockedCount}회</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.tradeCount}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.stopLossRate >= 40 ? COLORS.fall : COLORS.ink }}>{item.stopLossRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.tradeCount > 0 && item.totalPnl >= 0 ? COLORS.rise : item.tradeCount > 0 ? COLORS.fall : COLORS.dim, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.tradeCount > 0 ? `${item.totalPnl >= 0 ? "+" : ""}${Math.round(item.totalPnl).toLocaleString("ko-KR")}원` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
              차단이 잦은 종목이 실제로도 손절 비중이 높은지, 아니면 과하게 막힌 종목인지 비교합니다.
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeBlockedStockImpactStats.some((item) => item.followUpTradeCount > 0) && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>차단 후 후속 진입</span>
          </div>
          {surgeBlockedFollowupSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 12px" }}>
              {[
                { label: "후속 진입 종목", value: `${surgeBlockedFollowupSummary.followupStockCount}/${surgeBlockedFollowupSummary.totalBlockedStocks}`, sub: `${surgeBlockedFollowupSummary.followupStockRate.toFixed(0)}% 재진입`, color: COLORS.ink },
                { label: "후속 거래 수", value: `${surgeBlockedFollowupSummary.followupTradeCount}건`, sub: `평균 ${surgeBlockedFollowupSummary.avgDelayHours.toFixed(1)}h`, color: COLORS.ink },
                { label: "후속 승률", value: `${surgeBlockedFollowupSummary.followupWinRate.toFixed(1)}%`, sub: `손절 ${surgeBlockedFollowupSummary.followupStopLossRate.toFixed(0)}%`, color: surgeBlockedFollowupSummary.followupWinRate >= 50 ? COLORS.rise : COLORS.fall },
                { label: "후속 손익", value: `${surgeBlockedFollowupSummary.followupTotalPnl >= 0 ? "+" : ""}${Math.round(surgeBlockedFollowupSummary.followupTotalPnl).toLocaleString("ko-KR")}원`, sub: "차단 후 재진입 성과", color: surgeBlockedFollowupSummary.followupTotalPnl >= 0 ? COLORS.rise : COLORS.fall },
              ].map((card) => (
                <div key={card.label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.8fr 0.8fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["종목", "후속진입", "평균지연", "후속승률", "후속손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeBlockedStockImpactStats
                .filter((item) => item.followUpTradeCount > 0)
                .sort((a, b) => b.followUpTradeCount - a.followUpTradeCount || (b.followUpTotalPnl - a.followUpTotalPnl))
                .map((item, index) => (
                  <div key={`${item.stockCode}-followup-${index}`} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.8fr 0.8fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stockName}</div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>{item.stockCode}</div>
                    </div>
                    <span style={{ fontSize: 12, color: COLORS.mid }}>{item.followUpTradeCount}건</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.nextEntryDelayHours === null ? "—" : `${item.nextEntryDelayHours.toFixed(1)}h`}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.followUpWinRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.followUpWinRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.followUpTotalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {item.followUpTotalPnl >= 0 ? "+" : ""}{Math.round(item.followUpTotalPnl).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
              마지막 뉴스 차단 이후 실제로 다시 진입한 종목만 따로 분리합니다.
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeBlockedFollowupExitBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>후속 진입 청산 사유</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["청산", "거래", "승률", "평균손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeBlockedFollowupExitBreakdown.map((item, index) => (
                <div key={`${item.reason}-followup-exit-${index}`} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{EXIT_LABELS[item.reason] || item.reason}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.avgPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.avgPnl >= 0 ? "+" : ""}{Math.round(item.avgPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
              뉴스 차단 뒤 다시 들어간 거래가 어떤 청산 방식으로 끝났는지 분해합니다.
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeLearningPenaltyStats.tradeCount > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>학습 패널티 적용 거래</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 12px" }}>
            {[
              { label: "패널티 거래", value: `${surgeLearningPenaltyStats.tradeCount}건`, sub: "학습 감점 적용", color: COLORS.ink },
              { label: "패널티 승률", value: `${surgeLearningPenaltyStats.winRate.toFixed(1)}%`, sub: `손절 ${surgeLearningPenaltyStats.stopLossRate.toFixed(0)}%`, color: surgeLearningPenaltyStats.winRate >= 50 ? COLORS.rise : COLORS.fall },
              { label: "패널티 손익", value: `${surgeLearningPenaltyStats.totalPnl >= 0 ? "+" : ""}${Math.round(surgeLearningPenaltyStats.totalPnl).toLocaleString("ko-KR")}원`, sub: "급등주 기준", color: surgeLearningPenaltyStats.totalPnl >= 0 ? COLORS.rise : COLORS.fall },
              { label: "주요 패널티", value: surgeLearningPenaltyStats.bySource[0]?.source ?? "—", sub: surgeLearningPenaltyStats.bySource[0] ? `${surgeLearningPenaltyStats.bySource[0].count}건` : "데이터 없음", color: COLORS.ink },
            ].map((card) => (
              <div key={card.label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "0 16px 12px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr 0.8fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["구분", "거래", "승률", "손절", "평균손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {[
                { label: "패널티 적용", ...surgeLearningPenaltyComparison.penalized },
                { label: "패널티 미적용", ...surgeLearningPenaltyComparison.plain },
              ].map((item, index) => (
                <div key={item.label} style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr 0.8fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.tradeCount}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.stopLossRate >= 35 ? COLORS.fall : COLORS.ink }}>{item.stopLossRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.avgPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.avgPnl >= 0 ? "+" : ""}{Math.round(item.avgPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
              학습 감점이 실제로 손절률을 낮추고 평균 손익을 방어하는지 비교합니다.
            </div>
          </div>
          {surgeLearningPenaltyStats.bySource.length > 0 && (
            <div style={{ padding: "0 16px 16px" }}>
              <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                  {["패널티", "거래", "승률", "손익"].map((header) => (
                    <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {header}
                    </span>
                  ))}
                </div>
                {surgeLearningPenaltyStats.bySource.map((item, index) => (
                  <div key={`${item.source}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.source}</span>
                    <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {surgeLearningPenaltyStrengthStats.length > 0 && (
            <div style={{ padding: "0 16px 16px" }}>
              <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.8fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                  {["강도", "거래", "승률", "손절", "평균손익"].map((header) => (
                    <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {header}
                    </span>
                  ))}
                </div>
                {surgeLearningPenaltyStrengthStats.map((item, index) => (
                  <div key={`${item.bucket}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.8fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.bucket}</div>
                      <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>평균 감점 {item.avgPenalty.toFixed(1)}점</div>
                    </div>
                    <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.stopLossRate >= 35 ? COLORS.fall : COLORS.ink }}>{item.stopLossRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.avgPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {item.avgPnl >= 0 ? "+" : ""}{Math.round(item.avgPnl).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
                어느 강도부터 실제로 손절률 방어나 손익 차이가 나는지 봅니다.
              </div>
            </div>
          )}
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {(surgeLearningModeComparison.on.tradeCount > 0 || surgeLearningModeComparison.off.tradeCount > 0) && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>학습보정 ON/OFF 비교</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr 0.8fr 0.8fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["모드", "거래", "승률", "손절", "평균손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {[
                { label: "학습보정 ON", ...surgeLearningModeComparison.on },
                { label: "학습보정 OFF", ...surgeLearningModeComparison.off },
              ]
                .filter((item) => item.tradeCount > 0)
                .map((item, index) => (
                  <div key={item.label} style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr 0.8fr 0.8fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: COLORS.mid }}>{item.tradeCount}건</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.stopLossRate >= 35 ? COLORS.fall : COLORS.ink }}>{item.stopLossRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.avgPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {item.avgPnl >= 0 ? "+" : ""}{Math.round(item.avgPnl).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.dim }}>
              설정에서 학습 리스크 보정을 켜고 끈 거래의 실제 성과 차이를 비교합니다.
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeNewsKeywordTimeMatrix.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 키워드 시간대 성과</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              {surgeNewsKeywordTimeMatrix.map((row, index) => (
                <div key={`news-time-${row.key}`} style={{ padding: "12px 14px", borderTop: index === 0 ? "none" : `1px solid ` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#9A3412" }}>{row.label}</span>
                    <span style={{ fontSize: 10, color: COLORS.dim }}>{row.items.reduce((sum, item) => sum + item.tradeCount, 0)}건</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {row.items.map((item) => (
                      <div key={`${row.key}-${item.keyword}`} style={{ flex: "1 1 120px", minWidth: 120, borderRadius: 10, background: "#fff", border: `1px solid ${COLORS.line}`, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>{item.keyword}</div>
                        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                          {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                        </div>
                        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ fontSize: 10, color: COLORS.dim }}>{item.tradeCount}건</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeMonthlyByEntryTag.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 월별 진입 추세</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              {surgeMonthlyByEntryTag.map((row, index) => (
                <div key={row.month} style={{ padding: "12px 14px", borderTop: index === 0 ? "none" : `1px solid ` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#9A3412" }}>{row.month.slice(5)}월</span>
                    <span style={{ fontSize: 10, color: COLORS.dim }}>
                      {row.items.reduce((sum, item) => sum + item.count, 0)}건
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {row.items.map((item) => (
                      <div key={`${row.month}-${item.entryTag}`} style={{ flex: "1 1 110px", minWidth: 110, borderRadius: 10, background: "#fff", border: `1px solid ${COLORS.line}`, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>
                          {SURGE_ENTRY_TAG_LABELS[item.entryTag] || item.entryTag}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                          {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                        </div>
                        <div style={{ marginTop: 4, fontSize: 10, color: COLORS.dim }}>
                          {item.count}건
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeMonthlyWinRateByEntryTag.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 월별 승률 추이</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              {surgeMonthlyWinRateByEntryTag.map((row, index) => (
                <div key={`win-${row.month}`} style={{ padding: "12px 14px", borderTop: index === 0 ? "none" : `1px solid ` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#9A3412" }}>{row.month.slice(5)}월</span>
                    <span style={{ fontSize: 10, color: COLORS.dim }}>
                      {row.items.reduce((sum, item) => sum + item.count, 0)}건
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {row.items.map((item) => (
                      <div key={`${row.month}-win-${item.entryTag}`} style={{ flex: "1 1 110px", minWidth: 110, borderRadius: 10, background: "#fff", border: `1px solid ${COLORS.line}`, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>
                          {SURGE_ENTRY_TAG_LABELS[item.entryTag] || item.entryTag}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                          {item.winRate.toFixed(0)}%
                        </div>
                        <div style={{ marginTop: 4, fontSize: 10, color: COLORS.dim }}>
                          {item.count}건
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeReentryStockRanking.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 재진입 랭킹</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["종목", "횟수", "승률", "손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeReentryStockRanking.map((item) => (
                <div key={`reentry-${item.stockCode}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 1fr", padding: "10px 14px", borderTop: `1px solid `, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stockName}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: COLORS.dim }}>{item.stockCode}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C" }}>{item.count}회</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeReentryCountBuckets.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>재진입 횟수별 손익 분포</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeReentryCountBuckets.map((item) => (
              <div key={item.label} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 120 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{item.label}</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{item.stockCount}종목 · {item.tradeCount}회</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                    승률 {item.winRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeEarlyHoldStats.tradeCount > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>선캐치 보유시간</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
            {[
              { label: "평균 보유일", value: `${surgeEarlyHoldStats.avgHoldDays.toFixed(1)}일`, sub: `${surgeEarlyHoldStats.tradeCount}건`, color: COLORS.ink },
              { label: "선캐치 승률", value: `${surgeEarlyHoldStats.winRate.toFixed(1)}%`, sub: "초기 진입 청산", color: surgeEarlyHoldStats.winRate >= 50 ? COLORS.rise : COLORS.fall },
              { label: "평균 수익률", value: `${surgeEarlyHoldStats.avgReturn >= 0 ? "+" : ""}${surgeEarlyHoldStats.avgReturn.toFixed(2)}%`, sub: "첫 청산 기준", color: surgeEarlyHoldStats.avgReturn >= 0 ? COLORS.rise : COLORS.fall },
              { label: "재진입 전환율", value: `${surgeEarlyHoldStats.conversionRate.toFixed(1)}%`, sub: `${surgeEarlyHoldStats.convertedCount}종목 재진입`, color: surgeEarlyHoldStats.conversionRate >= 50 ? COLORS.rise : COLORS.fall },
            ].map((card) => (
              <div key={card.label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeFunnelStats.earlyCount > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>선캐치 전환 퍼널</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
            {[
              { label: "선캐치 종목", value: `${surgeFunnelStats.earlyCount}개`, sub: "초기 진입 종목", color: COLORS.ink },
              { label: "재진입 전환", value: `${surgeFunnelStats.reentryCount}개`, sub: `${surgeFunnelStats.reentryRate.toFixed(1)}% 전환`, color: surgeFunnelStats.reentryRate >= 50 ? COLORS.rise : COLORS.fall },
              { label: "재진입 수익", value: `${surgeFunnelStats.profitableReentryCount}개`, sub: `${surgeFunnelStats.profitableReentryRate.toFixed(1)}% 성공`, color: surgeFunnelStats.profitableReentryRate >= 50 ? COLORS.rise : COLORS.fall },
            ].map((card) => (
              <div key={card.label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeDailyPnl.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 일자별 손익</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1fr 0.8fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["일자", "거래", "손익", "승률"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeDailyPnl.map((item) => (
                <div key={`daily-${item.day}`} style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1fr 0.8fr", padding: "10px 14px", borderTop: `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{item.day}</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.count}건</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                    {item.winRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeTimeBucketStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>시간대별 급등주 성과</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeTimeBucketStats.map((item) => (
              <div key={item.key} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 120 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{item.label}</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{item.tradeCount}건</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                    승률 {item.winRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeTimeByEntryMatrix.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>시간대 × 진입타입 성과</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              {surgeTimeByEntryMatrix.map((row, index) => (
                <div key={`matrix-${row.key}`} style={{ padding: "12px 14px", borderTop: index === 0 ? "none" : `1px solid ` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#9A3412" }}>{row.label}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {row.items.map((item) => (
                      <div key={`${row.key}-${item.entryTag}`} style={{ flex: "1 1 120px", minWidth: 120, borderRadius: 10, background: "#fff", border: `1px solid ${COLORS.line}`, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>
                          {SURGE_ENTRY_TAG_LABELS[item.entryTag] || item.entryTag}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                          {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                        </div>
                        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 10, color: COLORS.dim }}>{item.tradeCount}건</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                            {item.winRate.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgePartialExitTimeStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>시간대별 부분청산 성공률</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgePartialExitTimeStats.map((item) => (
              <div key={`partial-time-${item.key}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 128 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{item.label}</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: item.successRate >= 50 ? COLORS.rise : COLORS.fall }}>
                    {item.successRate.toFixed(0)}%
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{item.partialCount}/{item.tradeCount}건</span>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>부분청산 {item.partialRate.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeWeekdayStats.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>요일별 급등주 성과</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeWeekdayStats.map((item) => (
              <div key={`weekday-${item.weekday}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 108 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{item.weekday}요일</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{item.tradeCount}건</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                    {item.winRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeMonthWeekdayHeatmap.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>월/요일/시간대 히트맵</span>
          </div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {surgeMonthWeekdayHeatmap.map((month) => (
              <div key={`heat-${month.month}`} style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
                <div style={{ padding: "10px 14px", background: "#F8FAFC", fontSize: 12, fontWeight: 700, color: "#9A3412" }}>
                  {month.month}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "0.6fr repeat(4, 1fr)", gap: 1, background: "#FED7AA" }}>
                  <div style={{ background: "#F8FAFC", padding: "8px 6px", fontSize: 10, fontWeight: 700, color: COLORS.dim }}>요일</div>
                  {SURGE_TIME_BUCKETS.map((bucket) => (
                    <div key={`${month.month}-${bucket.key}-head`} style={{ background: "#F8FAFC", padding: "8px 6px", fontSize: 10, fontWeight: 700, color: COLORS.dim, textAlign: "center" }}>
                      {bucket.label}
                    </div>
                  ))}
                  {month.rows.map((row) => (
                    <Fragment key={`${month.month}-${row.weekday}`}>
                      <div key={`${month.month}-${row.weekday}-label`} style={{ background: "#F8FAFC", padding: "10px 6px", fontSize: 10, fontWeight: 700, color: COLORS.dim }}>
                        {row.weekday}
                      </div>
                      {row.cells.map((cell) => (
                        <div
                          key={`${month.month}-${row.weekday}-${cell.timeLabel}`}
                          style={{
                            background: cell.count === 0 ? "#FFF7ED" : cell.totalPnl >= 0 ? "#ECFDF5" : "#FEF2F2",
                            padding: "8px 6px",
                            textAlign: "center",
                            minHeight: 52,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            gap: 2,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: cell.totalPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                            {cell.count}
                          </span>
                          <span style={{ fontSize: 9, color: COLORS.dim }}>
                            {cell.count > 0 ? `${Math.round(cell.totalPnl / 10000)}만` : "—"}
                          </span>
                        </div>
                      ))}
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgePartialExitByEntryTag.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>진입 타입별 부분청산 경험</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgePartialExitByEntryTag.map((item) => (
              <div key={`partial-${item.entryTag}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 120 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{SURGE_ENTRY_TAG_LABELS[item.entryTag] || item.entryTag}</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: item.partialExitRate >= 50 ? COLORS.rise : COLORS.ink }}>
                    {item.partialExitRate.toFixed(0)}%
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{item.partialExitCount}/{item.tradeCount}건</span>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>부분청산</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeAvgPnlByEntryTag.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>진입 타입별 평균 손익</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeAvgPnlByEntryTag.map((item) => (
              <div key={`avg-${item.entryTag}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 120 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{SURGE_ENTRY_TAG_LABELS[item.entryTag] || item.entryTag}</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: item.avgPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                    {item.avgPnl >= 0 ? "+" : ""}{Math.round(item.avgPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{item.tradeCount}건</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.avgReturn >= 0 ? COLORS.rise : COLORS.fall }}>
                    {item.avgReturn >= 0 ? "+" : ""}{item.avgReturn.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeTopStocksByEntryTag.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>진입 타입별 손익 상위 종목</span>
          </div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {surgeTopStocksByEntryTag.map((group) => (
              <div key={`top-${group.entryTag}`} style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
                <div style={{ padding: "10px 14px", background: "#F8FAFC", fontSize: 12, fontWeight: 700, color: "#9A3412" }}>
                  {SURGE_ENTRY_TAG_LABELS[group.entryTag] || group.entryTag}
                </div>
                {group.rows.map((item, index) => (
                  <div key={`${group.entryTag}-${item.stockCode}`} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 1fr", padding: "10px 14px", borderTop: index === 0 ? "none" : `1px solid `, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stockName}</div>
                      <div style={{ marginTop: 2, fontSize: 10, color: COLORS.dim }}>{item.stockCode}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                      {item.tradeCount}건
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeReentryDelayStats.stockCount > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>선캐치 후 재진입 시간</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
            {[
              { label: "평균 재진입 시간", value: `${surgeReentryDelayStats.avgDelayHours.toFixed(1)}시간`, sub: "선캐치 후 첫 재진입", color: COLORS.ink },
              { label: "측정 종목", value: `${surgeReentryDelayStats.stockCount}개`, sub: "선캐치→재진입 연결", color: COLORS.ink },
            ].map((card) => (
              <div key={card.label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeMonthlyReentryDelay.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>월별 평균 재진입 간격</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["월", "평균 간격", "종목 수"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeMonthlyReentryDelay.map((item) => (
                <div key={`monthly-delay-${item.month}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", padding: "10px 14px", borderTop: `1px solid `, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.month}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.avgDelayHours.toFixed(1)}시간</span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{item.stockCount}개</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeReentryDelayByStock.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>종목별 재진입 간격 상세</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["종목", "재진입 간격", "누적 손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeReentryDelayByStock.map((item) => (
                <div key={`delay-stock-${item.stockCode}`} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 1fr", padding: "10px 14px", borderTop: `1px solid `, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stockName}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: COLORS.dim }}>{item.stockCode}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.delayHours?.toFixed(1)}시간</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeReentryDelayBuckets.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>재진입 간격 분포</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeReentryDelayBuckets.map((item) => (
              <div key={`delay-${item.label}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 110 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{item.label}</span>
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: COLORS.ink }}>{item.count}개</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeStockTradeHistory.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>종목별 반복매매 히스토리</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: "#F8FAFC" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.7fr 1fr", padding: "10px 14px", background: "#F8FAFC" }}>
                {["종목", "횟수", "승률", "손익"].map((header) => (
                  <span key={header} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {header}
                  </span>
                ))}
              </div>
              {surgeStockTradeHistory.map((item) => (
                <div key={`history-${item.stockCode}`} style={{ padding: "10px 14px", borderTop: `1px solid ` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.7fr 1fr", alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stockName}</div>
                      <div style={{ marginTop: 2, fontSize: 10, color: COLORS.dim }}>
                        {item.stockCode} · {item.lastExitDate ? new Date(item.lastExitDate).toLocaleDateString("ko-KR") : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C" }}>{item.tradeCount}회</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{item.winRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {item.entryTags.map((entryTag) => (
                      <span key={`${item.stockCode}-${entryTag}`} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" }}>
                        {SURGE_ENTRY_TAG_LABELS[entryTag] || entryTag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeStockCycleTimeline.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>종목별 선캐치 재진입 타임라인</span>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {surgeStockCycleTimeline.map((item) => (
                <div key={`cycle-${item.stockCode}`} style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#F8FAFC", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{item.stockName}</div>
                      <div style={{ marginTop: 2, fontSize: 10, color: COLORS.dim }}>
                        {item.stockCode} · {item.lastExitDate ? new Date(item.lastExitDate).toLocaleDateString("ko-KR") : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: item.totalPnl >= 0 ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                      {item.totalPnl >= 0 ? "+" : ""}{Math.round(item.totalPnl).toLocaleString("ko-KR")}원
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" }}>
                      선캐치 {item.earlyCount}회
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>→</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}>
                      부분청산 {item.partialExitCount}회
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>→</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "#EFF6FF", color: "#1D4ED8", border: `1px solid ${COLORS.line}` }}>
                      재진입 {item.reentryCount}회
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeExitHoldBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>청산 사유별 보유시간</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeExitHoldBreakdown.map((item) => (
              <div key={`hold-${item.reason}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 120 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{EXIT_LABELS[item.reason] || item.reason}</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.ink }}>
                    {item.avgHoldDays.toFixed(1)}일
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{item.count}건</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.winRate >= 50 ? COLORS.rise : COLORS.fall }}>
                    승률 {item.winRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {surgeExitBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 청산 분해</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {surgeExitBreakdown.map((item) => (
              <div key={item.reason} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, flex: "1 1 auto", minWidth: 110 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{EXIT_LABELS[item.reason] || item.reason}</span>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#C2410C" }}>{item.count}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: item.avgPnl >= 0 ? COLORS.rise : COLORS.fall }}>
                    평균 {item.avgPnl >= 0 ? "+" : ""}{Math.round(item.avgPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {/* ── 월별 손익 ── */}
      {stats.monthlyBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>월별 손익</span>
          </div>
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: COLORS.sub, padding: "10px 14px" }}>
                {["월", "손익", "거래수", "승률"].map((h) => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                ))}
              </div>
              {stats.monthlyBreakdown.map((m) => (
                <div key={m.month} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "10px 14px", borderTop: `1px solid ${COLORS.line}` }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.ink }}>{m.month.slice(5)}월</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: m.pnl >= 0 ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                    {m.pnl >= 0 ? "+" : ""}{(m.pnl / 10000).toFixed(0)}만
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{m.trades}건</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: m.winRate >= 50 ? COLORS.rise : COLORS.fall }}>{m.winRate.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {/* ── 오픈 포지션 ── */}
      {open.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>보유 포지션 ({open.length})</span>
          </div>
          {open.map((p) => (
            <div key={p.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{p.stock_name || p.stock_code}</span>
                    {((p.entry_signal as { directOrderNote?: string | null } | null)?.directOrderNote ?? "").trim() && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "#EFF6FF",
                        color: "#1D4ED8",
                        border: `1px solid ${COLORS.line}`,
                      }}>
                        {String((p.entry_signal as { directOrderNote?: string | null } | null)?.directOrderNote)}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{p.stock_code} · {p.signal_strength === "strong" ? "강한 신호" : "약한 신호"}</span>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                  {p.entry_price.toLocaleString("ko-KR")}원
                </span>
              </div>
              <div style={{ height: 1, background: COLORS.line }} />
            </div>
          ))}
        </>
      )}

      {/* ── 최근 청산 ── */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>최근 청산</span>
      </div>
      {closed.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>청산된 포지션이 없습니다</span>
        </div>
      ) : closed.slice(0, 15).map((p) => {
        const isWin = (p.pnl_amount ?? 0) > 0;
        return (
          <div key={p.id}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{p.stock_name || p.stock_code}</span>
                  {((p.entry_signal as { directOrderNote?: string | null } | null)?.directOrderNote ?? "").trim() && (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: "#EFF6FF",
                      color: "#1D4ED8",
                      border: `1px solid ${COLORS.line}`,
                    }}>
                      {String((p.entry_signal as { directOrderNote?: string | null } | null)?.directOrderNote)}
                    </span>
                  )}
                  {p.exit_reason && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      background: p.exit_reason === "trailing_stop" ? COLORS.riseL : COLORS.fallL,
                      color: p.exit_reason === "trailing_stop" ? COLORS.rise : COLORS.fall,
                      border: `1px solid ${p.exit_reason === "trailing_stop" ? COLORS.riseB : COLORS.fallB}`,
                    }}>
                      {EXIT_LABELS[p.exit_reason] || p.exit_reason}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 3 }}>
                  <span style={{ fontSize: 11, color: COLORS.dim }}>
                    {p.hold_days}일 보유 · {p.exit_date ? new Date(p.exit_date).toLocaleDateString("ko-KR") : ""}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: isWin ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                  {(p.pnl_percent ?? 0) >= 0 ? "+" : ""}{(p.pnl_percent ?? 0).toFixed(2)}%
                </span>
                {p.pnl_amount !== null && Math.abs(p.pnl_amount) > 100 && (
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isWin ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                      {isWin ? "+" : ""}{Math.round(p.pnl_amount).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ height: 1, background: COLORS.line }} />
          </div>
        );
      })}

      {surgeClosed.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 체결 로그</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 12px" }}>
            <input
              value={surgeSearch}
              onChange={(event) => setSurgeSearch(event.target.value)}
              placeholder="종목명 또는 코드 검색"
              style={{
                gridColumn: "1 / -1",
                width: "100%",
                height: 40,
                borderRadius: 10,
                border: `1px solid ${COLORS.line}`,
                background: "#fff",
                padding: "0 12px",
                fontSize: 13,
                color: COLORS.ink,
                fontFamily: "inherit",
              }}
            />
            <select
              value={surgeExitFilter}
              onChange={(event) => setSurgeExitFilter(event.target.value)}
              style={{
                height: 40,
                borderRadius: 10,
                border: `1px solid ${COLORS.line}`,
                background: "#fff",
                padding: "0 12px",
                fontSize: 13,
                color: COLORS.ink,
                fontFamily: "inherit",
              }}
            >
              <option value="all">전체 청산 사유</option>
              {surgeExitOptions.map((reason) => (
                <option key={reason} value={reason}>{EXIT_LABELS[reason] || reason}</option>
              ))}
            </select>
            <select
              value={surgeOutcomeFilter}
              onChange={(event) => setSurgeOutcomeFilter(event.target.value as "all" | "win" | "loss")}
              style={{
                height: 40,
                borderRadius: 10,
                border: `1px solid ${COLORS.line}`,
                background: "#fff",
                padding: "0 12px",
                fontSize: 13,
                color: COLORS.ink,
                fontFamily: "inherit",
              }}
            >
              <option value="all">전체 결과</option>
              <option value="win">수익</option>
              <option value="loss">손실</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
            {[
              { label: "필터 거래", value: `${filteredSurgeTradeCount}건`, color: COLORS.ink },
              { label: "필터 승률", value: filteredSurgeTradeCount > 0 ? `${filteredSurgeWinRate.toFixed(1)}%` : "—", color: filteredSurgeWinRate >= 50 ? COLORS.rise : COLORS.fall },
              { label: "필터 손익", value: filteredSurgeTradeCount > 0 ? `${filteredSurgeTotalPnl >= 0 ? "+" : ""}${Math.round(filteredSurgeTotalPnl).toLocaleString("ko-KR")}원` : "—", color: filteredSurgeTotalPnl >= 0 ? COLORS.rise : COLORS.fall },
            ].map((card) => (
              <div key={card.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px", border: `1px solid ${COLORS.line}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.label}</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</div>
              </div>
            ))}
          </div>
          {filteredSurgeClosed.length === 0 ? (
            <div style={{ padding: "8px 20px 20px", textAlign: "center" }}>
              <span style={{ fontSize: 13, color: COLORS.dim }}>조건에 맞는 급등주 청산 내역이 없습니다</span>
            </div>
          ) : filteredSurgeClosed.slice(0, 12).map((p) => {
            const isWin = (p.pnl_amount ?? 0) > 0;
            return (
              <div key={`surge-${p.id}`}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#F8FAFC" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{p.stock_name || p.stock_code}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#FFEDD5", color: "#C2410C", border: `1px solid ${COLORS.line}` }}>
                        급등주
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" }}>
                        {SURGE_ENTRY_TAG_LABELS[((p.entry_signal as { entryTag?: string } | null)?.entryTag) || "unknown"] || "미분류"}
                      </span>
                      {p.exit_reason && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: p.exit_reason === "trailing_stop" ? COLORS.riseL : COLORS.fallL,
                          color: p.exit_reason === "trailing_stop" ? COLORS.rise : COLORS.fall,
                          border: `1px solid ${p.exit_reason === "trailing_stop" ? COLORS.riseB : COLORS.fallB}`,
                        }}>
                          {EXIT_LABELS[p.exit_reason] || p.exit_reason}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: COLORS.dim }}>
                        {p.stock_code} · {p.hold_days}일 보유 · {p.exit_date ? new Date(p.exit_date).toLocaleDateString("ko-KR") : ""}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: isWin ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                      {(p.pnl_percent ?? 0) >= 0 ? "+" : ""}{(p.pnl_percent ?? 0).toFixed(2)}%
                    </span>
                    {p.pnl_amount !== null && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: isWin ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                          {isWin ? "+" : ""}{Math.round(p.pnl_amount).toLocaleString("ko-KR")}원
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ height: 1, background: COLORS.line }} />
              </div>
            );
          })}
        </>
      )}

      {/* ── Best / Worst ── */}
      {(stats.bestTrade || stats.worstTrade) && (
        <div style={{ display: "flex", gap: 8, padding: "16px" }}>
          {stats.bestTrade && (
            <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: COLORS.riseL, border: `1px solid ${COLORS.riseB}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.rise }}>BEST</span>
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.rise }}>{stats.bestTrade.name}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.rise }}>+{Math.round(stats.bestTrade.pnl).toLocaleString("ko-KR")}원</span>
            </div>
          )}
          {stats.worstTrade && (
            <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: COLORS.fallL, border: `1px solid ${COLORS.fallB}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.fall }}>WORST</span>
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.fall }}>{stats.worstTrade.name}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.fall }}>{Math.round(stats.worstTrade.pnl).toLocaleString("ko-KR")}원</span>
            </div>
          )}
        </div>
      )}
      <div style={{ padding: "0 16px" }}><BacktestSection /></div>

      {/* ── 자가학습 현황 ── */}
      <div style={{ height: 1, background: COLORS.line }} />
      <LearningSection
        snapshot={learningData?.snapshot ?? null}
        isExpired={learningData?.isExpired ?? true}
        history={learningData?.history ?? []}
        abStats={learningData?.abStats}
        tradeMemoryCount={learningData?.tradeMemoryCount}
        datasetSummary={learningData?.datasetSummary}
      />

      {/* ── 종목별 성과 ── */}
      {stockStats.length > 0 && (
        <>
          <div style={{ height: 1, background: COLORS.line }} />
          <StockStatsSection stats={stockStats} />
        </>
      )}

      {/* ── 엔진 실행 로그 ── */}
      <div style={{ height: 1, background: COLORS.line }} />
      <div style={{ padding: "0 16px 40px" }}><EngineLogSection /></div>
    </div>
  );
}
