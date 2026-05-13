"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { isRiskNews, summarizeNewsKeywords, type NewsItem } from "@/lib/news";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/sparkline";
import { Icon } from "@/components/ui/icons";
import { EngineHealthCard } from "./engine-health-card";
import { PreflightStatusCard } from "./preflight-status-card";
import { EngineStateCard } from "./engine-state-card";
import { useEngineState } from "@/hooks/useEngineState";

interface MarketContext {
  kospi_rate: number;
  kosdaq_rate: number;
  avg_rate: number;
  bonus: number;
  label: string;
}

interface SurgeStats {
  earlyEntryCount: number;
  reentryCount: number;
  partialExitCount: number;
  pendingCount: number;
  cooldownSkipCount: number;
  lateSkipCount: number;
  newsCooldownSkipCount: number;
  newsRiskSkipCount: number;
}

interface NewsStats {
  holdingRiskCount: number;
  entryRiskSkipCount: number;
  holdingAlertSentCount?: number;
  holdingAlertSentStockCount?: number;
  holdingAlertNoteWarningCount?: number;
  holdingAlertFailedCount?: number;
}

interface HoldingNewsAlertLog {
  success: boolean;
  count: number;
  noteWarningCount: number;
  noteWarningNotes: string[];
  noteWarningItems?: Array<{ note: string; recentStocks: string[] }>;
  error?: string;
  run_at: string;
}

