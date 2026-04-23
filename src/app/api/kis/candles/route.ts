import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";

// ⚠️ 서버리스(Vercel) 환경에서 인메모리 rate limit은 인스턴스별로 독립 동작합니다.
// 여러 인스턴스가 병렬 실행될 경우 실제 허용량이 RATE_LIMIT×N회가 됩니다.
// KIS 분당 TPS(~20)를 감안해 단일 인스턴스 기준도 보수적으로 설정합니다.
// 분산 rate limit이 필요하다면 Upstash Redis 또는 Supabase 기반으로 교체하세요.
const RATE_LIMIT = 15;
const WINDOW_MS  = 60_000;
let windowStart = Date.now();
let reqCount    = 0;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) { windowStart = now; reqCount = 0; }
  if (reqCount >= RATE_LIMIT) return false;
  reqCount++;
  return true;
}

export async function GET(req: NextRequest) {
  try {
    if (!checkRateLimit()) {
      return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
    }

    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "code 파라미터 필수" }, { status: 400 });
    }

    // code 형식 검증 (KIS 종목코드는 6자리 숫자)
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "유효하지 않은 종목코드입니다" }, { status: 400 });
    }

    const { data: cfg } = await supabase
      .from("kis_config")
      .select("app_key, app_secret, token")
      .eq("id", "default")
      .maybeSingle();

    if (!cfg?.app_key || !cfg?.token) {
      return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400 });
    }

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

    if (!res.ok) {
      return NextResponse.json({ error: `KIS API 오류: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    const output: { stck_clpr?: string }[] = Array.isArray(data.output) ? data.output : [];

    const candles = output
      .slice(0, 10)
      .map((item) => Number(item.stck_clpr ?? 0))
      .filter((v) => v > 0)
      .reverse();

    return NextResponse.json({ candles });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "캔들 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
