import { NextRequest, NextResponse } from "next/server";
import { getToken, KISError } from "@/lib/kis/api";
import { sendKISApiErrorAlert } from "@/lib/engine/notify";

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  try {
    const body = await req.json().catch(() => ({}));
    const { appKey, appSecret } = body ?? {};
    if (!appKey || !appSecret) {
      return NextResponse.json({ error: "appKey, appSecret이 필요합니다" }, { status: 400 });
    }
    const token = await getToken(appKey, appSecret);
    return NextResponse.json({ token });
  } catch (e: unknown) {
    if (e instanceof KISError) {
      // appKey/appSecret 절대 포함 금지 — kisCode/kisMessage만 전송
      await sendKISApiErrorAlert({
        operation: "token",
        httpStatus: e.status,
        kisCode: e.kisCode,
        kisMessage: e.detail?.slice(0, 200),
        timestamp,
      }).catch(() => {});
      const statusCode = e.status === 401 || e.status === 403 ? e.status : 400;
      return NextResponse.json(
        { error: "토큰 발급 실패", kisCode: e.kisCode, kisMessage: e.detail },
        { status: statusCode },
      );
    }
    await sendKISApiErrorAlert({
      operation: "token",
      kisMessage: e instanceof Error ? e.message.slice(0, 200) : "알 수 없는 오류",
      timestamp,
    }).catch(() => {});
    return NextResponse.json({ error: "서버 내부 오류" }, { status: 500 });
  }
}
