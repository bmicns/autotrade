"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { isRiskNews, summarizeNewsKeywords, type NewsItem } from "@/lib/news";
import { useAppStore } from "@/lib/store";
import { EngineHealthCard } from "./engine-health-card";
import { PreflightStatusCard } from "./preflight-status-card";
import { EngineStateCard } from "./engine-state-card";
import { OperatorSummaryStrip } from "./operator-summary-strip";
import { HomeAlertStrip } from "./home-alert-strip";
import { HomeHero } from "./home-hero";
import { HoldingsSection } from "./holdings-section";
import { NewsSection } from "./news-section";
import { OpsInsightsSection } from "./ops-insights-section";
import type {
  DirectOrderLog,
  DirectOrderNoteStat,
  EngineControlSnapshot,
  HoldingNewsAlertLog,
  MarketContext,
  NewsStats,
  OverseasHoldingSummary,
  SurgeStats,
} from "./home-types";
import { useEngineState } from "@/hooks/useEngineState";

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
  const mobileHoldingScrollStyle: CSSProperties | undefined = isMobileViewport && holdings.length > 5
    ? {
        maxHeight: 404,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
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
      <HomeHero
        kisLoading={kisLoading}
        totalKRW={totalKRW}
        totalPnl={totalPnl}
        pct={pct}
        isUp={isUp}
        kisConnected={kisConnected}
        isUsView={isUsView}
        overseasSummary={overseasSummary}
        marketCtx={marketCtx}
        cashBalance={cashBalance}
        holdingCount={isUsView ? (overseasSummary?.summary?.positionCount ?? 0) : holdings.length}
      />

      <EngineHealthCard actionSlot={<PreflightStatusCard />} />

      <HoldingsSection
        marketMode={marketMode}
        holdings={holdings}
        kisConnected={kisConnected}
        mobileHoldingScrollStyle={mobileHoldingScrollStyle}
        overseasSummary={overseasSummary}
        getPrice={getPrice}
        getCandles={getCandles}
        getHoldingNews={getHoldingNews}
      />

      <NewsSection
        isUsView={isUsView}
        newsTab={newsTab}
        setNewsTab={setNewsTab}
        newsLoading={newsLoading}
        naverNews={naverNews}
        daumNews={daumNews}
        disclosures={disclosures}
        marketKeywords={marketKeywords}
        engineControl={engineControl}
        aiSentiment={aiSentiment}
      />

      {engineState && (
        <HomeAlertStrip
          runtime={engineState.runtime}
          kisConnected={kisConnected}
          holdingRiskCount={combinedHoldingRiskAlerts.length}
          marketMode={marketMode}
        />
      )}

      {engineState && <OperatorSummaryStrip state={engineState.runtime} summaryCards={summaryCards} />}

      <OpsInsightsSection
        isUsView={isUsView}
        overseasSummary={overseasSummary}
        surgeStats={surgeStats}
        directOrderNoteStats={directOrderNoteStats}
        directOrderNoteAlerts={directOrderNoteAlerts}
        directOrderAlertRecentTrades={directOrderAlertRecentTrades}
        topDirectOrderRecentTrades={topDirectOrderRecentTrades}
        engineControl={engineControl}
        combinedHoldingRiskAlerts={combinedHoldingRiskAlerts}
        newsStats={newsStats}
        holdingRiskAlertLoading={holdingRiskAlertLoading}
        holdingRiskAlertResult={holdingRiskAlertResult}
        triggerHoldingRiskAlert={triggerHoldingRiskAlert}
        holdingNewsAlertNoteStats={holdingNewsAlertNoteStats}
        holdingNewsAlertStockStats={holdingNewsAlertStockStats}
      />

      <EngineStateCard collapsible defaultOpen={false} />
      <div style={{ height: 1, background: COLORS.line, marginTop: 10 }} />
    </div>
  );
}
