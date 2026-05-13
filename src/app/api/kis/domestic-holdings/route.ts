import { NextResponse } from "next/server";
import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { getBalance } from "@/lib/kis/api";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import { KIS_RUNTIME_MODE } from "@/lib/constants";
import { apiCacheHeaders } from "@/lib/http-cache";

interface DomesticHoldingRow {
  code: string;
  name: string;
  market: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnlAmount: number;
  pnlRate: number;
}

export async function GET() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) {
      return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
    }

    const profileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
    const active = await getActiveKisConfig(profileId);
    if (!active) {
      return NextResponse.json(
        { configured: false, connected: false, holdings: [] },
        { headers: apiCacheHeaders.realtime },
      );
    }

    const token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
    const payload = await getBalance({
      appKey: active.config.appKey,
      appSecret: active.config.appSecret,
      accountNo: active.config.accountNo,
      accountProductCode: active.config.accountProductCode,
      token,
    });

    const rows = Array.isArray(payload?.output1) ? payload.output1 as Array<Record<string, unknown>> : [];
    const holdings = rows.map((row) => ({
      code: String(row.pdno ?? ""),
      name: String(row.prdt_name ?? row.pdno ?? ""),
      market: "KOSPI",
      quantity: Number(row.hldg_qty) || 0,
      averagePrice: Number(row.pchs_avg_pric) || 0,
      currentPrice: Number(row.prpr) || 0,
      pnlAmount: Number(row.evlu_pfls_amt) || 0,
      pnlRate: Number(row.evlu_pfls_rt) || 0,
    })).filter((row): row is DomesticHoldingRow => Boolean(row.code) && row.quantity > 0);

    return NextResponse.json(
      {
        configured: true,
        connected: true,
        profileId: active.profileId,
        holdings,
        summary: {
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
        error: error instanceof Error ? error.message : "국내 잔고 조회 실패",
      },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }
}
