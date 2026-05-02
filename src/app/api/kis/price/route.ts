import { NextRequest, NextResponse } from "next/server";
import { getPrice } from "@/lib/kis/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      code?: string;
      appKey?: string;
      appSecret?: string;
      token?: string;
      accountNo?: string;
    };
    const { code, appKey, appSecret, token, accountNo = "" } = body;

    if (!code || !appKey || !appSecret || !token) {
      return NextResponse.json({ error: "code, appKey, appSecret, token 필수" }, { status: 400 });
    }

    const data = await getPrice({ appKey, appSecret, accountNo, token }, code);
    return NextResponse.json(data);
  } catch (e: unknown) {
    console.error("[price] 시세 조회 오류:", e);
    return NextResponse.json({ error: "시세 조회 실패" }, { status: 500 });
  }
}
