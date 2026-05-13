import { NextResponse } from "next/server";
import { readEngineStateSnapshot } from "@/lib/engine/snapshot";
import { fetchNewsSnapshot, buildHoldingNewsAlert, buildHoldingNewsAlertForAliases } from "@/lib/news";
import { sendHoldingNewsRiskAlert } from "@/lib/engine/notify";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { getOverseasBalance, getToken } from "@/lib/kis/api";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

async function loadOverseasRiskItems(latestNews: Awaited<ReturnType<typeof fetchNewsSnapshot>>["latestNews"]) {
  const active = await getActiveKisConfig("us");
  if (!active) return [];

  const token = await getToken(active.config.appKey, active.config.appSecret);
  const credentials = {
    appKey: active.config.appKey,
    appSecret: active.config.appSecret,
    accountNo: active.config.accountNo,
    accountProductCode: active.config.accountProductCode,
    token,
  };

  const exchanges = ["NASD", "NYSE", "AMEX"] as const;
  const settled = await Promise.allSettled(
    exchanges.map((exchangeCode) => getOverseasBalance(credentials, exchangeCode, "USD")),
  );

  const alerts: Array<{ code: string; name: string; headlines: string[] }> = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const rows = Array.isArray(result.value?.output1) ? result.value.output1 as Array<Record<string, unknown>> : [];
    for (const row of rows) {
      const quantity = Math.max(0, firstNumber(row, ["ovrs_cblc_qty", "cblc_qty", "hldg_qty"]));
      if (quantity <= 0) continue;
      const symbol = firstString(row, ["ovrs_pdno", "pdno", "symb", "rsym"]).toUpperCase();
      const name = firstString(row, ["ovrs_item_name", "prdt_name", "item_name", "symb_name"]) || symbol;
      const alert = buildHoldingNewsAlertForAliases(name, [name, symbol], latestNews);
      if (alert?.riskItems.length) {
        alerts.push({
          code: symbol,
          name,
          headlines: alert.riskItems.map((item) => item.title),
        });
      }
    }
  }

  return alerts;
}

function summarizeDirectOrderNoteFlow(buyAmount: number, sellAmount: number) {
  const largerSide = Math.max(buyAmount, sellAmount);
  return {
    completionRate: largerSide > 0 ? Math.min(buyAmount, sellAmount) / largerSide : 0,
    residualExposure: Math.max(0, buyAmount - sellAmount),
  };
}

async function loadDirectOrderNoteWarnings() {
  if (getSupabaseConfigError()) return [];

  const result = await supabase
    .from("engine_state_events")
    .select("stock_code, payload, created_at")
    .in("event_type", ["manual_buy_executed", "manual_sell_executed"])
    .order("created_at", { ascending: false })
    .limit(30);

  if (result.error) return [];

  const noteMap = new Map<string, {
    buyAmount: number;
    sellAmount: number;
    count: number;
    recentStocks: Array<{ stockCode: string; market: string; side: string; runAt: string }>;
  }>();
  for (const row of result.data ?? []) {
    const payload = (row.payload as Record<string, unknown> | null) ?? null;
    const note = typeof payload?.note === "string" ? payload.note.trim() : "";
    if (!note) continue;
    const side = String(payload?.side ?? "");
    const market = String(payload?.market ?? "kr");
    const qty = Math.max(0, Number(payload?.qty ?? 0));
    const price = Math.max(0, Number(payload?.price ?? 0));
    const amount = qty * price;
    const current = noteMap.get(note) ?? { buyAmount: 0, sellAmount: 0, count: 0, recentStocks: [] };
    current.count += 1;
    if (side === "buy") current.buyAmount += amount;
    if (side === "sell") current.sellAmount += amount;
    current.recentStocks.push({
      stockCode: String(row.stock_code ?? ""),
      market,
      side,
      runAt: String(row.created_at ?? ""),
    });
    current.recentStocks.sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
    current.recentStocks = current.recentStocks.slice(0, 2);
    noteMap.set(note, current);
  }

  return Array.from(noteMap.entries())
    .map(([note, value]) => ({
      note,
      count: value.count,
      recentStocks: value.recentStocks,
      ...summarizeDirectOrderNoteFlow(value.buyAmount, value.sellAmount),
    }))
    .filter((item) => item.count >= 2)
    .filter((item) => item.completionRate < 0.45 || item.residualExposure > 0)
    .sort((a, b) => b.residualExposure - a.residualExposure || a.completionRate - b.completionRate)
    .slice(0, 3);
}

export async function POST() {
  try {
    const [snapshot, newsSnapshot, noteWarnings] = await Promise.all([
      readEngineStateSnapshot(),
      fetchNewsSnapshot(),
      loadDirectOrderNoteWarnings(),
    ]);

    const domesticItems = snapshot.openPositions.flatMap((position) => {
      const name = position.stockName ?? position.stockCode;
      const alert = buildHoldingNewsAlert(name, newsSnapshot.latestNews);
      if (!alert?.riskItems.length) return [];
      return [{
        code: position.stockCode,
        name,
        headlines: alert.riskItems.map((item) => item.title),
      }];
    });

    const overseasItems = await loadOverseasRiskItems(newsSnapshot.latestNews);
    const items = [...domesticItems, ...overseasItems];

    if (items.length > 0 || noteWarnings.length > 0) {
      await sendHoldingNewsRiskAlert({ items, noteWarnings });
    }

    await recordEngineEvent({
      eventType: "holding_news_risk_alert_sent",
      entityTable: "operations",
      entityId: null,
      payload: {
        success: true,
        count: items.length,
        codes: items.map((item) => item.code).slice(0, 20),
        noteWarnings: noteWarnings.map((item) => ({
          note: item.note,
          completionRate: item.completionRate,
          residualExposure: item.residualExposure,
          recentStocks: item.recentStocks,
        })),
      },
    });

    return NextResponse.json({
      ok: true,
      count: items.length,
      noteWarningCount: noteWarnings.length,
      items: items.map((item) => ({ code: item.code, name: item.name, headlineCount: item.headlines.length })),
      noteWarnings,
    });
  } catch (error: unknown) {
    await recordEngineEvent({
      eventType: "holding_news_risk_alert_sent",
      entityTable: "operations",
      entityId: null,
      payload: {
        success: false,
        error: error instanceof Error ? error.message : "보유 뉴스 리스크 점검 실패",
      },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "보유 뉴스 리스크 점검 실패" },
      { status: 500 },
    );
  }
}
