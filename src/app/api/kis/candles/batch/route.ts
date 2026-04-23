import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";

const MAX_BATCH = 20;

async function fetchCandles(
  code: string,
  cfg: { app_key: string; app_secret: string; token: string }
): Promise<number[]> {
  const url = new URL("https://openapivts.koreainvestment.com:29443/uapi/domestic-stock/v1/quotations/inquire-daily-price");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_PERIOD_DIV_CODE", "D");
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${cfg.token}`,
      appkey: cfg.app_key,
      appsecret: cfg.app_secret,
      tr_id: "FHKST01010400",
    },
  });
  if (!res.ok) return [];

  const data = await res.json();
  const output: { stck_clpr?: string }[] = Array.isArray(data.output) ? data.output : [];
  return output
    .slice(0, 10)
    .map((item) => Number(item.stck_clpr ?? 0))
    .filter((v) => v > 0)
    .reverse();
}

// POST /api/kis/candles/batch — 최대 20개 종목 캔들 일괄 조회 (100ms 간격)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const codes: string[] = Array.isArray(body?.codes) ? body.codes.slice(0, MAX_BATCH) : [];

    if (codes.length === 0) {
      return NextResponse.json({ error: "codes 배열 필수 (최대 20개)" }, { status: 400 });
    }

    const invalid = codes.filter((c) => !/^\d{6}$/.test(c));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `유효하지 않은 종목코드: ${invalid.join(", ")}` }, { status: 400 });
    }

    const { data: cfg } = await supabase
      .from("kis_config")
      .select("app_key, app_secret, token")
      .eq("id", "default")
      .maybeSingle();

    if (!cfg?.app_key || !cfg?.token) {
      return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400 });
    }

    const result: Record<string, number[]> = {};
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      try {
        result[code] = await fetchCandles(code, cfg as { app_key: string; app_secret: string; token: string });
      } catch { result[code] = []; }
      if (i < codes.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return NextResponse.json({ candles: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "캔들 일괄 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
