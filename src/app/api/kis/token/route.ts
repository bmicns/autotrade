import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/kis/api";

export async function POST(req: NextRequest) {
  try {
    const { appKey, appSecret } = await req.json();
    if (!appKey || !appSecret) {
      return NextResponse.json({ error: "appKey, appSecret 필수" }, { status: 400 });
    }
    const token = await getToken(appKey, appSecret);
    return NextResponse.json({ token });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "토큰 발급 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
