import { NextResponse } from "next/server";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { supabase } from "@/lib/supabase/api-client";
import { getBalance, KISError } from "@/lib/kis/api";
import { sendKISConnectionAlert } from "@/lib/engine/notify";
import type { KISHealthStatus } from "@/lib/engine/types";

// 직전 상태 인메모리 캐시 — 상태 변화 감지용 (단순화: 인메모리)
let prevConnected: boolean | null = null;

function kstNow(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().replace("Z", "+09:00");
}

export async function GET() {
  try {
    const now = kstNow();

    // 1. KIS 설정 조회 (DB 우선)
    const active = await getActiveKisConfig();
    if (!active) {
      return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400 });
    }

    // 2. 저장된 토큰 조회
    const { data: configRow } = await supabase
      .from("kis_config")
      .select("token")
      .eq("id", "default")
      .maybeSingle();

    const token = (configRow?.token as string | null) ?? null;
    if (!token) {
      return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400 });
    }

    // 3. 잔고 경량 조회로 연결 상태 확인
    const start = Date.now();
    try {
      await getBalance({ ...active.config, token });
      const latencyMs = Date.now() - start;

      // 상태 변화: 끊겼다가 복구된 경우
      if (prevConnected === false) {
        await sendKISConnectionAlert("reconnected").catch(() => {});
      }
      prevConnected = true;

      const status: KISHealthStatus = { connected: true, lastChecked: now, latencyMs };
      return NextResponse.json(status);
    } catch (e: unknown) {
      const latencyMs = Math.max(Date.now() - start, 0);
      let errorCode: string | undefined;
      let errorMessage: string | undefined;

      if (e instanceof KISError) {
        errorCode = e.kisCode;
        errorMessage = e.detail?.slice(0, 200);
      } else if (e instanceof Error) {
        errorMessage = e.message.slice(0, 200);
      }

      // 상태 변화: 연결됐다가 끊긴 경우
      if (prevConnected === true) {
        await sendKISConnectionAlert("disconnected").catch(() => {});
      }
      prevConnected = false;

      const status: KISHealthStatus = {
        connected: false,
        lastChecked: now,
        latencyMs,
        ...(errorCode && { errorCode }),
        ...(errorMessage && { errorMessage }),
      };
      return NextResponse.json(status);
    }
  } catch {
    return NextResponse.json({ error: "헬스체크 실패" }, { status: 500 });
  }
}
