import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveEngineHealth } from "@/lib/engine/control";
import { summarizeNewsKeywords, type NewsItem } from "@/lib/news";
import { summarizeOrderLifecycle } from "@/lib/engine/order-timeline";

function summarizeDirectOrderNoteFlow(buyAmount: number, sellAmount: number) {
  const largerSide = Math.max(buyAmount, sellAmount);
  return {
    netFlow: sellAmount - buyAmount,
    sellToBuyRatio: buyAmount > 0 ? sellAmount / buyAmount : 0,
    completionRate: largerSide > 0 ? Math.min(buyAmount, sellAmount) / largerSide : 0,
    residualExposure: Math.max(0, buyAmount - sellAmount),
  };
}

function extractBlockedNewsKeywords(reason: string): string[] {
  const approvedMatch = reason.match(/\((.*?)\)/);
  if (approvedMatch?.[1]) {
    return approvedMatch[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return summarizeNewsKeywords(
    reason
      .split("|")
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title) => ({
        title,
        source: "engine-log",
        time: "",
        url: "#",
      }) satisfies NewsItem),
    4,
  ).map((item) => item.keyword);
}

export async function GET(req: NextRequest) {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const offset = (page - 1) * limit;

    const [runsResult, filterResult, directEventResult, holdingNewsAlertResult, orderEventResult, reconcileEventResult] = await Promise.all([
      supabase
        .from("engine_runs")
        .select("id, run_at, trade_count, scanned_count, duration_ms, error, actions", { count: "exact" })
        .order("run_at", { ascending: false })
        .range(offset, offset + limit - 1),
      // 최근 5회 실행에서 signal_skip / dart_filtered 액션 파싱
      supabase
        .from("engine_runs")
        .select("run_at, actions")
        .order("run_at", { ascending: false })
        .limit(5),
      supabase
        .from("engine_state_events")
        .select("event_type, stock_code, payload, created_at")
        .in("event_type", ["manual_buy_executed", "manual_sell_executed"])
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("engine_state_events")
        .select("event_type, payload, created_at")
        .eq("event_type", "holding_news_risk_alert_sent")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("engine_state_events")
        .select("event_type, stock_code, entity_id, payload, created_at")
        .in("event_type", [
          "manual_buy_queued",
          "pending_signal_resolved",
          "pending_order_saved",
          "pending_order_partially_filled",
          "pending_order_deleted",
          "manual_buy_executed",
          "manual_sell_executed",
        ])
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("engine_state_events")
        .select("stock_code, payload, created_at")
        .eq("event_type", "position_reconciled")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (runsResult.error) return NextResponse.json({ error: runsResult.error.message }, { status: 500 });

    type Action = { type: string; code?: string; name?: string; detail?: string };
    const filterLogs: { stock_code: string; stock_name?: string; action_type: string; reason: string; run_at: string }[] = [];
    const surgeStats = {
      earlyEntryCount: 0,
      reentryCount: 0,
      partialExitCount: 0,
      pendingCount: 0,
      cooldownSkipCount: 0,
      lateSkipCount: 0,
      newsCooldownSkipCount: 0,
      newsRiskSkipCount: 0,
    };
    const newsStats = {
      holdingRiskCount: 0,
      entryRiskSkipCount: 0,
      holdingAlertSentCount: 0,
      holdingAlertSentStockCount: 0,
      holdingAlertNoteWarningCount: 0,
      holdingAlertFailedCount: 0,
    };
    const blockedKeywordMap = new Map<string, { count: number; cooldownCount: number; riskCount: number; approvedCount: number }>();
    const blockedStockMap = new Map<string, {
      stock_code: string;
      stock_name?: string;
      count: number;
      cooldownCount: number;
      riskCount: number;
      approvedCount: number;
      lastBlockedAt: string;
    }>();
    const holdingRiskLogs: { stock_code: string; stock_name?: string; reason: string; run_at: string }[] = [];
    const blockedNewsLogs: { stock_code: string; stock_name?: string; action_type: string; reason: string; run_at: string }[] = [];
    const directOrderLogs: Array<{
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
    }> = [];
    const directOrderStats = {
      krBuyCount: 0,
      krSellCount: 0,
      usBuyCount: 0,
      usSellCount: 0,
    };
    const directOrderNoteMap = new Map<string, {
      note: string;
      count: number;
      buyCount: number;
      sellCount: number;
      market: string;
      lastRunAt: string;
      buyAmount: number;
      sellAmount: number;
    }>();
    const holdingNewsAlertLogs: Array<{
      success: boolean;
      count: number;
      noteWarningCount: number;
      noteWarningNotes: string[];
      noteWarningItems: Array<{ note: string; recentStocks: string[] }>;
      error?: string;
      run_at: string;
    }> = [];
    const holdingNewsAlertStats = {
      sentCount: 0,
      sentStockCount: 0,
      noteWarningSentCount: 0,
      noteWarningItemCount: 0,
      failedCount: 0,
    };
    const reconcileLogs: Array<{
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
    }> = [];
    const directOrderNameMap = new Map<string, string>();

    const directOrderCodes = Array.from(new Set(
      (directEventResult.data ?? [])
        .map((row) => String(row.stock_code ?? "").trim())
        .filter((code) => code.length > 0),
    ));

    if (directOrderCodes.length > 0) {
      const [positionsNameResult, pendingSignalsNameResult, tradeMemoryNameResult] = await Promise.all([
        supabase
          .from("positions")
          .select("stock_code, stock_name")
          .in("stock_code", directOrderCodes)
          .not("stock_name", "is", null)
          .order("entry_date", { ascending: false }),
        supabase
          .from("pending_signals")
          .select("stock_code, stock_name")
          .in("stock_code", directOrderCodes)
          .not("stock_name", "is", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("trade_memory")
          .select("stock_code, stock_name")
          .in("stock_code", directOrderCodes)
          .not("stock_name", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      for (const sourceRows of [
        positionsNameResult.data ?? [],
        pendingSignalsNameResult.data ?? [],
        tradeMemoryNameResult.data ?? [],
      ]) {
        for (const row of sourceRows as Array<{ stock_code?: string | null; stock_name?: string | null }>) {
          const code = String(row.stock_code ?? "").trim();
          const name = String(row.stock_name ?? "").trim();
          if (!code || !name || directOrderNameMap.has(code)) continue;
          directOrderNameMap.set(code, name);
        }
      }
    }

    for (const run of filterResult.data ?? []) {
      for (const action of (run.actions as Action[]) ?? []) {
        if (action.type === "signal_skip" || action.type === "dart_filtered") {
          filterLogs.push({
            stock_code: action.code ?? "",
            stock_name: action.name,
            action_type: action.type,
            reason: action.detail ?? "",
            run_at: run.run_at,
          });
        }
        if (action.type === "surge_early_entry_buy") surgeStats.earlyEntryCount += 1;
        if (action.type === "surge_reentry_buy") surgeStats.reentryCount += 1;
        if (action.type === "surge_trailing_stop") surgeStats.partialExitCount += 1;
        if (action.type === "surge_pending") surgeStats.pendingCount += 1;
        if (action.type === "surge_reentry_cooldown_skip") surgeStats.cooldownSkipCount += 1;
        if (action.type === "surge_late_entry_skip") surgeStats.lateSkipCount += 1;
        if (action.type === "surge_news_cooldown_skip") surgeStats.newsCooldownSkipCount += 1;
        if (action.type === "surge_news_risk_skip") surgeStats.newsRiskSkipCount += 1;
        if (action.type === "surge_news_cooldown_skip" || action.type === "surge_news_risk_skip" || action.type === "approved_news_risk_skip") {
          blockedNewsLogs.push({
            stock_code: action.code ?? "",
            stock_name: action.name,
            action_type: action.type,
            reason: action.detail ?? "",
            run_at: run.run_at,
          });
          const stockKey = action.code ?? action.name ?? action.detail ?? run.run_at;
          const stockEntry = blockedStockMap.get(stockKey) ?? {
            stock_code: action.code ?? "",
            stock_name: action.name,
            count: 0,
            cooldownCount: 0,
            riskCount: 0,
            approvedCount: 0,
            lastBlockedAt: run.run_at,
          };
          stockEntry.count += 1;
          if (action.type === "surge_news_cooldown_skip") stockEntry.cooldownCount += 1;
          if (action.type === "surge_news_risk_skip") stockEntry.riskCount += 1;
          if (action.type === "approved_news_risk_skip") stockEntry.approvedCount += 1;
          if (new Date(run.run_at).getTime() > new Date(stockEntry.lastBlockedAt).getTime()) {
            stockEntry.lastBlockedAt = run.run_at;
          }
          blockedStockMap.set(stockKey, stockEntry);

          for (const keyword of extractBlockedNewsKeywords(action.detail ?? "")) {
            const current = blockedKeywordMap.get(keyword) ?? {
              count: 0,
              cooldownCount: 0,
              riskCount: 0,
              approvedCount: 0,
            };
            current.count += 1;
            if (action.type === "surge_news_cooldown_skip") current.cooldownCount += 1;
            if (action.type === "surge_news_risk_skip") current.riskCount += 1;
            if (action.type === "approved_news_risk_skip") current.approvedCount += 1;
            blockedKeywordMap.set(keyword, current);
          }
        }
        if (action.type === "holding_news_risk") {
          newsStats.holdingRiskCount += 1;
          holdingRiskLogs.push({
            stock_code: action.code ?? "",
            stock_name: action.name,
            reason: action.detail ?? "",
            run_at: run.run_at,
          });
        }
        if (action.type === "approved_news_risk_skip") {
          newsStats.entryRiskSkipCount += 1;
        }
      }
    }

    for (const row of directEventResult.data ?? []) {
      const payload = (row.payload as Record<string, unknown> | null) ?? null;
      const side = String(payload?.side ?? "");
      const market = String(payload?.market ?? "kr");
      const qty = Number(payload?.qty ?? 0);
      const price = Number(payload?.price ?? 0);
      const currency = String(payload?.currency ?? (market === "us" ? "USD" : "KRW"));
      const note = typeof payload?.note === "string" ? payload.note.trim() : "";
      const eventType = String(row.event_type ?? "");

      if (market === "us") {
        if (side === "buy") directOrderStats.usBuyCount += 1;
        if (side === "sell") directOrderStats.usSellCount += 1;
      } else {
        if (side === "buy") directOrderStats.krBuyCount += 1;
        if (side === "sell") directOrderStats.krSellCount += 1;
      }

      directOrderLogs.push({
        stock_code: String(row.stock_code ?? ""),
        stock_name: typeof payload?.stock_name === "string"
          ? payload.stock_name
          : typeof payload?.stockName === "string"
            ? payload.stockName
            : typeof payload?.name === "string"
              ? payload.name
              : directOrderNameMap.get(String(row.stock_code ?? "").trim()),
        action_type: eventType,
        side,
        market,
        price,
        qty,
        currency,
        note: note || undefined,
        run_at: String(row.created_at ?? ""),
      });

      if (note) {
        const current = directOrderNoteMap.get(note) ?? {
          note,
          count: 0,
          buyCount: 0,
          sellCount: 0,
          market,
          lastRunAt: String(row.created_at ?? ""),
          buyAmount: 0,
          sellAmount: 0,
        };
        current.count += 1;
        if (side === "buy") current.buyCount += 1;
        if (side === "sell") current.sellCount += 1;
        if (side === "buy") current.buyAmount += Math.max(0, qty) * Math.max(0, price);
        if (side === "sell") current.sellAmount += Math.max(0, qty) * Math.max(0, price);
        if (new Date(String(row.created_at ?? "")).getTime() > new Date(current.lastRunAt).getTime()) {
          current.lastRunAt = String(row.created_at ?? "");
          current.market = market;
        }
        directOrderNoteMap.set(note, current);
      }
    }

    for (const row of holdingNewsAlertResult.data ?? []) {
      const payload = (row.payload as Record<string, unknown> | null) ?? null;
      const success = payload?.success === true;
      const count = Number(payload?.count ?? 0);
      const noteWarnings = Array.isArray(payload?.noteWarnings)
        ? payload.noteWarnings as Array<Record<string, unknown>>
        : [];
      if (success) {
        holdingNewsAlertStats.sentCount += 1;
        holdingNewsAlertStats.sentStockCount += count;
        if (noteWarnings.length > 0) {
          holdingNewsAlertStats.noteWarningSentCount += 1;
          holdingNewsAlertStats.noteWarningItemCount += noteWarnings.length;
          newsStats.holdingAlertNoteWarningCount += noteWarnings.length;
        }
        newsStats.holdingAlertSentCount += 1;
        newsStats.holdingAlertSentStockCount += count;
      } else {
        holdingNewsAlertStats.failedCount += 1;
        newsStats.holdingAlertFailedCount += 1;
      }
      holdingNewsAlertLogs.push({
        success,
        count,
        noteWarningCount: noteWarnings.length,
        noteWarningNotes: noteWarnings
          .map((item) => (typeof item.note === "string" ? item.note.trim() : ""))
          .filter(Boolean)
          .slice(0, 3),
        noteWarningItems: noteWarnings
          .map((item) => ({
            note: typeof item.note === "string" ? item.note.trim() : "",
            recentStocks: Array.isArray(item.recentStocks)
              ? item.recentStocks
                  .map((stock) => {
                    const parsed = stock as Record<string, unknown>;
                    const stockCode = typeof parsed.stockCode === "string" ? parsed.stockCode.trim() : "";
                    const market = typeof parsed.market === "string" ? parsed.market.trim().toUpperCase() : "";
                    return stockCode ? `${stockCode}${market ? ` (${market})` : ""}` : "";
                  })
                  .filter(Boolean)
                  .slice(0, 2)
              : [],
          }))
          .filter((item) => item.note)
          .slice(0, 3),
        error: typeof payload?.error === "string" ? payload.error : undefined,
        run_at: String(row.created_at ?? ""),
      });
    }

    for (const row of reconcileEventResult.data ?? []) {
      const payload = (row.payload as Record<string, unknown> | null) ?? null;
      const action = String(payload?.action ?? "");
      if (action === "qty_adjusted") {
        reconcileLogs.push({
          stock_code: String(row.stock_code ?? payload?.code ?? ""),
          stock_name: typeof payload?.name === "string" ? payload.name : undefined,
          action_type: "qty_adjusted",
          source: typeof payload?.source === "string" ? payload.source : undefined,
          profileId: typeof payload?.profileId === "string" ? payload.profileId : undefined,
          fromQty: Number(payload?.fromQty ?? 0) || 0,
          toQty: Number(payload?.toQty ?? 0) || 0,
          run_at: String(row.created_at ?? ""),
        });
        continue;
      }
      if (action === "orphan_closed") {
        reconcileLogs.push({
          stock_code: String(row.stock_code ?? payload?.code ?? ""),
          stock_name: typeof payload?.name === "string" ? payload.name : undefined,
          action_type: "orphan_closed",
          source: typeof payload?.source === "string" ? payload.source : undefined,
          profileId: typeof payload?.profileId === "string" ? payload.profileId : undefined,
          qty: Number(payload?.exit_qty ?? payload?.qty ?? 0) || 0,
          run_at: String(row.created_at ?? ""),
        });
        continue;
      }
      if (typeof payload?.restoredCount === "number" || typeof payload?.qtyAdjustedCount === "number" || typeof payload?.orphanedClosedCount === "number") {
        reconcileLogs.push({
          stock_code: "",
          action_type: "full_reconcile",
          source: typeof payload?.source === "string" ? payload.source : undefined,
          profileId: typeof payload?.profileId === "string" ? payload.profileId : undefined,
          restoredCount: Number(payload?.restoredCount ?? 0) || 0,
          qtyAdjustedCount: Number(payload?.qtyAdjustedCount ?? 0) || 0,
          orphanedClosedCount: Number(payload?.orphanedClosedCount ?? 0) || 0,
          run_at: String(row.created_at ?? ""),
        });
        continue;
      }
      reconcileLogs.push({
        stock_code: String(row.stock_code ?? payload?.code ?? ""),
        stock_name: typeof payload?.name === "string" ? payload.name : undefined,
        action_type: "restore",
        source: typeof payload?.reconcileSource === "string"
          ? payload.reconcileSource
          : typeof payload?.source === "string"
            ? payload.source
            : undefined,
        profileId: typeof payload?.directOrderProfileId === "string"
          ? payload.directOrderProfileId
          : typeof payload?.reconcileProfileId === "string"
            ? payload.reconcileProfileId
            : undefined,
        qty: Number(payload?.qty ?? 0) || 0,
        run_at: String(row.created_at ?? ""),
      });
    }

    // 홈 탭용 marketContext (첫 번째 실행에서 추출)
    const latestRun = (runsResult.data ?? [])[0];
    const marketContext = latestRun
      ? ((latestRun.actions as Action[]) ?? []).find((a) => a.type === "market_context") ?? null
      : null;

    // 엔진 헬스체크
    const lastRunAt = latestRun?.run_at ?? null;
    const healthStatus = resolveEngineHealth({
      lastRunAt,
      hasError: !!latestRun?.error,
    });

    return NextResponse.json({
      runs: runsResult.data ?? [],
      total: runsResult.count ?? 0,
      page,
      limit,
      hasMore: (runsResult.count ?? 0) > offset + limit,
      filterLogs,
      holdingRiskLogs: holdingRiskLogs.slice(0, 5),
      blockedNewsLogs: blockedNewsLogs.slice(0, 8),
      blockedNewsKeywordStats: Array.from(blockedKeywordMap.entries())
        .map(([keyword, value]) => ({ keyword, ...value }))
        .sort((a, b) => b.count - a.count || b.riskCount - a.riskCount || b.approvedCount - a.approvedCount)
        .slice(0, 8),
      blockedNewsStockStats: Array.from(blockedStockMap.values())
        .sort((a, b) => b.count - a.count || b.riskCount - a.riskCount || b.approvedCount - a.approvedCount)
        .slice(0, 6),
      directOrderLogs: directOrderLogs.slice(0, 8),
      directOrderStats,
      orderTimelines: summarizeOrderLifecycle((orderEventResult.data ?? []) as Array<{
        event_type?: string | null;
        stock_code?: string | null;
        entity_id?: string | null;
        payload?: Record<string, unknown> | null;
        created_at?: string | null;
      }>),
      directOrderNoteStats: Array.from(directOrderNoteMap.values())
        .map((item) => ({
          ...item,
          ...summarizeDirectOrderNoteFlow(item.buyAmount, item.sellAmount),
        }))
        .sort((a, b) => b.count - a.count || new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime())
        .slice(0, 8),
      reconcileLogs: reconcileLogs.slice(0, 8),
      holdingNewsAlertLogs,
      holdingNewsAlertStats,
      marketContext,
      healthStatus,
      surgeStats,
      newsStats,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
