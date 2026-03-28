import { NextRequest, NextResponse } from "next/server";
import { getPrice } from "@/lib/kis/api";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code");
    const appKey = searchParams.get("appKey");
    const appSecret = searchParams.get("appSecret");
    const token = searchParams.get("token");
    const accountNo = searchParams.get("accountNo") ?? "";

    if (!code || !appKey || !appSecret || !token) {
      return NextResponse.json({ error: "code, appKey, appSecret, token 필수" }, { status: 400 });
    }

    const data = await getPrice({ appKey, appSecret, accountNo, token }, code);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "시세 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
