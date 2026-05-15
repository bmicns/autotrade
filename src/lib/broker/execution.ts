import { KIS_RUNTIME_MODE } from "@/lib/constants";
import type { EngineConfig } from "@/lib/engine/types";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import { resolveActiveBrokerState } from "./config";

export async function resolveActiveDomesticExecutionContext(): Promise<
  | {
      ok: true;
      brokerId: "kis";
      brokerLabel: string;
      profileId: string;
      source: string;
      engineConfig: EngineConfig;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const brokerState = await resolveActiveBrokerState();
  if (brokerState.brokerId !== "kis") {
    return {
      ok: false,
      status: 501,
      error: `${brokerState.brokerLabel} 국내 주문 실행은 아직 구현되지 않았습니다`,
    };
  }

  const domesticProfileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
  const active = await getActiveKisConfig(domesticProfileId);
  if (!active) {
    return {
      ok: false,
      status: 400,
      error: `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 설정이 없습니다`,
    };
  }

  let token: string;
  try {
    token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "국내 KIS 토큰 발급 실패";
    return {
      ok: false,
      status: 500,
      error: `국내 KIS 토큰 오류 (${active.source}/${active.profileId}): ${message}`,
    };
  }

  return {
    ok: true,
    brokerId: "kis",
    brokerLabel: brokerState.brokerLabel,
    profileId: active.profileId,
    source: active.source,
    engineConfig: {
      appKey: active.config.appKey,
      appSecret: active.config.appSecret,
      accountNo: active.config.accountNo,
      accountProductCode: active.config.accountProductCode,
      token,
      stopLoss: -2,
      trailingStop: -3,
      maxPerTrade: 0,
      maxDailyTrades: 1,
      partialExitRatio: 50,
      dailyLossLimit: -3,
      maxHoldDays: 1,
      dynamicRisk: true,
    },
  };
}
