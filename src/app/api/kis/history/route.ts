import { NextRequest, NextResponse } from "next/server";
import { getOrderHistory } from "@/lib/kis/api";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const appKey = searchParams.get("appKey");
    const appSecret = searchParams.get("appSecret");
    const token = searchParams.get("token");
    const accountNo = searchParams.get("accountNo");
    const accountProductCode = searchParams.get("accountProductCode") ?? "01";

    if (!appKey || !appSecret || !token || !accountNo) {
      return NextResponse.json({ error: "appKey, appSecret, token, accountNo 필수" }, { status: 400 });
    }

    const data = await getOrderHistory({ appKey, appSecret, accountNo, accountProductCode, token });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "주문 내역 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