interface DirectOrderNoteStat {
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

interface DirectOrderLog {
  stock_code: string;
  side: string;
  market: string;
  price: number;
  qty: number;
  currency: string;
  note?: string;
  run_at: string;
}

interface EngineControlSnapshot {
  surge_news_risk_cooldown_minutes?: number;
  surge_news_positive_bonus?: number;
  surge_news_negative_penalty?: number;
  manual_us_buy_note_templates?: string[];
  manual_us_sell_note_templates?: string[];
}

interface OverseasHoldingSummary {
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

interface Props {
  marketMode?: "kr" | "us";
}

export function HomeTab({ marketMode = "kr" }: Props) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [newsTab, setNewsTab] = useState<"naver" | "daum" | "dart">("naver");
  const [naverNews, setNaverNews] = useState<NewsItem[]>([]);
  const [daumNews, setDaumNews] = useState<NewsItem[]>([]);
  const [disclosures, setDisclosures] = useState<NewsItem[]>([]);
  const [aiSentiment, setAiSentiment] = useState<NewsItem[]>([]);
  const [latestNews, setLatestNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [marketCtx, setMarketCtx] = useState<MarketContext | null>(null);
  const [surgeStats, setSurgeStats] = useState<SurgeStats | null>(null);
  const [newsStats, setNewsStats] = useState<NewsStats | null>(null);
  const [directOrderNoteStats, setDirectOrderNoteStats] = useState<DirectOrderNoteStat[]>([]);
  const [directOrderLogs, setDirectOrderLogs] = useState<DirectOrderLog[]>([]);
  const [holdingNewsAlertLogs, setHoldingNewsAlertLogs] = useState<HoldingNewsAlertLog[]>([]);
  const [engineControl, setEngineControl] = useState<EngineControlSnapshot | null>(null);
  const [overseasSummary, setOverseasSummary] = useState<OverseasHoldingSummary | null>(null);
  const [holdingRiskAlertLoading, setHoldingRiskAlertLoading] = useState(false);
  const [holdingRiskAlertResult, setHoldingRiskAlertResult] = useState<string | null>(null);
  const { state: engineState, fetchEngineState } = useEngineState();

  const holdings = useAppStore((s) => s.holdings);
  const prices = useAppStore((s) => s.prices);
  const candles = useAppStore((s) => s.candles);
  const kisConnected = useAppStore((s) => s.kisConnected);
  const kisLoading = useAppStore((s) => s.kisLoading);
  const kisConfig = useAppStore((s) => s.kisConfig);
  const fetchKISData = useAppStore((s) => s.fetchKISData);
  const storeTotalEval = useAppStore((s) => s.totalEval);
  const storeTotalPnl = useAppStore((s) => s.totalPnl);
  const cashBalance = useAppStore((s) => s.cashBalance);

  useEffect(() => {
    const syncViewport = () => setIsMobileViewport(window.innerWidth <= 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (kisConfig.appKey && kisConfig.accountNo && !kisConnected && !kisLoading) {
      fetchKISData();
    }
  }, [kisConfig.appKey, kisConfig.accountNo, kisConnected, kisLoading, fetchKISData]);

  useEffect(() => {
    if (!kisConfig.appKey || !kisConfig.appSecret || !kisConfig.accountNo) return;

    const intervalId = window.setInterval(() => {
      if (useAppStore.getState().kisLoading) return;
      void fetchKISData();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [kisConfig.appKey, kisConfig.appSecret, kisConfig.accountNo, fetchKISData]);

  useEffect(() => {
    setNewsLoading(true);
    fetch(`/api/news?market=${marketMode}`)
      .then((r) => r.json())
      .then((d) => {
        setNaverNews(d.naverNews || []);
        setDaumNews(d.daumNews || []);
        setDisclosures(d.disclosures || []);
        setAiSentiment(d.aiSentiment || []);
        setLatestNews(d.latestNews || []);
      })
      .catch(() => {})
      .finally(() => setNewsLoading(false));
  }, [marketMode]);

  useEffect(() => {
    void refreshEngineLogSummary();
  }, []);

  useEffect(() => {
    fetch("/api/engine-control")
      .then((r) => r.json())
      .then((d) => setEngineControl(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEngineState();
  }, [fetchEngineState]);

  useEffect(() => {
    fetch("/api/kis/overseas-holdings")
      .then((r) => r.json())
      .then((d) => setOverseasSummary(d))
      .catch(() => setOverseasSummary(null));
  }, []);

  function getPrice(code: string) {
    const real = prices.get(code);
    if (real) return { price: real.price, change: real.changeRate as number | null };
    const h = holdings.find((h) => h.code === code);
    if (h?.currentPrice) return { price: h.currentPrice, change: null as number | null };
    return { price: 0, change: null as number | null };
  }

  function getCandles(code: string, fallbackPrice: number): number[] {
    const real = candles.get(code);
    if (real && real.length >= 2) return real;
    // 실데이터 없으면 가짜 데이터 fallback
    return [fallbackPrice * 0.98, fallbackPrice * 0.99, fallbackPrice];
  }

  function normalizeName(value: string): string {
    return value.replace(/\s+/g, "").toLowerCase();
  }

  function getHoldingNews(...aliases: string[]): NewsItem[] {
    const normalizedAliases = aliases
      .map((item) => normalizeName(item))
      .filter(Boolean);
    return latestNews.filter((item) =>
      normalizedAliases.some((alias) => normalizeName(item.title).includes(alias))
    ).slice(0, 2);
  }

  const totalKRW = storeTotalEval > 0
    ? storeTotalEval
    : holdings.reduce((sum, h) => sum + getPrice(h.code).price * h.quantity, 0) + cashBalance;

  const totalPnl = storeTotalPnl !== 0
    ? storeTotalPnl
    : holdings.reduce((sum, h) => {
        const p = getPrice(h.code);
        return p.price > 0 ? sum + (p.price - h.avgPrice) * h.quantity : sum;
      }, 0);

  const storePnlRate = useAppStore((s) => s.totalPnlRate);
  const pct = storePnlRate !== 0 ? storePnlRate : (totalKRW > 0 && totalPnl !== 0 ? (totalPnl / (totalKRW - totalPnl)) * 100 : 0);
  const isUp = totalPnl >= 0;
  const marketKeywords = summarizeNewsKeywords(latestNews, 6);
  const isKrView = marketMode === "kr";
  const isUsView = marketMode === "us";
  const mobileHoldingScrollStyle = isMobileViewport && holdings.length > 5
    ? {
        maxHeight: 404,
        overflowY: "auto" as const,
        WebkitOverflowScrolling: "touch" as const,
      }
    : undefined;
  const topDirectOrderNoteFlow = [...directOrderNoteStats]
    .filter((item) => typeof item.netFlow === "number")
    .sort((a, b) => Math.abs(b.netFlow ?? 0) - Math.abs(a.netFlow ?? 0))[0] ?? null;
  const directOrderNoteAlerts = [...directOrderNoteStats]
    .filter((item) => item.count >= 2)
    .filter((item) => (item.completionRate ?? 0) < 0.45 || (item.residualExposure ?? 0) > 0)
    .sort((a, b) => (b.residualExposure ?? 0) - (a.residualExposure ?? 0) || (a.completionRate ?? 1) - (b.completionRate ?? 1))
    .slice(0, 2);
  const topDirectOrderNoteAlert = directOrderNoteAlerts[0] ?? null;
  const directOrderAlertRecentTrades = new Map(
    directOrderNoteAlerts.map((item) => [
      item.note,
      directOrderLogs
        .filter((log) => (log.note ?? "").trim() === item.note)
        .slice(0, 2),
    ]),
  );
  const topDirectOrderRecentTrades = topDirectOrderNoteFlow
    ? directOrderLogs
        .filter((log) => (log.note ?? "").trim() === topDirectOrderNoteFlow.note)
        .slice(0, 3)
    : [];
  const holdingNewsAlertNoteStats = Array.from(
    holdingNewsAlertLogs.reduce((map, log) => {
      if (!log.success) return map;
      for (const note of log.noteWarningNotes) {
        const current = map.get(note) || {
          note,
          count: 0,
          lastRunAt: log.run_at,
          recentStocks: [] as string[],
        };
        current.count += 1;
        if (new Date(log.run_at).getTime() > new Date(current.lastRunAt).getTime()) {
          current.lastRunAt = log.run_at;
        }
        const matchingItem = (log.noteWarningItems ?? []).find((item) => item.note === note);
        if (matchingItem?.recentStocks?.length) {
          current.recentStocks = Array.from(new Set([...current.recentStocks, ...matchingItem.recentStocks])).slice(0, 3);
        }
        map.set(note, current);
      }
      return map;
    }, new Map<string, { note: string; count: number; lastRunAt: string; recentStocks: string[] }>()),
  )
    .map(([, item]) => item)
    .sort((a, b) => b.count - a.count || new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
    .slice(0, 3);
  const topHoldingNewsAlertNote = holdingNewsAlertNoteStats[0] ?? null;
  const holdingNewsAlertStockStats = Array.from(
    holdingNewsAlertLogs.reduce((map, log) => {
      if (!log.success) return map;
      for (const item of log.noteWarningItems ?? []) {
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
    }, new Map<string, { stock: string; count: number; notes: Set<string>; lastRunAt: string }>()),
  )
    .map(([, item]) => ({
      stock: item.stock,
      count: item.count,
      notes: Array.from(item.notes).sort(),
      lastRunAt: item.lastRunAt,
    }))
    .sort((a, b) => b.count - a.count || b.notes.length - a.notes.length || new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
    .slice(0, 3);
  const topHoldingNewsAlertStock = holdingNewsAlertStockStats[0] ?? null;
  const summaryCards = engineState
    ? [
        {
          label: "오늘 거래",
          value: `${engineState.summary.todayTradeCount}건`,
          tone: COLORS.ink,
        },
        {
          label: "실현 손익",
          value: `${engineState.summary.todayRealizedPnl >= 0 ? "+" : ""}${Math.round(engineState.summary.todayRealizedPnl).toLocaleString("ko-KR")}원`,
          tone: engineState.summary.todayRealizedPnl >= 0 ? COLORS.rise : COLORS.fall,
        },
        {
          label: "마지막 엔진",
          value: engineState.runtime.healthStatus.minutesSinceLastRun === null
            ? "미확인"
            : engineState.runtime.healthStatus.minutesSinceLastRun < 60
              ? `${engineState.runtime.healthStatus.minutesSinceLastRun}분 전`
              : `${Math.floor(engineState.runtime.healthStatus.minutesSinceLastRun / 60)}시간 ${engineState.runtime.healthStatus.minutesSinceLastRun % 60}분 전`,
          tone: engineState.runtime.healthStatus.status === "stale"
            ? "#B45309"
            : engineState.runtime.healthStatus.status === "error"
              ? COLORS.fall
              : COLORS.ink,
        },
        {
          label: "뉴스 점검",
          value: isUsView
            ? `${newsStats?.holdingAlertSentCount ?? 0}회 / ${newsStats?.holdingAlertNoteWarningCount ?? 0}`
            : `${newsStats?.holdingAlertSentCount ?? 0}회`,
          tone: (newsStats?.holdingAlertFailedCount ?? 0) > 0 ? "#B45309" : "#1D4ED8",
        },
        ...(isUsView
          ? [
              {
                label: "메모 흐름",
                value: topDirectOrderNoteFlow
                  ? `${topDirectOrderNoteFlow.note} ${topDirectOrderNoteFlow.netFlow! >= 0 ? "+" : ""}${Math.round(topDirectOrderNoteFlow.netFlow ?? 0).toLocaleString("ko-KR")}`
                  : "미확인",
                tone: topDirectOrderNoteFlow
                  ? (topDirectOrderNoteFlow.netFlow ?? 0) >= 0 ? COLORS.rise : COLORS.fall
                  : COLORS.dim,
              },
              {
                label: "메모 경고",
                value: topDirectOrderNoteAlert
                  ? `${topDirectOrderNoteAlert.note} ${Math.round(topDirectOrderNoteAlert.residualExposure ?? 0).toLocaleString("ko-KR")}`
                  : "안정",
                tone: topDirectOrderNoteAlert ? "#C2410C" : "#15803D",
              },
              {
                label: "경고 종목",
                value: topHoldingNewsAlertStock
                  ? `${topHoldingNewsAlertStock.stock} ${topHoldingNewsAlertStock.count}회`
                  : "미확인",
                tone: topHoldingNewsAlertStock ? "#C2410C" : COLORS.dim,
              },
              {
                label: "경고 태그",
                value: topHoldingNewsAlertNote
                  ? `${topHoldingNewsAlertNote.note} ${topHoldingNewsAlertNote.count}회`
                  : "미확인",
                tone: topHoldingNewsAlertNote ? "#C2410C" : COLORS.dim,
              },
            ]
          : []),
      ]
    : [];
  const holdingRiskAlerts = holdings.flatMap((holding) =>
    getHoldingNews(holding.name, holding.code)
      .filter((item) => isRiskNews(item))
      .map((item) => ({
        code: holding.code,
        name: holding.name,
        title: item.title,
        time: item.time,
      }))
  );
  const overseasHoldingRiskAlerts = (overseasSummary?.holdings ?? []).flatMap((holding) =>
    getHoldingNews(holding.name, holding.symbol)
      .filter((item) => isRiskNews(item))
      .map((item) => ({
        code: holding.symbol,
        name: holding.name,
        title: item.title,
        time: item.time,
      }))
  );
  const combinedHoldingRiskAlerts = isKrView ? holdingRiskAlerts : overseasHoldingRiskAlerts;

  async function refreshEngineLogSummary() {
    try {
      const response = await fetch("/api/engine-log");
      const data = await response.json();
      if (data.marketContext) setMarketCtx(data.marketContext);
      if (data.surgeStats) setSurgeStats(data.surgeStats);
      if (data.newsStats) setNewsStats(data.newsStats);
      setDirectOrderNoteStats(Array.isArray(data.directOrderNoteStats) ? data.directOrderNoteStats.slice(0, 3) : []);
      setDirectOrderLogs(Array.isArray(data.directOrderLogs) ? data.directOrderLogs : []);
      setHoldingNewsAlertLogs(Array.isArray(data.holdingNewsAlertLogs) ? data.holdingNewsAlertLogs.slice(0, 8) : []);
    } catch {}
  }

  async function triggerHoldingRiskAlert() {
    setHoldingRiskAlertLoading(true);
    setHoldingRiskAlertResult(null);
    try {
      const res = await fetch("/api/news/holding-risk-alert", { method: "POST" });
      const data = await res.json() as { count?: number; noteWarningCount?: number; error?: string };
      if (!res.ok) {
        setHoldingRiskAlertResult(`실패: ${data.error ?? "점검 전송 실패"}`);
        return;
      }
      setHoldingRiskAlertResult(
        (data.count ?? 0) > 0 || (data.noteWarningCount ?? 0) > 0
          ? `텔레그램 전송 완료 · ${data.count ?? 0}개 종목${isUsView && (data.noteWarningCount ?? 0) > 0 ? ` · 메모경고 ${data.noteWarningCount}개` : ""}`
          : "악재 뉴스 없음 · 전송 생략",
      );
      await refreshEngineLogSummary();
      await fetchEngineState();
    } catch {
      setHoldingRiskAlertResult("실패: 점검 요청 중 오류가 발생했습니다.");
    } finally {
      setHoldingRiskAlertLoading(false);
    }
  }

  return (
    <div>
      {/* ── 히어로 ── */}
      <div data-testid="balance" style={{
        padding: "60px 20px 10px", textAlign: "right", position: "relative" as const,
        background: COLORS.hero,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='17.32' viewBox='0 0 10 17.32'%3E%3Cpath d='M5 0L10 2.89V8.66L5 11.55L0 8.66V2.89Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3'/%3E%3Cpath d='M10 5.77L15 8.66V14.43L10 17.32L5 14.43V8.66Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3' transform='translate(-5,0)'/%3E%3C/svg%3E")`,
      }}>
        {kisLoading && (
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>KIS 데이터 로딩 중...</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 52, fontWeight: 100, color: "#fff", letterSpacing: "-2px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {kisLoading && totalKRW === 0
              ? "—"
              : totalKRW > 0
                ? Math.round(totalKRW).toLocaleString("ko-KR")
                : "0"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>원</span>
        </div>

        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {totalPnl !== 0 && (
            <>
              <span style={{ fontSize: 14, fontWeight: 700, color: isUp ? COLORS.rise : "#6B9DFF", fontVariantNumeric: "tabular-nums" }}>
                {isUp ? "+" : ""}{Math.round(totalPnl).toLocaleString("ko-KR")}
              </span>
              <Badge label={`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`} tone={isUp ? "rise" : "fall"} />
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.15)" }} />
            </>
          )}
          {kisConnected ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} /> KIS 실시간
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>KIS 미연결</span>
          )}
          {isUsView && overseasSummary?.configured && (overseasSummary.summary?.positionCount ?? 0) > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#60A5FA" }} />
              해외 USD {overseasSummary.summary?.totalUsd.toFixed(2)}
            </span>
          )}
        </div>

        {/* 상태 배너 */}
        <div style={{
          marginTop: 24, marginBottom: 10, padding: "9px 14px", borderRadius: 12,
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
            {kisConnected ? "KIS 모의투자 연결됨 — 실시간 데이터" : "설정에서 KIS API 키를 등록하세요"}
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: kisConnected ? "#22C55E" : COLORS.dim,
            boxShadow: kisConnected ? "0 0 6px #22C55E" : "none",
          }} />
        </div>
      </div>

      {/* 시장 모멘텀 배너 */}
      {marketCtx && (
        <div style={{
          margin: "0 20px 0",
          padding: "10px 14px",
          background: marketCtx.avg_rate >= 0 ? COLORS.riseL : COLORS.fallL,
          border: `1px solid ${marketCtx.avg_rate >= 0 ? COLORS.riseB : COLORS.fallB}`,
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 10, marginBottom: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em" }}>시장 모멘텀</span>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: marketCtx.kospi_rate >= 0 ? COLORS.rise : COLORS.fall }}>
                KOSPI {marketCtx.kospi_rate >= 0 ? "+" : ""}{marketCtx.kospi_rate.toFixed(2)}%
              </span>
              <span style={{ fontSize: 10, color: COLORS.dim }}>|</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: marketCtx.kosdaq_rate >= 0 ? COLORS.rise : COLORS.fall }}>
                KOSDAQ {marketCtx.kosdaq_rate >= 0 ? "+" : ""}{marketCtx.kosdaq_rate.toFixed(2)}%
              </span>
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600,
            padding: "2px 7px", borderRadius: 5,
            background: marketCtx.avg_rate >= 0 ? COLORS.rise : COLORS.fall,
            color: "#fff",
          }}>
            {marketCtx.label || (marketCtx.avg_rate >= 0 ? "강세" : "약세")}
          </span>
        </div>
      )}

      <EngineHealthCard actionSlot={<PreflightStatusCard />} />

      {isKrView && (
        <>
      {/* ── 보유 종목 ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          보유 종목 ({holdings.length})
        </span>
      </div>

      {holdings.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <span style={{ fontSize: 14, color: COLORS.dim }}>
            {kisConnected ? "보유 종목이 없습니다" : "KIS 연결 후 보유 종목이 표시됩니다"}
          </span>
        </div>
      ) : (
        <div style={mobileHoldingScrollStyle}>
          {holdings.map((h) => {
            const { price, change } = getPrice(h.code);
            const up = change !== null ? change >= 0 : (h.pnlRate ?? 0) >= 0;
            const holdingNews = getHoldingNews(h.name);
            const purchaseChange = typeof h.pnlRate === "number"
              ? h.pnlRate
              : (price > 0 && h.avgPrice > 0 ? ((price - h.avgPrice) / h.avgPrice) * 100 : null);
            const purchaseUp = (purchaseChange ?? 0) >= 0;
            return (
              <div key={h.code}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: up ? COLORS.riseL : COLORS.fallL,
                      border: `1.5px solid ${up ? COLORS.riseB : COLORS.fallB}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon name={up ? "up" : "dn"} size={17} color={up ? COLORS.rise : COLORS.fall} strokeWidth={2} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {h.name}
                      </div>
                      <div style={{ marginTop: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.dim }}>{h.quantity}주 · {h.market}</span>
                      </div>
                      {holdingNews.length > 0 && (
                        <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                          {holdingNews.map((item) => (
                            <div key={`${h.code}-${item.url}`} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <span style={{
                                flexShrink: 0,
                                fontSize: 10,
                                fontWeight: 700,
                                color: item.sentiment === "positive" ? COLORS.rise : item.sentiment === "negative" ? COLORS.fall : COLORS.dim,
                                background: item.sentiment === "positive" ? COLORS.riseL : item.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                                border: `1px solid ${item.sentiment === "positive" ? COLORS.riseB : item.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                                borderRadius: 999,
                                padding: "2px 6px",
                              }}>
                                {item.sentiment === "positive" ? "호재" : item.sentiment === "negative" ? "악재" : "중립"}
                              </span>
                              <span style={{
                                fontSize: 11,
                                color: COLORS.mid,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                              }}>
                                {item.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 86 }}>
                      {price > 0 && <Sparkline data={getCandles(h.code, price)} color={purchaseUp ? COLORS.rise : COLORS.fall} baseline={h.avgPrice} w={42} h={24} />}
                      <div style={{ textAlign: "right", minWidth: 36 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim }}>손익</div>
                        <div style={{ marginTop: 2, fontSize: 13, fontWeight: 500, color: purchaseUp ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                          {purchaseChange !== null ? `${purchaseChange >= 0 ? "+" : ""}${purchaseChange.toFixed(2)}%` : "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 108, justifyContent: "flex-end" }}>
                      {price > 0 && <Sparkline data={getCandles(h.code, price)} color={up ? COLORS.rise : COLORS.fall} baseline={h.avgPrice} w={42} h={24} />}
                      <div style={{ textAlign: "right", minWidth: 58 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                        {price > 0 ? price.toLocaleString("ko-KR") : "—"}
                      </span>
                        <div style={{ marginTop: 2, fontSize: 12, fontWeight: 500, color: up ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                          {price > 0 && change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ height: 1, background: COLORS.line }} />
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {isUsView && overseasSummary?.configured && (
        <>
          <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              해외 보유 ({overseasSummary.holdings.length})
            </span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>
              {overseasSummary.connected ? `USD ${(overseasSummary.summary?.totalUsd ?? 0).toFixed(2)}` : "연결 확인 중"}
            </span>
          </div>

          {overseasSummary.holdings.length === 0 ? (
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 12, color: COLORS.dim }}>
                  {overseasSummary.connected ? "미국 보유 종목이 없습니다." : "미국 계좌 잔고를 확인 중입니다."}
                </span>
              </div>
            </div>
          ) : overseasSummary.holdings.map((holding) => {
            const isUp = holding.pnlRate >= 0;
            const holdingNews = getHoldingNews(holding.name, holding.symbol);
            return (
              <div key={`${holding.symbol}:${holding.exchangeCode}`}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: isUp ? COLORS.riseL : COLORS.fallL,
                      border: `1.5px solid ${isUp ? COLORS.riseB : COLORS.fallB}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isUp ? COLORS.rise : COLORS.fall }}>{holding.symbol.slice(0, 4)}</span>
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{holding.name}</span>
                        <span style={{ fontSize: 10, color: COLORS.dim, padding: "2px 6px", borderRadius: 999, background: COLORS.sub }}>
                          {holding.kind === "etf" ? "ETF" : "STOCK"}
                        </span>
                        <span style={{ fontSize: 10, color: "#1D4ED8", padding: "2px 6px", borderRadius: 999, background: "#DBEAFE" }}>
                          {holding.exchangeCode}
                        </span>
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <span style={{ fontSize: 12, color: COLORS.dim }}>{holding.symbol} · {holding.quantity}주 · USD</span>
                      </div>
                      {holdingNews.length > 0 && (
                        <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                          {holdingNews.map((item) => (
                            <div key={`${holding.symbol}-${item.url}`} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <span style={{
                                flexShrink: 0,
                                fontSize: 10,
                                fontWeight: 700,
                                color: item.sentiment === "positive" ? COLORS.rise : item.sentiment === "negative" ? COLORS.fall : COLORS.dim,
                                background: item.sentiment === "positive" ? COLORS.riseL : item.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                                border: `1px solid ${item.sentiment === "positive" ? COLORS.riseB : item.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                                borderRadius: 999,
                                padding: "2px 6px",
                              }}>
                                {item.sentiment === "positive" ? "호재" : item.sentiment === "negative" ? "악재" : "중립"}
                              </span>
                              <span style={{
                                fontSize: 11,
                                color: COLORS.mid,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                              }}>
                                {item.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                      ${holding.currentPrice > 0 ? holding.currentPrice.toFixed(2) : "—"}
                    </span>
                    <div style={{ marginTop: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                        {holding.currentPrice > 0 ? `${isUp ? "+" : ""}${holding.pnlRate.toFixed(2)}%` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ height: 1, background: COLORS.line }} />
              </div>
            );
          })}
        </>
      )}

      {/* ── 뉴스 탭 (네이버 / 다음 / 공시) ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>시장 뉴스</span>
        <div style={{ display: "flex", gap: 4, background: COLORS.sub, borderRadius: 8, padding: 3 }}>
          {(["naver", "daum", "dart"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setNewsTab(t)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: newsTab === t ? 700 : 500, fontFamily: "inherit",
                background: newsTab === t ? "#fff" : "transparent",
                color: newsTab === t ? COLORS.ink : COLORS.dim,
                boxShadow: newsTab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {isUsView
                ? t === "naver"
                  ? "미국시장"
                  : t === "daum"
                    ? "미국ETF"
                    : "SEC/실적"
                : t === "naver"
                  ? "네이버"
                  : t === "daum"
                    ? "다음"
                    : "공시"}
            </button>
          ))}
        </div>
      </div>

      {newsLoading ? (
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>뉴스 로딩 중...</span>
        </div>
      ) : (
        <div>
          {(newsTab === "naver" ? naverNews : newsTab === "daum" ? daumNews : disclosures).map((n, i) => (
            <div key={i}>
              <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {n.title}
                  </span>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{n.source}</span>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{n.time}</span>
                    {n.provider && (
                      <span style={{ fontSize: 10, color: COLORS.dim, padding: "2px 6px", borderRadius: 999, background: COLORS.sub }}>
                        {n.provider.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: COLORS.line }} />
            </div>
          ))}
        </div>
      )}

      {marketKeywords.length > 0 && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, letterSpacing: "0.05em", textTransform: "uppercase" }}>시장 뉴스 키워드</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>
              최근 뉴스 기준
              {engineControl ? ` · 쿨다운 ${engineControl.surge_news_risk_cooldown_minutes ?? 90}분` : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {marketKeywords.map((item) => (
              <span
                key={item.keyword}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: item.sentiment === "positive" ? COLORS.riseL : item.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                  color: item.sentiment === "positive" ? COLORS.rise : item.sentiment === "negative" ? COLORS.fall : COLORS.ink,
                  border: `1px solid ${item.sentiment === "positive" ? COLORS.riseB : item.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                }}
              >
                {item.keyword}
                <span style={{ color: COLORS.dim }}>{item.count}</span>
              </span>
            ))}
          </div>
          {engineControl && (
            <div style={{ marginTop: 10, fontSize: 11, color: COLORS.dim }}>
              뉴스 보너스 +{engineControl.surge_news_positive_bonus ?? 8} / 악재 패널티 -{engineControl.surge_news_negative_penalty ?? 8}
            </div>
          )}
        </div>
      )}

      {/* ── AI 감성 분석 ── */}
      <div style={{ padding: "24px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>AI 감성 분석</span>
      </div>
      <div style={{ padding: "0 20px 30px" }}>
        <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
          {/* 테이블 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", background: COLORS.sub, padding: "10px 16px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>뉴스</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>감성</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>판단</span>
          </div>
          {/* 테이블 바디 */}
          {aiSentiment.map((n, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", padding: "12px 16px", borderTop: `1px solid ${COLORS.line}`, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.title}
              </span>
              <div style={{ textAlign: "center" }}>
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  background: n.sentiment === "positive" ? COLORS.riseL : n.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                  color: n.sentiment === "positive" ? COLORS.rise : n.sentiment === "negative" ? COLORS.fall : COLORS.dim,
                  border: `1px solid ${n.sentiment === "positive" ? COLORS.riseB : n.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                }}>
                  {n.sentiment === "positive" ? "긍정" : n.sentiment === "negative" ? "부정" : "중립"}
                </span>
              </div>
              <span style={{ fontSize: 11, color: COLORS.mid, textAlign: "right" }}>{n.summary}</span>
            </div>
          ))}
        </div>
      </div>

      {isUsView && overseasSummary?.configured && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8", letterSpacing: "0.05em", textTransform: "uppercase" }}>해외 평가 요약</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>
              {overseasSummary.connected ? "USD 기준" : "연결 확인 중"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[
              { label: "포지션", value: `${overseasSummary.summary?.positionCount ?? 0}개` },
              { label: "평가금액", value: `USD ${(overseasSummary.summary?.totalUsd ?? 0).toFixed(2)}` },
              { label: "상태", value: overseasSummary.connected ? "실잔고" : "미확인" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#1D4ED8" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {surgeStats && (
        <details style={{ margin: "10px 20px 0", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <summary
            style={{
              listStyle: "none",
              cursor: "pointer",
              padding: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", letterSpacing: "0.05em", textTransform: "uppercase" }}>급등주 액션</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>최근 5회 실행</span>
          </summary>
          <div style={{ padding: "0 14px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {[
                { label: "선캐치", value: surgeStats.earlyEntryCount },
                { label: "재진입", value: surgeStats.reentryCount },
                { label: "부분청산", value: surgeStats.partialExitCount },
                { label: "대기", value: surgeStats.pendingCount },
                { label: "쿨다운", value: surgeStats.cooldownSkipCount },
                { label: "장마감", value: surgeStats.lateSkipCount },
                { label: "뉴스쿨", value: surgeStats.newsCooldownSkipCount },
                { label: "뉴스차단", value: surgeStats.newsRiskSkipCount },
              ].map((item) => (
                <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {isUsView && directOrderNoteStats.length > 0 && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", letterSpacing: "0.05em", textTransform: "uppercase" }}>직접 주문 메모</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>최근 체결 기준</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {directOrderNoteStats.map((item) => (
              <div key={item.note} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                    {item.market.toUpperCase()} · 매수 {item.buyCount} · 매도 {item.sellCount}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                    회수율 {typeof item.sellToBuyRatio === "number" && item.sellToBuyRatio > 0 ? `${(item.sellToBuyRatio * 100).toFixed(0)}%` : "—"}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                    완결도 {typeof item.completionRate === "number" && item.completionRate > 0 ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                    {typeof item.residualExposure === "number" && item.residualExposure > 0 ? ` · 잔류 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: typeof item.netFlow === "number" ? (item.netFlow >= 0 ? COLORS.rise : COLORS.fall) : "#7C3AED" }}>
                    {typeof item.netFlow === "number"
                      ? `${item.netFlow >= 0 ? "+" : ""}${Math.round(item.netFlow).toLocaleString("ko-KR")}`
                      : `${item.count}회`}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, color: COLORS.dim }}>
                    {new Date(item.lastRunAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {topDirectOrderRecentTrades.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                메모 흐름 1위 최근 거래
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {topDirectOrderRecentTrades.map((trade, index) => (
                  <div key={`${trade.stock_code}-${trade.run_at}-${index}`} style={{ fontSize: 10, color: COLORS.dim }}>
                    {trade.stock_code} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주 · {trade.currency === "USD" ? `$${trade.price.toFixed(2)}` : `${Math.round(trade.price).toLocaleString("ko-KR")}원`}
                  </div>
                ))}
              </div>
            </div>
          )}
          {directOrderNoteAlerts.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C2410C", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                메모 경고
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {directOrderNoteAlerts.map((item) => (
                  <div key={`alert-${item.note}`} style={{ fontSize: 10, color: "#9A3412" }}>
                    <div>
                      {item.note} · 완결도 {typeof item.completionRate === "number" ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                      {typeof item.residualExposure === "number" && item.residualExposure > 0 ? ` · 잔류 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                    </div>
                    {(directOrderAlertRecentTrades.get(item.note) ?? []).length > 0 && (
                      <div style={{ marginTop: 3, display: "grid", gap: 2 }}>
                        {(directOrderAlertRecentTrades.get(item.note) ?? []).map((trade, index) => (
                          <div key={`${item.note}-${trade.stock_code}-${trade.run_at}-${index}`} style={{ color: COLORS.dim }}>
                            {trade.stock_code} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isUsView && engineControl && ((engineControl.manual_us_buy_note_templates?.length ?? 0) > 0 || (engineControl.manual_us_sell_note_templates?.length ?? 0) > 0) && (
        <details style={{ margin: "10px 20px 0", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <summary
            style={{
              listStyle: "none",
              cursor: "pointer",
              padding: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, letterSpacing: "0.05em", textTransform: "uppercase" }}>메모 템플릿</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>현재 설정</span>
          </summary>
          <div style={{ padding: "0 14px 14px" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, marginBottom: 6 }}>미국 매수</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(engineControl.manual_us_buy_note_templates ?? []).map((item) => (
                    <span key={`buy-${item}`} style={{ padding: "5px 8px", borderRadius: 999, background: "#EFF6FF", border: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: "#1D4ED8" }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, marginBottom: 6 }}>미국 매도</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(engineControl.manual_us_sell_note_templates ?? []).map((item) => (
                    <span key={`sell-${item}`} style={{ padding: "5px 8px", borderRadius: 999, background: "#FEF2F2", border: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 700, color: "#B91C1C" }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </details>
      )}

      {combinedHoldingRiskAlerts.length > 0 && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C", letterSpacing: "0.05em", textTransform: "uppercase" }}>보유 종목 뉴스 리스크</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>
                {combinedHoldingRiskAlerts.length}건 감지{newsStats ? ` · 엔진 ${newsStats.holdingRiskCount}회 · 진입차단 ${newsStats.entryRiskSkipCount}회` : ""}
              </span>
              <button
                onClick={triggerHoldingRiskAlert}
                disabled={holdingRiskAlertLoading}
                style={{
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid #FCA5A5",
                  background: "#FFF",
                  color: "#B91C1C",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: holdingRiskAlertLoading ? "default" : "pointer",
                  opacity: holdingRiskAlertLoading ? 0.5 : 1,
                }}
              >
                {holdingRiskAlertLoading ? "전송 중..." : "텔레그램 점검"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {combinedHoldingRiskAlerts.slice(0, 4).map((alert) => (
              <div key={`${alert.code}-${alert.title}`} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>{alert.name}</span>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{alert.time}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: COLORS.ink, lineHeight: 1.45 }}>{alert.title}</div>
              </div>
            ))}
          </div>
          {holdingRiskAlertResult && (
            <div style={{ marginTop: 10, fontSize: 11, color: holdingRiskAlertResult.startsWith("실패") ? "#B91C1C" : COLORS.dim }}>
              {holdingRiskAlertResult}
            </div>
          )}
        </div>
      )}

      {newsStats && ((newsStats.holdingAlertSentCount ?? 0) > 0 || (newsStats.holdingAlertFailedCount ?? 0) > 0 || (isUsView && (newsStats.holdingAlertNoteWarningCount ?? 0) > 0)) && (
        <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", letterSpacing: "0.05em", textTransform: "uppercase" }}>뉴스 점검 전송</span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>최근 기록</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${isUsView ? 4 : 3}, minmax(0, 1fr))`, gap: 8 }}>
            {[
              { label: "전송", value: newsStats.holdingAlertSentCount ?? 0 },
              { label: "종목수", value: newsStats.holdingAlertSentStockCount ?? 0 },
              ...(isUsView ? [{ label: "메모경고", value: newsStats.holdingAlertNoteWarningCount ?? 0 }] : []),
              { label: "실패", value: newsStats.holdingAlertFailedCount ?? 0 },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
              </div>
            ))}
          </div>
          {isUsView && holdingNewsAlertNoteStats.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {holdingNewsAlertNoteStats.map((item) => (
                <div key={item.note} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.count}회</span>
                  </div>
                  {item.recentStocks.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>
                      {item.recentStocks.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isUsView && holdingNewsAlertStockStats.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {holdingNewsAlertStockStats.map((item) => (
                <div key={item.stock} style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stock}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#C2410C" }}>{item.count}회</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>
                    {item.notes.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <EngineStateCard collapsible defaultOpen={false} />

      {summaryCards.length > 0 && (
        <div style={{ margin: "10px 20px 0", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {summaryCards.map((item) => (
            <div key={item.label} style={{ padding: "12px 14px", borderRadius: 12, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>{item.label}</div>
              <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, color: item.tone, fontVariantNumeric: "tabular-nums" }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: COLORS.line, marginTop: 10 }} />
    </div>
  );
}
