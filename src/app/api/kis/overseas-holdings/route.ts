import { NextResponse } from "next/server";
import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { getToken, getOverseasBalance } from "@/lib/kis/api";
import { classifyUsInstrumentKind } from "@/lib/market/adapters/us-kis";
import { apiCacheHeaders } from "@/lib/http-cache";

interface OverseasHoldingRow {
  symbol: string;
  name: string;
  exchangeCode: "NASD" | "NYSE" | "AMEX";
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnlAmount: number;
  pnlRate: number;
  currency: string;
  kind: "stock" | "etf";
}

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

function mapHoldingRow(
  row: Record<string, unknown>,
  exchangeCode: OverseasHoldingRow["exchangeCode"],
): OverseasHoldingRow | null {
  const symbol = firstString(row, ["ovrs_pdno", "pdno", "symb", "rsym"]).toUpperCase();
  const quantity = Math.max(0, firstNumber(row, ["ovrs_cblc_qty", "cblc_qty", "hldg_qty"]));
  if (!symbol || quantity <= 0) return null;

  const name = firstString(row, ["ovrs_item_name", "prdt_name", "item_name", "symb_name"]) || symbol;
  const averagePrice = firstNumber(row, ["pchs_avg_pric", "avg_pric", "pchs_unpr"]);
  const currentPrice = firstNumber(row, ["now_pric2", "ovrs_now_pric1", "ovrs_now_pric", "last"]);
  const pnlAmount = firstNumber(row, ["frcr_evlu_pfls_amt", "evlu_pfls_amt", "evlu_pfls_smtl_amt"]);
  const pnlRate = firstNumber(row, ["evlu_pfls_rt1", "evlu_pfls_rt", "evlu_erng_rt"]);
  const currency = firstString(row, ["tr_crcy_cd", "crcy_cd"]) || "USD";

  return {
    symbol,
    name,
    exchangeCode,
    quantity,
    averagePrice,
    currentPrice,
    pnlAmount,
    pnlRate,
    currency,
    kind: classifyUsInstrumentKind(symbol, name),
  };
}

export async function GET() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) {
      return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
    }

    const active = await getActiveKisConfig("us");
    if (!active) {
      return NextResponse.json(
        { configured: false, connected: false, holdings: [] },
        { headers: apiCacheHeaders.realtime },
      );
    }

    const token = await getToken(active.config.appKey, active.config.appSecret);
    const credentials = {
      appKey: active.config.appKey,
      appSecret: active.config.appSecret,
      accountNo: active.config.accountNo,
      accountProductCode: active.config.accountProductCode,
      token,
    };

    const exchanges: Array<OverseasHoldingRow["exchangeCode"]> = ["NASD", "NYSE", "AMEX"];
    const settled = await Promise.allSettled(
      exchanges.map(async (exchangeCode) => {
        const payload = await getOverseasBalance(credentials, exchangeCode, "USD");
        const rows = Array.isArray(payload?.output1) ? payload.output1 as Array<Record<string, unknown>> : [];
        return rows
          .map((row) => mapHoldingRow(row, exchangeCode))
          .filter((row): row is OverseasHoldingRow => row !== null);
      }),
    );

    const holdings = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const totalUsd = holdings.reduce((sum, item) => sum + item.currentPrice * item.quantity, 0);

    return NextResponse.json(
      {
        configured: true,
        connected: true,
        profileId: active.profileId,
        holdings,
        summary: {
          totalUsd,
          positionCount: holdings.length,
        },
      },
      { headers: apiCacheHeaders.realtime },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        holdings: [],
        error: error instanceof Error ? error.message : "해외 잔고 조회 실패",
      },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }
}
