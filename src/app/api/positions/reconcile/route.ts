import { NextResponse } from "next/server";

import { KIS_RUNTIME_MODE } from "@/lib/constants";
import { getEngineLockState } from "@/lib/engine/app-config";
import { buildBrokerReconcilePlan, compareBrokerHoldingsWithDb } from "@/lib/engine/broker-sync";
import { reconcileBrokerPositionDrift, syncBrokerHoldingsToPositions } from "@/lib/engine/db";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { getBalance } from "@/lib/kis/api";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import { apiCacheHeaders } from "@/lib/http-cache";
import { requireSessionWriteRequest } from "@/lib/request-guard";

export async function POST(req: Request) {
  const guard = requireSessionWriteRequest(req);
  if (guard) return guard;

  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
  }

  const lockState = await getEngineLockState();
  if (lockState.locked) {
    return NextResponse.json(
      { error: "엔진 실행 중에는 포지션 리컨실을 실행할 수 없습니다" },
      { status: 409, headers: apiCacheHeaders.realtime },
    );
  }

  const profileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
  const active = await getActiveKisConfig(profileId);
  if (!active) {
    return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400, headers: apiCacheHeaders.realtime });
  }

  let token: string;
  try {
    token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "KIS 토큰 발급 실패";
    return NextResponse.json(
      { error: `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 토큰 오류 (${active.source}/${active.profileId}): ${detail}` },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }

  const balanceData = await getBalance({ ...active.config, token });
  const holdings = (balanceData?.output1 ?? []) as Array<Record<string, string>>;
  const { data: openPositions } = await supabase
    .from("positions")
    .select("stock_code, stock_name, entry_qty, partial_exit_qty")
    .eq("status", "open");
  const mismatchesBefore = compareBrokerHoldingsWithDb(holdings, (openPositions ?? []) as Array<Record<string, unknown>>);
  const restored = await syncBrokerHoldingsToPositions(holdings);
  const driftResolution = await reconcileBrokerPositionDrift(holdings);
  const { data: openPositionsAfter } = await supabase
    .from("positions")
    .select("stock_code, stock_name, entry_qty, partial_exit_qty")
    .eq("status", "open");
  const mismatches = compareBrokerHoldingsWithDb(holdings, (openPositionsAfter ?? []) as Array<Record<string, unknown>>);
  await recordEngineEvent({
    eventType: "position_reconciled",
    stockCode: null,
    entityTable: "operations",
    entityId: null,
    payload: {
      source: active.source,
      profileId: active.profileId,
      mismatchesBefore,
      mismatchesAfter: mismatches,
      restoredCount: restored.length,
      qtyAdjustedCount: driftResolution.qtyAdjusted.length,
      orphanedClosedCount: driftResolution.orphanedClosed.length,
      holdingCount: holdings.filter((holding) => Number(holding.hldg_qty) > 0).length,
      restored,
      qtyAdjusted: driftResolution.qtyAdjusted,
      orphanedClosed: driftResolution.orphanedClosed,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      source: active.source,
      profileId: active.profileId,
      mismatches,
      mismatchesBefore,
      restored,
      restoredCount: restored.length,
      qtyAdjusted: driftResolution.qtyAdjusted,
      qtyAdjustedCount: driftResolution.qtyAdjusted.length,
      orphanedClosed: driftResolution.orphanedClosed,
      orphanedClosedCount: driftResolution.orphanedClosed.length,
      holdingCount: holdings.filter((holding) => Number(holding.hldg_qty) > 0).length,
    },
    { headers: apiCacheHeaders.realtime },
  );
}

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
  }

  const lockState = await getEngineLockState();
  if (lockState.locked) {
    return NextResponse.json(
      { error: "엔진 실행 중에는 포지션 리컨실 미리보기를 조회할 수 없습니다" },
      { status: 409, headers: apiCacheHeaders.realtime },
    );
  }

  const profileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
  const active = await getActiveKisConfig(profileId);
  if (!active) {
    return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400, headers: apiCacheHeaders.realtime });
  }

  let token: string;
  try {
    token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "KIS 토큰 발급 실패";
    return NextResponse.json(
      { error: `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 토큰 오류 (${active.source}/${active.profileId}): ${detail}` },
      { status: 500, headers: apiCacheHeaders.realtime },
    );
  }

  const [balanceData, openPositionsRes] = await Promise.all([
    getBalance({ ...active.config, token }),
    supabase
      .from("positions")
      .select("stock_code, stock_name, entry_qty, partial_exit_qty")
      .eq("status", "open"),
  ]);

  const holdings = (balanceData?.output1 ?? []) as Array<Record<string, string>>;
  const mismatches = compareBrokerHoldingsWithDb(holdings, (openPositionsRes.data ?? []) as Array<Record<string, unknown>>);
  const plan = buildBrokerReconcilePlan(holdings, (openPositionsRes.data ?? []) as Array<Record<string, unknown>>);
  const mismatchCount = mismatches.missingInDb.length + mismatches.qtyMismatch.length + mismatches.orphanedDb.length;

  return NextResponse.json(
    {
      ok: true,
      source: active.source,
      profileId: active.profileId,
      holdingCount: holdings.filter((holding) => Number(holding.hldg_qty) > 0).length,
      mismatchCount,
      mismatches,
      plan,
      autoRecoveryNeeded: mismatchCount > 0,
    },
    { headers: apiCacheHeaders.realtime },
  );
}
