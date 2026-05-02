import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";
import { KIS_API_BASE, KIS_TR } from "@/lib/constants";
import { getKstNowParts, getMarketClosureReason } from "@/lib/engine/market-calendar";
import { runLearning } from "@/lib/learning";
import { getKisCredentialCandidates, persistKisConfig } from "@/lib/kis/runtime-config";

async function issueKisToken(appKey: string, appSecret: string): Promise<{ ok: true; token: string } | { ok: false; detail: string }> {
  const tokenRes = await fetch(`${KIS_API_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text().catch(() => "");
    return { ok: false, detail: `${tokenRes.status} ${errBody.slice(0, 200)}`.trim() };
  }

  const tokenData = await tokenRes.json();
  return { ok: true, token: tokenData.access_token as string };
}

async function resolveObserverKisCredentials(): Promise<
  | { ok: true; appKey: string; appSecret: string; token: string }
  | { ok: false; detail: string }
> {
  const candidates = await getKisCredentialCandidates();
  if (candidates.length === 0) {
    return { ok: false, detail: "KIS 자격증명 미설정 (kis_config / env)" };
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    const tokenResult = await issueKisToken(candidate.config.appKey, candidate.config.appSecret);
    if (tokenResult.ok) {
      if (candidate.source === "env") {
        await persistKisConfig(candidate.config);
      }
      return {
        ok: true,
        appKey: candidate.config.appKey,
        appSecret: candidate.config.appSecret,
        token: tokenResult.token,
      };
    }
    failures.push(`${candidate.source}:${tokenResult.detail}`);
  }

  return { ok: false, detail: `KIS 토큰 발급 실패: ${failures.join(" | ")}` };
}

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503 });
  }

  const { data: appConfigs } = await supabase.from("app_config").select("key, value");
  const cfgMap = new Map((appConfigs || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const closureReason = getMarketClosureReason(cfgMap);
  if (closureReason) {
    return NextResponse.json({
      skipped: true,
      reason: closureReason,
    });
  }

  const today = getKstNowParts().date;
  const nowUtc = new Date();
  const isLearningDay = nowUtc.getUTCDay() === 1; // UTC 월요일

  // ── 학습 실행: KIS 토큰과 무관하게 월요일에 항상 시도 ──
  let learningResult: { confidence?: string; sampleSize?: number } | null = null;
  if (isLearningDay) {
    try {
      const result = await runLearning();
      learningResult = { confidence: result.confidence, sampleSize: result.sampleSize };
    } catch { /* 학습 실패해도 observer 결과에 영향 없음 */ }
  }

  // ── 당일 이미 수집했으면 스킵 ──
  const { data: existing } = await supabase.from("market_snapshots").select("id").eq("date", today).limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({
      skipped: true, reason: "당일 스냅샷 이미 존재",
      ...(learningResult ? { learning: learningResult } : {}),
    });
  }

  // ── watchlist 조회 후 비어있으면 토큰 발급 없이 스킵 ──
  const { data: watchlistData } = await supabase.from("watchlist").select("code, name").eq("active", true);
  const watchlist = watchlistData || [];
  if (watchlist.length === 0) {
    return NextResponse.json({
      skipped: true, reason: "watchlist 비어있음",
      ...(learningResult ? { learning: learningResult } : {}),
    });
  }

  // ── 시장 스냅샷 수집: KIS 토큰 필요 ──
  const resolved = await resolveObserverKisCredentials();
  if (!resolved.ok) {
    return NextResponse.json({
      captured: 0,
      tokenError: resolved.detail,
      ...(learningResult ? { learning: learningResult } : {}),
    });
  }
  const { appKey, appSecret, token } = resolved;

  const kis = {
    "Content-Type": "application/json; charset=utf-8",
    authorization: `Bearer ${token}`,
    appkey: appKey,
    appsecret: appSecret,
    tr_id: KIS_TR.PRICE,
  };

  const snapshots: { stock_code: string; stock_name: string; open_price: number; snapshot_price: number; snapshot_volume: number; date: string }[] = [];

  for (const { code, name } of watchlist) {
    try {
      const params = new URLSearchParams({ fid_cond_mrkt_div_code: "J", fid_input_iscd: code });
      const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`, { headers: kis });
      if (!res.ok) continue;
      const { output } = await res.json();
      if (!output) continue;

      snapshots.push({
        stock_code: code,
        stock_name: name || output.hts_kor_isnm || code,
        open_price: Number(output.stck_oprc) || 0,
        snapshot_price: Number(output.stck_prpr) || 0,
        snapshot_volume: Number(output.acml_vol) || 0,
        date: today,
      });
    } catch { /* skip */ }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (snapshots.length > 0) {
    await supabase.from("market_snapshots").insert(snapshots);
  }

  return NextResponse.json({
    captured: snapshots.length,
    stocks: snapshots.map((s) => s.stock_code),
    ...(learningResult ? { learning: learningResult } : {}),
  });
}
