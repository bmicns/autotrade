import { NextResponse } from "next/server";

import { applyRehearsalEvidence, normalizeRehearsalChecklist, summarizeRehearsalChecklist, type RehearsalEvidenceMap } from "@/lib/operations/rehearsal-checklist";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";

type TradeMemoryRow = {
  stock_code?: string | null;
  stock_name?: string | null;
  pnl_amount?: number | null;
  pnl_percent?: number | null;
  hold_days?: number | null;
  exit_reason?: string | null;
  entry_date?: string | null;
  closed_at?: string | null;
};

type EventRow = {
  event_type?: string | null;
  created_at?: string | null;
  payload?: Record<string, unknown> | null;
};

function summarizeTrades(trades: TradeMemoryRow[]) {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => (Number(trade.pnl_amount) || 0) > 0);
  const losses = trades.filter((trade) => (Number(trade.pnl_amount) || 0) <= 0);
  const totalPnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl_amount) || 0), 0);
  const avgPnlPercent = totalTrades > 0
    ? trades.reduce((sum, trade) => sum + (Number(trade.pnl_percent) || 0), 0) / totalTrades
    : 0;
  const avgHoldDays = totalTrades > 0
    ? trades.reduce((sum, trade) => sum + (Number(trade.hold_days) || 0), 0) / totalTrades
    : 0;
  const grossProfit = wins.reduce((sum, trade) => sum + (Number(trade.pnl_amount) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + (Number(trade.pnl_amount) || 0), 0));
  const latestClosedAt = trades
    .map((trade) => trade.closed_at)
    .find((value): value is string => typeof value === "string" && !!value) ?? null;

  return {
    totalTrades,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: totalTrades > 0 ? Math.round((wins.length / totalTrades) * 1000) / 10 : 0,
    totalPnl: Math.round(totalPnl),
    avgPnlPercent: Math.round(avgPnlPercent * 100) / 100,
    avgHoldDays: Math.round(avgHoldDays * 10) / 10,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : null,
    latestClosedAt,
  };
}

function buildRehearsalEvidence(events: EventRow[]): RehearsalEvidenceMap {
  const evidence: RehearsalEvidenceMap = {};

  for (const row of events) {
    const eventType = String(row.event_type ?? "");
    const createdAt = typeof row.created_at === "string" ? row.created_at : null;
    if (!createdAt) continue;

    if (eventType === "manual_buy_queued" && !evidence.manual_buy) evidence.manual_buy = createdAt;
    if (eventType === "manual_sell_executed" && !evidence.manual_sell) evidence.manual_sell = createdAt;
    if (eventType === "position_reconciled" && !evidence.reconcile) evidence.reconcile = createdAt;
    if (
      ["position_opened", "buy", "approved_buy", "split_buy_1", "split_buy_2", "surge_buy", "surge_reentry_buy"].includes(eventType)
      && !evidence.auto_entry
    ) {
      const source = typeof row.payload?.source === "string" ? row.payload.source : null;
      const signalSource = typeof row.payload?.signal_source === "string" ? row.payload.signal_source : null;
      if (source !== "manual_buy" && signalSource !== "manual") evidence.auto_entry = createdAt;
    }
    if (eventType === "position_closed" && !evidence.auto_exit) {
      const exitReason = typeof row.payload?.exit_reason === "string" ? row.payload.exit_reason : null;
      if (exitReason && exitReason !== "manual_sell") evidence.auto_exit = createdAt;
    }
  }

  return evidence;
}

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const now = new Date();
  const last7d = new Date(now.getTime() - 7 * 86400000).toISOString();
  const last30d = new Date(now.getTime() - 30 * 86400000).toISOString();

  try {
    const [tradeMemoryRes, checklistRes, eventsRes] = await Promise.all([
      supabase
        .from("trade_memory")
        .select("stock_code, stock_name, pnl_amount, pnl_percent, hold_days, exit_reason, entry_date, closed_at")
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false })
        .limit(200),
      supabase.from("app_config").select("value").eq("key", "rehearsal_checklist").maybeSingle(),
      supabase
        .from("engine_state_events")
        .select("event_type, created_at, payload")
        .gte("created_at", last30d)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const trades = (tradeMemoryRes.data ?? []) as TradeMemoryRow[];
    const events = (eventsRes.data ?? []) as EventRow[];
    const rehearsal = summarizeRehearsalChecklist(
      applyRehearsalEvidence(
        normalizeRehearsalChecklist(checklistRes.data?.value),
        buildRehearsalEvidence(events),
      ),
    );

    const trades7d = trades.filter((trade) => typeof trade.closed_at === "string" && trade.closed_at >= last7d);
    const trades30d = trades.filter((trade) => typeof trade.closed_at === "string" && trade.closed_at >= last30d);

    return NextResponse.json({
      allTime: summarizeTrades(trades),
      last7d: summarizeTrades(trades7d),
      last30d: summarizeTrades(trades30d),
      rehearsal,
      recentExitReasons: Array.from(
        trades.slice(0, 20).reduce((map, trade) => {
          const key = String(trade.exit_reason ?? "unknown");
          map.set(key, (map.get(key) ?? 0) + 1);
          return map;
        }, new Map<string, number>()),
      ).map(([reason, count]) => ({ reason, count })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "실거래 트랙레코드 조회 실패" },
      { status: 500 },
    );
  }
}
