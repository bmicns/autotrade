import { NextRequest, NextResponse } from "next/server";
import { KIS_VTS_BASE } from "@/lib/constants";

// 일별 시세 조회 (기술지표 계산용 — 최근 60일)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code");
    const appKey = searchParams.get("appKey");
    const appSecret = searchParams.get("appSecret");
    const token = searchParams.get("token");

    if (!code || !appKey || !appSecret || !token) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    const params = new URLSearchParams({
      fid_cond_mrkt_div_code: "J",
      fid_input_iscd: code,
      fid_input_date_1: "",  // 빈 값이면 최근부터
      fid_input_date_2: "",
      fid_period_div_code: "D",  // D=일, W=주, M=월
      fid_org_adj_prc: "0",     // 수정주가 미반영
    });

    const res = await fetch(
      `${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          authorization: `Bearer ${token}`,
          appkey: appKey,
          appsecret: appSecret,
          tr_id: "FHKST03010100",
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `KIS daily price error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "일별 시세 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
