import { NextRequest, NextResponse } from "next/server";
import { getBalance, KISError } from "@/lib/kis/api";
import { sendKISApiErrorAlert } from "@/lib/engine/notify";

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  try {
    const body = await req.json() as {
      appKey?: string;
      appSecret?: string;
      token?: string;
      accountNo?: string;
    };
    const { appKey, appSecret, token, accountNo } = body;

    if (!appKey || !appSecret || !token || !accountNo) {
      return NextResponse.json({ error: "appKey, appSecret, token, accountNo 필수" }, { status: 400 });
    }

    const data = await getBalance({ appKey, appSecret, accountNo, token });
    return NextResponse.json(data);
  } catch (e: unknown) {
    if (e instanceof KISError) {
      await sendKISApiErrorAlert({
        operation: "balance",
        httpStatus: e.status,
        kisCode: e.kisCode,
        kisMessage: e.detail?.slice(0, 200),
        timestamp,
      }).catch(() => {});
      if (e.status === 401) {
        return NextResponse.json(
          { error: "토큰이 만료되었습니다", kisCode: e.kisCode },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { error: "잔고 조회 실패", kisCode: e.kisCode, kisMessage: e.detail },
        { status: 500 },
      );
    }
    await sendKISApiErrorAlert({
      operation: "balance",
      kisMessage: e instanceof Error ? e.message.slice(0, 200) : "알 수 없는 오류",
      timestamp,
    }).catch(() => {});
    return NextResponse.json({ error: "잔고 조회 실패" }, { status: 500 });
  }
}
