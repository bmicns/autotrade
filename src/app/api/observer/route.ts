import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KIS_VTS_BASE, KIS_TR } from "@/lib/constants";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    return NextResponse.json({ error: "KIS 환경변수 미설정" }, { status: 400 });
  }

  // 토큰 발급
  const tokenRes = await fetch(`${KIS_VTS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });
  if (!tokenRes.ok) return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
  const { access_token: token } = await tokenRes.json();

  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  // 당일 이미 수집했으면 skip
  const { data: existing } = await supabase.from("market_snapshots").select("id").eq("date", today).limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ skipped: true, reason: "당일 스냅샷 이미 존재" });
  }

  // watchlist 조회
  const { data: watchlistData } = await supabase.from("watchlist").select("code, name").eq("active", true);
  const watchlist = watchlistData || [];
  if (watchlist.length === 0) {
    return NextResponse.json({ skipped: true, reason: "watchlist 비어있음" });
  }

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
      const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`, { headers: kis });
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

  return NextResponse.json({ captured: snapshots.length, stocks: snapshots.map((s) => s.stock_code) });
}
