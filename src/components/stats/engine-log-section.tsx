"use client";

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { ActionLinkChip } from "@/components/common/action-link-chip";
import { resolveStatCardAction } from "@/lib/navigation/nexio-actions";
import { highlightSectionFromHash, scrollToSection } from "@/lib/navigation/section-nav";

interface EngineAction {
  type: string;
  code?: string;
  name?: string;
  detail?: string;
}

interface EngineRun {
  id: string;
  run_at: string;
  trade_count: number;
  scanned_count: number;
  duration_ms: number;
  error: string | null;
  actions: EngineAction[];
}

interface LogResponse {
  runs: EngineRun[];
  total: number;
  page: number;
  hasMore: boolean;
  filterLogs?: FilterLog[];
  marketContext?: MarketContext | null;
  healthStatus?: HealthStatus | null;
  surgeStats?: {
    earlyEntryCount: number;
    reentryCount: number;
    partialExitCount: number;
    pendingCount: number;
    cooldownSkipCount: number;
    lateSkipCount: number;
    newsCooldownSkipCount: number;
    newsRiskSkipCount: number;
  } | null;
  newsStats?: {
    holdingRiskCount: number;
    entryRiskSkipCount: number;
  } | null;
  holdingRiskLogs?: HoldingRiskLog[];
  blockedNewsLogs?: BlockedNewsLog[];
  blockedNewsKeywordStats?: BlockedNewsKeywordStat[];
  blockedNewsStockStats?: BlockedNewsStockStat[];
  directOrderLogs?: DirectOrderLog[];
  directOrderStats?: DirectOrderStats | null;
  orderTimelines?: OrderTimeline[];
  reconcileLogs?: ReconcileLog[];
  directOrderNoteStats?: DirectOrderNoteStat[];
  holdingNewsAlertLogs?: HoldingNewsAlertLog[];
  holdingNewsAlertStats?: HoldingNewsAlertStats | null;
}

interface FilterLog {
  stock_code: string;
  stock_name?: string;
  action_type: string;
  reason: string;
  run_at: string;
}

interface HoldingRiskLog {
  stock_code: string;
  stock_name?: string;
  reason: string;
  run_at: string;
}

interface BlockedNewsLog {
  stock_code: string;
  stock_name?: string;
  action_type: string;
  reason: string;
  run_at: string;
}

interface BlockedNewsKeywordStat {
  keyword: string;
  count: number;
  cooldownCount: number;
  riskCount: number;
  approvedCount: number;
}

interface BlockedNewsStockStat {
  stock_code: string;
  stock_name?: string;
  count: number;
  cooldownCount: number;
  riskCount: number;
  approvedCount: number;
}

interface DirectOrderLog {
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
}

interface DirectOrderStats {
  krBuyCount: number;
  krSellCount: number;
  usBuyCount: number;
  usSellCount: number;
}

interface OrderTimeline {
  orderNo: string;
  stockCode: string;
  stockName: string | null;
  status: string;
  source: "auto" | "manual";
  side: "buy" | "sell";
  market: string | null;
  filledQty: number;
  remainingQty: number;
  orderQty: number;
  limitPrice: number | null;
  lastEventAt: string;
  events: string[];
}

interface ReconcileLog {
  stock_code: string;
  stock_name?: string;
  action_type: "restore" | "qty_adjusted" | "orphan_closed" | "full_reconcile";
  source?: string;
  profileId?: string;
  qty?: number;
  fromQty?: number;
  toQty?: number;
  restoredCount?: number;
  qtyAdjustedCount?: number;
  orphanedClosedCount?: number;
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

interface HoldingNewsAlertLog {
  success: boolean;
  count: number;
  noteWarningCount: number;
  noteWarningNotes: string[];
  error?: string;
  run_at: string;
}

interface HoldingNewsAlertStats {
  sentCount: number;
  sentStockCount: number;
  noteWarningSentCount: number;
  noteWarningItemCount: number;
  failedCount: number;
}

interface MarketContext {
  kospi_rate?: number;
  kosdaq_rate?: number;
  avg_rate?: number;
  bonus?: number;
  label?: string;
}

interface HealthStatus {
  status: "healthy" | "stale" | "error" | "unknown";
  lastRunAt: string | null;
  minutesSinceLastRun: number | null;
}

const ACTION_META: Record<string, { label: string; emoji: string; color: string }> = {
  // 매수 계열
  manual_buy_executed: { label: "수동매수실행", emoji: "🟢", color: "#E22929" },
  approved_buy:        { label: "매수", emoji: "🟢", color: "#E22929" },
  split_buy_1:         { label: "분할매수1", emoji: "🟢", color: "#E22929" },
  split_buy_2:         { label: "분할매수2", emoji: "🟢", color: "#E22929" },
  surge_buy:           { label: "급등매수", emoji: "⚡", color: "#E22929" },
  surge_early_entry_buy:{ label: "급등선캐치", emoji: "🎯", color: "#E22929" },
  surge_reentry_buy:   { label: "급등재진입", emoji: "♻️", color: "#E22929" },
  orgn_follow_buy:     { label: "기관추종매수", emoji: "🏦", color: "#E22929" },
  order_filled:        { label: "주문체결", emoji: "✅", color: "#E22929" },
  order_partially_filled: { label: "부분체결", emoji: "🧩", color: "#E22929" },
  // 매도 계열
  stop_loss:           { label: "손절", emoji: "📉", color: "#1554F0" },
  take_profit:         { label: "레거시청산", emoji: "🗂️", color: "#9CA3AF" },
  trailing_stop:       { label: "트레일링", emoji: "📉", color: "#1554F0" },
  surge_trailing_stop: { label: "급등부분청산", emoji: "✂️", color: "#1554F0" },
  trailing_only:       { label: "트레일링조정", emoji: "📐", color: "#1554F0" },
  max_hold_sell:       { label: "기간청산", emoji: "⏰", color: "#1554F0" },
  orgn_flip_sell:      { label: "기관이탈청산", emoji: "🏦", color: "#1554F0" },
  signal_rule_sell:    { label: "규칙이탈청산", emoji: "🚪", color: "#1554F0" },
  signal_rule_partial_sell: { label: "규칙부분청산", emoji: "🪓", color: "#1554F0" },
  reconcile_orphan:    { label: "리컨실정리", emoji: "🧹", color: "#1554F0" },
  sell:                { label: "매도", emoji: "🔵", color: "#1554F0" },
  // 실패
  buy_failed:          { label: "매수실패", emoji: "❌", color: "#9CA3AF" },
  sell_failed:         { label: "매도실패", emoji: "❌", color: "#9CA3AF" },
  approved_buy_failed: { label: "매수실패", emoji: "❌", color: "#9CA3AF" },
  surge_buy_failed:    { label: "급등매수실패", emoji: "❌", color: "#9CA3AF" },
  order_account_error: { label: "주문계좌오류", emoji: "🔒", color: "#B91C1C" },
  order_capacity_error:{ label: "주문한도부족", emoji: "💸", color: "#B45309" },
  order_retryable_failure: { label: "주문재시도필요", emoji: "🔁", color: "#9CA3AF" },
  price_lookup_failed: { label: "시세조회실패", emoji: "📡", color: "#9CA3AF" },
  // 경고/정지
  daily_loss_halt:     { label: "일손실정지", emoji: "🛑", color: "#F59E0B" },
  market_crash_halt:   { label: "급락정지", emoji: "🛑", color: "#F59E0B" },
  risk_halt:           { label: "리스크정지", emoji: "🛑", color: "#F59E0B" },
  order_cancelled_timeout: { label: "주문취소", emoji: "⏱️", color: "#F59E0B" },
  order_fill_check_failed: { label: "체결확인실패", emoji: "⚠️", color: "#F59E0B" },
  token_error:         { label: "토큰오류", emoji: "🔑", color: "#F59E0B" },
  // 정보
  cancel_open_orders:  { label: "미체결취소", emoji: "🗑️", color: "#9CA3AF" },
  dynamic_risk_skipped:{ label: "리스크스킵", emoji: "⏭️", color: "#9CA3AF" },
  filtered_out:        { label: "필터탈락", emoji: "🚫", color: "#9CA3AF" },
  pending_approval:    { label: "승인대기", emoji: "⏳", color: "#9CA3AF" },
  surge_pending:       { label: "급등승인대기", emoji: "⏳", color: "#9CA3AF" },
  signal_skip:         { label: "신호스킵", emoji: "↩️", color: "#9CA3AF" },
  surge_signal_skip:   { label: "급등스킵", emoji: "↩️", color: "#9CA3AF" },
  surge_reentry_cooldown_skip: { label: "급등쿨다운", emoji: "🧊", color: "#9CA3AF" },
  surge_late_entry_skip: { label: "급등장마감스킵", emoji: "🌆", color: "#9CA3AF" },
  surge_news_cooldown_skip: { label: "급등뉴스쿨다운", emoji: "🧊", color: "#B91C1C" },
  surge_news_risk_skip: { label: "급등악재차단", emoji: "🛑", color: "#B91C1C" },
  holding_news_risk:   { label: "보유악재", emoji: "📰", color: "#B91C1C" },
  approved_news_risk_skip: { label: "승인악재차단", emoji: "🛑", color: "#B91C1C" },
  learning_risk_enabled: { label: "학습보정ON", emoji: "🧠", color: "#1D4ED8" },
  learning_risk_disabled: { label: "학습보정OFF", emoji: "🧠", color: "#9CA3AF" },
  signals_expired:     { label: "신호만료", emoji: "🗓️", color: "#9CA3AF" },
  skip:                { label: "건너뜀", emoji: "⏭️", color: "#9CA3AF" },
  skipped:             { label: "건너뜀", emoji: "⏭️", color: "#9CA3AF" },
  market_context:      { label: "시장상황", emoji: "📊", color: "#9CA3AF" },
};

function getActionMeta(type: string) {
  return ACTION_META[type] ?? { label: type, emoji: "•", color: COLORS.mid };
}

function formatKST(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatAgo(minutes: number | null) {
  if (minutes === null) return "미확인";
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 전`;
}

const HEALTH_META: Record<HealthStatus["status"], { label: string; bg: string; border: string; color: string }> = {
  healthy: { label: "정상", bg: "#F0FDF4", border: "#BBF7D0", color: "#15803D" },
  stale: { label: "지연", bg: "#FFFBEB", border: "#FDE68A", color: "#B45309" },
  error: { label: "오류", bg: "#FEF2F2", border: "#FECACA", color: "#DC2626" },
  unknown: { label: "미확인", bg: COLORS.sub, border: COLORS.line, color: COLORS.dim },
};

function RunCard({ run }: { run: EngineRun }) {
  const [open, setOpen] = useState(false);
  const tradeActions = run.actions.filter((a) => ACTION_META[a.type]);
  const hasError = !!run.error;

  return (
    <div style={{ border: `1px solid ${hasError ? "#FECACA" : COLORS.line}`, borderRadius: 12, overflow: "hidden", background: hasError ? "#FFF5F5" : "#FFF" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: hasError ? "#DC2626" : COLORS.ink }}>
            {formatKST(run.run_at)}
          </span>
          <span style={{ fontSize: 11, color: COLORS.dim }}>
            거래 {run.trade_count}건 · 스캔 {run.scanned_count}종목 · {(run.duration_ms / 1000).toFixed(1)}초
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {tradeActions.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "2px 8px", borderRadius: 6 }}>
              {tradeActions.length}액션
            </span>
          )}
          {hasError && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 6 }}>오류</span>
          )}
          <span style={{ fontSize: 12, color: COLORS.dim }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${COLORS.line}`, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {hasError && (
            <div style={{ fontSize: 12, color: "#DC2626", padding: "6px 10px", background: "#FEF2F2", borderRadius: 6 }}>
              오류: {run.error}
            </div>
          )}
          {run.actions.length === 0 && (
            <div style={{ fontSize: 12, color: COLORS.dim }}>액션 없음</div>
          )}
          {run.actions.map((a, i) => {
            const meta = getActionMeta(a.type);
            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", borderBottom: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{meta.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    {a.name && <span style={{ fontSize: 12, color: COLORS.ink }}>{a.name}</span>}
                    {a.code && <span style={{ fontSize: 11, color: COLORS.dim }}>({a.code})</span>}
                  </div>
                  {a.detail && (
                    <div style={{ fontSize: 11, color: COLORS.mid, marginTop: 2, wordBreak: "break-all" }}>{a.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EngineLogSection() {
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [filterLogs, setFilterLogs] = useState<FilterLog[]>([]);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [surgeStats, setSurgeStats] = useState<NonNullable<LogResponse["surgeStats"]> | null>(null);
  const [newsStats, setNewsStats] = useState<NonNullable<LogResponse["newsStats"]> | null>(null);
  const [holdingRiskLogs, setHoldingRiskLogs] = useState<HoldingRiskLog[]>([]);
  const [blockedNewsLogs, setBlockedNewsLogs] = useState<BlockedNewsLog[]>([]);
  const [blockedNewsKeywordStats, setBlockedNewsKeywordStats] = useState<BlockedNewsKeywordStat[]>([]);
  const [blockedNewsStockStats, setBlockedNewsStockStats] = useState<BlockedNewsStockStat[]>([]);
  const [directOrderLogs, setDirectOrderLogs] = useState<DirectOrderLog[]>([]);
  const [directOrderStats, setDirectOrderStats] = useState<DirectOrderStats | null>(null);
  const [orderTimelines, setOrderTimelines] = useState<OrderTimeline[]>([]);
  const [reconcileLogs, setReconcileLogs] = useState<ReconcileLog[]>([]);
  const [directOrderNoteStats, setDirectOrderNoteStats] = useState<DirectOrderNoteStat[]>([]);
  const [holdingNewsAlertLogs, setHoldingNewsAlertLogs] = useState<HoldingNewsAlertLog[]>([]);
  const [holdingNewsAlertStats, setHoldingNewsAlertStats] = useState<HoldingNewsAlertStats | null>(null);
  const reconcileActionStats = Array.from(
    reconcileLogs.reduce((map, item) => {
      map.set(item.action_type, (map.get(item.action_type) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).entries(),
  )
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const reconcileSourceStats = Array.from(
    reconcileLogs.reduce((map, item) => {
      const key = item.source ?? "unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).entries(),
  )
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const reconcileProfileStats = Array.from(
    reconcileLogs.reduce((map, item) => {
      const key = item.profileId ?? "none";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).entries(),
  )
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const topDirectOrderNoteFlow = [...directOrderNoteStats]
    .filter((item) => typeof item.netFlow === "number")
    .sort((a, b) => Math.abs(b.netFlow ?? 0) - Math.abs(a.netFlow ?? 0))[0] ?? null;
  const directOrderNoteAlerts = [...directOrderNoteStats]
    .filter((item) => item.count >= 2)
    .filter((item) => (item.completionRate ?? 0) < 0.45 || (item.residualExposure ?? 0) > 0)
    .sort((a, b) => (b.residualExposure ?? 0) - (a.residualExposure ?? 0) || (a.completionRate ?? 1) - (b.completionRate ?? 1))
    .slice(0, 3);
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

  const fetchPage = useCallback(async (p: number, append = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/engine-log?page=${p}&limit=10`);
      if (!res.ok) throw new Error(`engine-log ${res.status}`);
      const data: LogResponse = await res.json();
      setRuns((prev) => append ? [...prev, ...data.runs] : data.runs);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
      if (!append) {
        setFilterLogs(Array.isArray(data.filterLogs) ? data.filterLogs.slice(0, 5) : []);
        setMarketContext(data.marketContext ?? null);
        setHealthStatus(data.healthStatus ?? null);
        setSurgeStats(data.surgeStats ?? null);
        setNewsStats(data.newsStats ?? null);
        setHoldingRiskLogs(Array.isArray(data.holdingRiskLogs) ? data.holdingRiskLogs.slice(0, 5) : []);
        setBlockedNewsLogs(Array.isArray(data.blockedNewsLogs) ? data.blockedNewsLogs.slice(0, 8) : []);
        setBlockedNewsKeywordStats(Array.isArray(data.blockedNewsKeywordStats) ? data.blockedNewsKeywordStats.slice(0, 8) : []);
        setBlockedNewsStockStats(Array.isArray(data.blockedNewsStockStats) ? data.blockedNewsStockStats.slice(0, 6) : []);
        setDirectOrderLogs(Array.isArray(data.directOrderLogs) ? data.directOrderLogs.slice(0, 8) : []);
        setDirectOrderStats(data.directOrderStats ?? null);
        setOrderTimelines(Array.isArray(data.orderTimelines) ? data.orderTimelines.slice(0, 8) : []);
        setReconcileLogs(Array.isArray(data.reconcileLogs) ? data.reconcileLogs.slice(0, 8) : []);
        setDirectOrderNoteStats(Array.isArray(data.directOrderNoteStats) ? data.directOrderNoteStats.slice(0, 6) : []);
        setHoldingNewsAlertLogs(Array.isArray(data.holdingNewsAlertLogs) ? data.holdingNewsAlertLogs.slice(0, 6) : []);
        setHoldingNewsAlertStats(data.holdingNewsAlertStats ?? null);
      }
    } catch {
      if (!append) {
        setRuns([]);
        setFilterLogs([]);
        setMarketContext(null);
        setHealthStatus(null);
        setSurgeStats(null);
        setNewsStats(null);
        setHoldingRiskLogs([]);
        setBlockedNewsLogs([]);
        setBlockedNewsKeywordStats([]);
        setBlockedNewsStockStats([]);
        setDirectOrderLogs([]);
        setDirectOrderStats(null);
        setOrderTimelines([]);
        setReconcileLogs([]);
        setDirectOrderNoteStats([]);
        setHoldingNewsAlertLogs([]);
        setHoldingNewsAlertStats(null);
        setHasMore(false);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPage(1); }, [fetchPage]);
  useEffect(() => {
    highlightSectionFromHash();
  }, []);

  return (
    <div id="engine-log-section" style={{ marginTop: 32, scrollMarginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink, margin: 0 }}>엔진 실행 로그</h3>
        <span style={{ fontSize: 11, color: COLORS.dim }}>총 {total}건</span>
      </div>

      {(healthStatus || marketContext || surgeStats || newsStats || directOrderStats || orderTimelines.length > 0 || directOrderNoteStats.length > 0 || holdingNewsAlertStats) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 12 }}>
          {healthStatus && (
            <div style={{ borderRadius: 12, padding: "12px 14px", background: HEALTH_META[healthStatus.status].bg, border: `1px solid ${HEALTH_META[healthStatus.status].border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: HEALTH_META[healthStatus.status].color }}>
                  엔진 상태 · {HEALTH_META[healthStatus.status].label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: HEALTH_META[healthStatus.status].color }}>
                  {formatAgo(healthStatus.minutesSinceLastRun)}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: COLORS.dim }}>
                {healthStatus.lastRunAt ? `마지막 실행 ${formatKST(healthStatus.lastRunAt)}` : "최근 실행 기록 없음"}
              </div>
            </div>
          )}

          {marketContext && (
            <div style={{ borderRadius: 12, padding: "12px 14px", background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>시장 컨텍스트</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.mid }}>{marketContext.label ?? "미확인"}</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: COLORS.dim }}>KOSPI {Number(marketContext.kospi_rate ?? 0).toFixed(2)}%</span>
                <span style={{ fontSize: 11, color: COLORS.dim }}>KOSDAQ {Number(marketContext.kosdaq_rate ?? 0).toFixed(2)}%</span>
                <span style={{ fontSize: 11, color: COLORS.dim }}>평균 {Number(marketContext.avg_rate ?? 0).toFixed(2)}%</span>
                <span style={{ fontSize: 11, color: COLORS.dim }}>보정 {Number(marketContext.bonus ?? 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          {surgeStats && (
            <div style={{ borderRadius: 12, padding: "12px 14px", background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C" }}>급등주 액션</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#EA580C" }}>최근 5회</span>
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "선캐치", value: surgeStats.earlyEntryCount },
                  { label: "재진입", value: surgeStats.reentryCount },
                  { label: "부분청산", value: surgeStats.partialExitCount },
                  { label: "대기등록", value: surgeStats.pendingCount },
                  { label: "쿨다운", value: surgeStats.cooldownSkipCount },
                  { label: "장마감스킵", value: surgeStats.lateSkipCount },
                  { label: "뉴스쿨다운", value: surgeStats.newsCooldownSkipCount },
                  { label: "뉴스차단", value: surgeStats.newsRiskSkipCount },
                ].map((item) => {
                  const action = resolveStatCardAction(item.label);
                  return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => action?.anchor && scrollToSection(action.anchor)}
                    style={{
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: `1px solid ${COLORS.line}`,
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: action ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
                    {action && <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>{action.hint}</div>}
                  </button>
                )})}
              </div>
            </div>
          )}

          {newsStats && (
            <div id="news-risk-summary-section" style={{ borderRadius: 12, padding: "12px 14px", background: "#F8FAFC", border: `1px solid ${COLORS.line}`, scrollMarginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>보유 뉴스 리스크</span>
                <ActionLinkChip label="악재 로그 보기" onClick={() => scrollToSection("holding-risk-section")} tone="warn" />
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "보유 악재", value: newsStats.holdingRiskCount },
                  { label: "진입 차단", value: newsStats.entryRiskSkipCount },
                ].map((item) => {
                  const action = resolveStatCardAction(item.label);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => action?.anchor && scrollToSection(action.anchor)}
                      style={{
                        borderRadius: 10,
                        background: "#FFFFFF",
                        border: `1px solid ${COLORS.line}`,
                        padding: "8px 10px",
                        textAlign: "left",
                        cursor: action ? "pointer" : "default",
                        fontFamily: "inherit",
                      }}
                    >
                      <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#B91C1C" }}>{item.value}</div>
                      {action && <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>{action.hint}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {directOrderStats && (
            <div id="direct-order-section" style={{ borderRadius: 12, padding: "12px 14px", background: "#F8FAFC", border: `1px solid ${COLORS.line}`, scrollMarginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8" }}>직접 주문</span>
                <ActionLinkChip label="최근 체결 보기" onClick={() => scrollToSection("direct-order-log-section")} />
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "국내 매수", value: directOrderStats.krBuyCount },
                  { label: "국내 매도", value: directOrderStats.krSellCount },
                  { label: "미국 매수", value: directOrderStats.usBuyCount },
                  { label: "미국 매도", value: directOrderStats.usSellCount },
                ].map((item) => {
                  const action = resolveStatCardAction(item.label);
                  return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => action?.anchor && scrollToSection(action.anchor)}
                    style={{
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: `1px solid ${COLORS.line}`,
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: action ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#1D4ED8" }}>{item.value}</div>
                    {action && <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>{action.hint}</div>}
                  </button>
                )})}
              </div>
            </div>
          )}

          {orderTimelines.length > 0 && (
            <div id="order-timeline-section" style={{ borderRadius: 12, padding: "12px 14px", background: "#F8FAFC", border: `1px solid ${COLORS.line}`, scrollMarginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0F766E" }}>주문 타임라인</span>
                <ActionLinkChip label="실행 로그 보기" onClick={() => scrollToSection("runs-list-section")} tone="accent" />
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {orderTimelines.slice(0, 4).map((item) => (
                  <button
                    key={`${item.orderNo}-${item.lastEventAt}`}
                    type="button"
                    onClick={() => scrollToSection("runs-list-section")}
                    style={{
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: `1px solid ${COLORS.line}`,
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>
                        {item.stockName ?? item.stockCode} · {item.source === "manual" ? "수동" : "자동"} · {item.side === "buy" ? "매수" : "매도"} · {item.status}
                      </span>
                      <span style={{ fontSize: 10, color: COLORS.dim }}>{formatKST(item.lastEventAt)}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>
                      {item.market ? `${item.market.toUpperCase()} · ` : ""}
                      {item.orderQty > 0 ? `주문 ${item.orderQty}주` : "주문 대기"}
                      {item.filledQty > 0 ? ` · 체결 ${item.filledQty}주` : ""}
                      {item.remainingQty > 0 ? ` · 잔여 ${item.remainingQty}주` : ""}
                      {item.limitPrice ? ` · ${item.limitPrice.toLocaleString("ko-KR")}원` : ""}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: COLORS.dim }}>
                      {item.events.join(" -> ")}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>실행 로그로 이동</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {reconcileLogs.length > 0 && (
            <div id="reconcile-log-section" style={{ borderRadius: 12, padding: "12px 14px", background: "#F8FAFC", border: `1px solid ${COLORS.line}`, scrollMarginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>최근 자동복구</span>
                <ActionLinkChip label="포지션 리컨실" onClick={() => scrollToSection("reconcile-log-list-section")} tone="warn" />
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                <div style={{ borderRadius: 10, background: "#FFFFFF", border: `1px solid ${COLORS.line}`, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>주요 액션</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: "#991B1B" }}>
                    {reconcileActionStats[0] ? `${getReconcileActionLabel(reconcileActionStats[0].key as ReconcileLog["action_type"])} ${reconcileActionStats[0].count}건` : "없음"}
                  </div>
                </div>
                <div style={{ borderRadius: 10, background: "#FFFFFF", border: `1px solid ${COLORS.line}`, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>주요 Source</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: "#991B1B" }}>
                    {reconcileSourceStats[0] ? `${reconcileSourceStats[0].key} ${reconcileSourceStats[0].count}건` : "없음"}
                  </div>
                </div>
                <div style={{ borderRadius: 10, background: "#FFFFFF", border: `1px solid ${COLORS.line}`, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>주요 Profile</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: "#991B1B" }}>
                    {reconcileProfileStats[0] ? `${reconcileProfileStats[0].key} ${reconcileProfileStats[0].count}건` : "없음"}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {reconcileLogs.slice(0, 4).map((item, index) => {
                  const summary = describeReconcileLog(item);
                  return (
                    <button
                      key={`${item.action_type}-${item.stock_code}-${item.run_at}-${index}`}
                      type="button"
                      onClick={() => scrollToSection("reconcile-log-list-section")}
                      style={{
                        borderRadius: 10,
                        background: "#FFFFFF",
                        border: `1px solid ${COLORS.line}`,
                        padding: "8px 10px",
                        textAlign: "left",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{summary.title}</span>
                        <span style={{ fontSize: 10, color: COLORS.dim }}>{formatKST(item.run_at)}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>{summary.detail}</div>
                      <div style={{ marginTop: 4, fontSize: 10, color: "#991B1B" }}>자동복구 이력 보기</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {directOrderNoteStats.length > 0 && (
            <div style={{ borderRadius: 12, padding: "12px 14px", background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>직접 주문 메모</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#8B5CF6" }}>최근 체결</span>
              </div>
              {topDirectOrderNoteFlow && (
                <div style={{ marginTop: 8, borderRadius: 10, background: "#FFFFFF", border: `1px solid ${COLORS.line}`, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>메모 흐름 1위</div>
                  <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: (topDirectOrderNoteFlow.netFlow ?? 0) >= 0 ? COLORS.rise : COLORS.fall }}>
                    {topDirectOrderNoteFlow.note} {(topDirectOrderNoteFlow.netFlow ?? 0) >= 0 ? "+" : ""}{Math.round(topDirectOrderNoteFlow.netFlow ?? 0).toLocaleString("ko-KR")}
                  </div>
                </div>
              )}
              {topDirectOrderRecentTrades.length > 0 && (
                <div style={{ marginTop: 8, borderRadius: 10, background: "#FFFFFF", border: `1px solid ${COLORS.line}`, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: COLORS.dim }}>흐름 1위 최근 거래</div>
                  <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                    {topDirectOrderRecentTrades.map((trade, index) => (
                      <div key={`${trade.stock_code}-${trade.run_at}-${index}`} style={{ fontSize: 10, color: COLORS.dim }}>
                        {trade.stock_name || trade.stock_code}{trade.stock_name ? ` (${trade.stock_code})` : ""} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주 · {trade.currency === "USD" ? `$${trade.price.toFixed(2)}` : `${Math.round(trade.price).toLocaleString("ko-KR")}원`}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {directOrderNoteStats.slice(0, 3).map((item) => (
                  <div key={item.note} style={{ borderRadius: 10, background: "#FFFFFF", border: `1px solid ${COLORS.line}`, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{item.note}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#7C3AED" }}>{item.count}회</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: COLORS.dim }}>
                      {item.market.toUpperCase()} · 매수 {item.buyCount} · 매도 {item.sellCount}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: COLORS.dim }}>
                      완결도 {typeof item.completionRate === "number" && item.completionRate > 0 ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                      {typeof item.residualExposure === "number" && item.residualExposure > 0 ? ` · 잔류 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                    </div>
                  </div>
                ))}
              </div>
              {directOrderNoteAlerts.length > 0 && (
                <div style={{ marginTop: 8, borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#C2410C" }}>메모 경고</div>
                  <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                    {directOrderNoteAlerts.map((item) => (
                      <div key={`warn-${item.note}`} style={{ fontSize: 10, color: "#9A3412" }}>
                        <div>
                          {item.note} · 완결도 {typeof item.completionRate === "number" ? `${(item.completionRate * 100).toFixed(0)}%` : "—"}
                          {typeof item.residualExposure === "number" && item.residualExposure > 0 ? ` · 잔류 ${Math.round(item.residualExposure).toLocaleString("ko-KR")}` : ""}
                        </div>
                        {(directOrderAlertRecentTrades.get(item.note) ?? []).length > 0 && (
                          <div style={{ marginTop: 3, display: "grid", gap: 2 }}>
                            {(directOrderAlertRecentTrades.get(item.note) ?? []).map((trade, index) => (
                              <div key={`${item.note}-${trade.stock_code}-${trade.run_at}-${index}`} style={{ color: COLORS.dim }}>
                                {trade.stock_name || trade.stock_code}{trade.stock_name ? ` (${trade.stock_code})` : ""} · {trade.market.toUpperCase()} · {trade.side === "buy" ? "매수" : "매도"} {trade.qty}주
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

          {holdingNewsAlertStats && (
            <div style={{ borderRadius: 12, padding: "12px 14px", background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C" }}>뉴스 점검 전송</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#EA580C" }}>수동 점검</span>
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                {[
                  { label: "전송", value: holdingNewsAlertStats.sentCount },
                  { label: "종목수", value: holdingNewsAlertStats.sentStockCount },
                  { label: "메모전송", value: holdingNewsAlertStats.noteWarningSentCount },
                  { label: "메모경고", value: holdingNewsAlertStats.noteWarningItemCount },
                  { label: "실패", value: holdingNewsAlertStats.failedCount },
                ].map((item) => {
                  const action = resolveStatCardAction(item.label);
                  return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => action?.anchor && scrollToSection(action.anchor)}
                    style={{
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: `1px solid ${COLORS.line}`,
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: action ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#C2410C" }}>{item.value}</div>
                    {action && <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>{action.hint}</div>}
                  </button>
                )})}
              </div>
            </div>
          )}
        </div>
      )}

      {filterLogs.length > 0 && (
        <div id="filter-log-section" style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF", scrollMarginTop: 16 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>최근 필터 탈락</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>{filterLogs.length}건</span>
              <ActionLinkChip label="실행 로그 보기" onClick={() => scrollToSection("runs-list-section")} />
            </div>
          </div>
          <div style={{ padding: "8px 10px" }}>
            {filterLogs.map((log, index) => (
              <button
                key={`${log.stock_code}-${log.run_at}-${index}`}
                type="button"
                onClick={() => scrollToSection("runs-list-section")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 4px",
                  border: "none",
                  borderBottom: index === filterLogs.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{log.stock_name || log.stock_code}</span>
                    <span style={{ fontSize: 10, color: COLORS.dim }}>{log.stock_code}</span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 5px",
                      borderRadius: 4,
                      background: log.action_type === "dart_filtered" ? COLORS.fallL : COLORS.sub,
                      color: log.action_type === "dart_filtered" ? COLORS.fall : COLORS.mid,
                      border: `1px solid ${log.action_type === "dart_filtered" ? COLORS.fallB : COLORS.line}`,
                    }}>
                      {log.action_type === "dart_filtered" ? "DART" : "SKIP"}
                    </span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>{log.reason || "사유 없음"}</div>
                  <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>실행 로그로 이동</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>{formatKST(log.run_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {holdingRiskLogs.length > 0 && (
        <div id="holding-risk-section" style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF", scrollMarginTop: 16 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>최근 보유 악재 뉴스</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>{holdingRiskLogs.length}건</span>
              <ActionLinkChip label="요약 보기" onClick={() => scrollToSection("news-risk-summary-section")} tone="warn" />
              <ActionLinkChip label="차단 로그" onClick={() => scrollToSection("blocked-news-section")} tone="warn" />
            </div>
          </div>
          <div style={{ padding: "8px 10px" }}>
            {holdingRiskLogs.map((log, index) => (
              <button
                key={`${log.stock_code}-${log.run_at}-${index}`}
                type="button"
                onClick={() => scrollToSection("blocked-news-section")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 4px",
                  border: "none",
                  borderBottom: index === holdingRiskLogs.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{log.stock_name || log.stock_code}</span>
                    <span style={{ fontSize: 10, color: COLORS.dim }}>{log.stock_code}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: "#FEF2F2", color: "#B91C1C", border: `1px solid ` }}>
                      NEWS
                    </span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>{log.reason || "사유 없음"}</div>
                  <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>차단 로그로 이동</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>{formatKST(log.run_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {blockedNewsLogs.length > 0 && (
        <div id="blocked-news-section" style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF", scrollMarginTop: 16 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>최근 뉴스 차단 종목</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>{blockedNewsLogs.length}건</span>
              <ActionLinkChip label="요약 보기" onClick={() => scrollToSection("news-risk-summary-section")} tone="warn" />
              <ActionLinkChip label="악재 로그" onClick={() => scrollToSection("holding-risk-section")} tone="warn" />
            </div>
          </div>
          <div style={{ padding: "8px 10px" }}>
            {blockedNewsLogs.map((log, index) => (
              <button
                key={`${log.stock_code}-${log.run_at}-${index}`}
                type="button"
                onClick={() => scrollToSection("holding-risk-section")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 4px",
                  border: "none",
                  borderBottom: index === blockedNewsLogs.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{log.stock_name || log.stock_code}</span>
                    <span style={{ fontSize: 10, color: COLORS.dim }}>{log.stock_code}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: "#FEF2F2", color: "#B91C1C", border: `1px solid ` }}>
                      {log.action_type === "surge_news_cooldown_skip" ? "COOLDOWN" : log.action_type === "approved_news_risk_skip" ? "APPROVED" : "RISK"}
                    </span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>{log.reason || "사유 없음"}</div>
                  <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>악재 로그로 이동</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>{formatKST(log.run_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(blockedNewsKeywordStats.length > 0 || blockedNewsStockStats.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
          {blockedNewsKeywordStats.length > 0 && (
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF" }}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>차단 뉴스 키워드</span>
                <ActionLinkChip label="차단 로그 보기" onClick={() => scrollToSection("blocked-news-section")} tone="warn" />
              </div>
              <div style={{ padding: "8px 10px" }}>
                {blockedNewsKeywordStats.map((item, index) => (
                  <button
                    key={`${item.keyword}-${index}`}
                    type="button"
                    onClick={() => scrollToSection("blocked-news-section")}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 4px",
                      border: "none",
                      borderBottom: index === blockedNewsKeywordStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.keyword}</span>
                        <span style={{ fontSize: 10, color: COLORS.dim }}>총 {item.count}회</span>
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        쿨다운 {item.cooldownCount} · 리스크 {item.riskCount} · 승인차단 {item.approvedCount}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>차단 로그로 이동</div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 800, color: "#B91C1C" }}>{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {blockedNewsStockStats.length > 0 && (
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF" }}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>뉴스 차단 상위 종목</span>
                <ActionLinkChip label="차단 로그 보기" onClick={() => scrollToSection("blocked-news-section")} tone="warn" />
              </div>
              <div style={{ padding: "8px 10px" }}>
                {blockedNewsStockStats.map((item, index) => (
                  <button
                    key={`${item.stock_code}-${index}`}
                    type="button"
                    onClick={() => scrollToSection("blocked-news-section")}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 4px",
                      border: "none",
                      borderBottom: index === blockedNewsStockStats.length - 1 ? "none" : `1px solid ${COLORS.line}`,
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{item.stock_name || item.stock_code}</span>
                        <span style={{ fontSize: 10, color: COLORS.dim }}>{item.stock_code}</span>
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>
                        쿨다운 {item.cooldownCount} · 리스크 {item.riskCount} · 승인차단 {item.approvedCount}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>차단 로그로 이동</div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 800, color: "#B91C1C" }}>{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {directOrderLogs.length > 0 && (
        <div id="direct-order-log-section" style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF", scrollMarginTop: 16 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8" }}>최근 직접 주문 체결</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>{directOrderLogs.length}건</span>
              <ActionLinkChip label="실행 로그 보기" onClick={() => scrollToSection("runs-list-section")} tone="accent" />
            </div>
          </div>
          <div style={{ padding: "8px 10px" }}>
            {directOrderLogs.map((log, index) => (
              <button
                key={`${log.stock_code}-${log.run_at}-${index}`}
                type="button"
                onClick={() => scrollToSection("runs-list-section")}
                style={{ width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "8px 4px", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", borderBottom: index === directOrderLogs.length - 1 ? "none" : `1px solid ${COLORS.line}` }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{log.stock_name || log.stock_code}</span>
                    {log.stock_name && <span style={{ fontSize: 10, color: COLORS.dim }}>{log.stock_code}</span>}
                    <span style={{ fontSize: 10, color: COLORS.dim }}>{log.market.toUpperCase()}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: log.side === "buy" ? "#F0FDF4" : "#EFF6FF", color: log.side === "buy" ? "#15803D" : "#1D4ED8", border: `1px solid ${log.side === "buy" ? "#BBF7D0" : "#BFDBFE"}` }}>
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
                  <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>실행 로그로 이동</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>{formatKST(log.run_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {reconcileLogs.length > 0 && (
        <div id="reconcile-log-list-section" style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF", scrollMarginTop: 16 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>최근 리컨실 / 자동복구 이력</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>{reconcileLogs.length}건</span>
              <ActionLinkChip label="실행 로그 보기" onClick={() => scrollToSection("runs-list-section")} tone="warn" />
            </div>
          </div>
          <div style={{ padding: "8px 10px" }}>
            {reconcileLogs.map((item, index) => {
              const summary = describeReconcileLog(item);
              return (
                <button
                  key={`reconcile-${item.action_type}-${item.stock_code}-${item.run_at}-${index}`}
                  type="button"
                  onClick={() => scrollToSection("runs-list-section")}
                  style={{ width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "8px 4px", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", borderBottom: index === reconcileLogs.length - 1 ? "none" : `1px solid ${COLORS.line}`, fontFamily: "inherit" }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>{summary.title}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}>
                        {item.action_type === "full_reconcile" ? "RUN" : item.action_type === "qty_adjusted" ? "QTY" : item.action_type === "orphan_closed" ? "ORPHAN" : "RESTORE"}
                      </span>
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim }}>{summary.detail}</div>
                    <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>실행 로그로 이동</div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>{formatKST(item.run_at)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {holdingNewsAlertLogs.length > 0 && (
        <div id="holding-news-alert-section" style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: "#FFF", scrollMarginTop: 16 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#C2410C" }}>최근 뉴스 점검 전송</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.dim }}>{holdingNewsAlertLogs.length}건</span>
              <ActionLinkChip label="실행 로그 보기" onClick={() => scrollToSection("runs-list-section")} tone="warn" />
            </div>
          </div>
          <div style={{ padding: "8px 10px" }}>
            {holdingNewsAlertLogs.map((log, index) => (
              <button
                key={`${log.run_at}-${index}`}
                type="button"
                onClick={() => scrollToSection("runs-list-section")}
                style={{ width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "8px 4px", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", borderBottom: index === holdingNewsAlertLogs.length - 1 ? "none" : `1px solid ${COLORS.line}` }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>
                      {log.success ? `${log.count}개 종목 전송` : "전송 실패"}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: log.success ? "#FFF7ED" : "#FEF2F2", color: log.success ? "#C2410C" : "#B91C1C", border: `1px solid ${log.success ? "#FED7AA" : "#FECACA"}` }}>
                      {log.success ? "SENT" : "FAILED"}
                    </span>
                  </div>
                  {log.error && (
                    <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>{log.error}</div>
                  )}
                  {log.success && log.noteWarningCount > 0 && (
                    <div style={{ marginTop: 3, fontSize: 11, color: COLORS.dim, wordBreak: "break-word" }}>
                      메모경고 {log.noteWarningCount}개
                      {log.noteWarningNotes.length > 0 ? ` · ${log.noteWarningNotes.join(", ")}` : ""}
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>실행 로그로 이동</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10, color: COLORS.dim }}>{formatKST(log.run_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div id="runs-list-section" style={{ display: "flex", flexDirection: "column", gap: 8, scrollMarginTop: 16 }}>
        {runs.map((run) => <RunCard key={run.id} run={run} />)}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: COLORS.dim }}>불러오는 중...</div>
      )}

      {!loading && hasMore && (
        <button
          onClick={() => fetchPage(page + 1, true)}
          style={{
            width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 10,
            border: `1px solid ${COLORS.line}`, background: "transparent",
            fontSize: 13, fontWeight: 600, color: COLORS.mid, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          더 보기
        </button>
      )}

      {!loading && runs.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: COLORS.dim }}>실행 기록이 없습니다</div>
      )}
    </div>
  );
}

function describeReconcileLog(item: ReconcileLog) {
  const context = [
    item.source ? `source ${item.source}` : null,
    item.profileId ? `profile ${item.profileId}` : null,
  ].filter(Boolean).join(" · ");
  if (item.action_type === "full_reconcile") {
    return {
      title: "수동 리컨실 실행",
      detail: `DB복구 ${item.restoredCount ?? 0}건 · 수량보정 ${item.qtyAdjustedCount ?? 0}건 · 고아정리 ${item.orphanedClosedCount ?? 0}건${context ? ` · ${context}` : ""}`,
    };
  }
  if (item.action_type === "qty_adjusted") {
    return {
      title: `${item.stock_name || item.stock_code} 수량보정`,
      detail: `${item.stock_code} · ${item.fromQty ?? 0}주 -> ${item.toQty ?? 0}주${context ? ` · ${context}` : ""}`,
    };
  }
  if (item.action_type === "orphan_closed") {
    return {
      title: `${item.stock_name || item.stock_code} 고아정리`,
      detail: `${item.stock_code} · ${item.qty ?? 0}주 종료${context ? ` · ${context}` : ""}`,
    };
  }
  return {
    title: `${item.stock_name || item.stock_code} DB복구`,
    detail: `${item.stock_code} · ${item.qty ?? 0}주 복구${context ? ` · ${context}` : ""}`,
  };
}

function getReconcileActionLabel(actionType: ReconcileLog["action_type"]) {
  if (actionType === "full_reconcile") return "수동 리컨실";
  if (actionType === "qty_adjusted") return "수량보정";
  if (actionType === "orphan_closed") return "고아정리";
  return "DB복구";
}
