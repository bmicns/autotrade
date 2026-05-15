import { getBalance, getPrice, KISError } from "@/lib/kis/api";
import { sendKISApiErrorAlert } from "@/lib/engine/notify";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import type { BrokerId } from "./types";
import { getBrokerLabel } from "./registry";

export function validateBrokerPricePayload(input: Record<string, unknown>) {
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const appKey = typeof input.appKey === "string" ? input.appKey : "";
  const appSecret = typeof input.appSecret === "string" ? input.appSecret : "";
  const token = typeof input.token === "string" ? input.token : "";
  const accountNo = typeof input.accountNo === "string" ? input.accountNo : "";
  const accountProductCode = typeof input.accountProductCode === "string" ? input.accountProductCode : "01";

  if (!code) {
    return { error: "code 필수" };
  }

  return { code, appKey, appSecret, token, accountNo, accountProductCode };
}

export async function fetchBrokerPrice(
  brokerId: BrokerId,
  payload: ReturnType<typeof validateBrokerPricePayload> & { error?: undefined },
) {
  if (brokerId !== "kis") {
    return {
      ok: false as const,
      status: 501,
      body: { error: `${getBrokerLabel(brokerId)} 시세 조회는 아직 구현되지 않았습니다` },
    };
  }

  const active = await getActiveKisConfig();
  const fallbackConfig = active?.config ?? null;
  const appKey = payload.appKey || fallbackConfig?.appKey || "";
  const appSecret = payload.appSecret || fallbackConfig?.appSecret || "";
  const accountNo = payload.accountNo || fallbackConfig?.accountNo || "";
  const accountProductCode = payload.accountProductCode || fallbackConfig?.accountProductCode || "01";
  if (!appKey || !appSecret) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "활성 KIS 앱키/시크릿이 없습니다" },
    };
  }
  const profileId = active?.profileId ?? "default";
  const token = payload.token || await resolveKisAccessToken(profileId, appKey, appSecret);

  const data = await getPrice(
    {
      appKey,
      appSecret,
      accountNo,
      accountProductCode,
      token,
    },
    payload.code,
  );

  return {
    ok: true as const,
    status: 200,
    body: data,
  };
}

export function validateBrokerBalancePayload(input: Record<string, unknown>) {
  const appKey = typeof input.appKey === "string" ? input.appKey : "";
  const appSecret = typeof input.appSecret === "string" ? input.appSecret : "";
  const token = typeof input.token === "string" ? input.token : "";
  const accountNo = typeof input.accountNo === "string" ? input.accountNo : "";
  const accountProductCode = typeof input.accountProductCode === "string" ? input.accountProductCode : "01";

  return { appKey, appSecret, token, accountNo, accountProductCode };
}

export async function fetchBrokerBalance(
  brokerId: BrokerId,
  payload: ReturnType<typeof validateBrokerBalancePayload> & { error?: undefined },
) {
  if (brokerId !== "kis") {
    return {
      ok: false as const,
      status: 501,
      body: { error: `${getBrokerLabel(brokerId)} 잔고 조회는 아직 구현되지 않았습니다` },
    };
  }

  const timestamp = new Date().toISOString();
  try {
    const active = await getActiveKisConfig();
    const fallbackConfig = active?.config ?? null;
    const appKey = payload.appKey || fallbackConfig?.appKey || "";
    const appSecret = payload.appSecret || fallbackConfig?.appSecret || "";
    const accountNo = payload.accountNo || fallbackConfig?.accountNo || "";
    const accountProductCode = payload.accountProductCode || fallbackConfig?.accountProductCode || "01";
    if (!appKey || !appSecret || !accountNo) {
      return {
        ok: false as const,
        status: 400,
        body: { error: "활성 KIS 잔고 조회 설정이 없습니다" },
      };
    }
    const profileId = active?.profileId ?? "default";
    const token = payload.token || await resolveKisAccessToken(profileId, appKey, appSecret);
    const data = await getBalance({
      appKey,
      appSecret,
      accountNo,
      accountProductCode,
      token,
    });
    return {
      ok: true as const,
      status: 200,
      body: data,
    };
  } catch (error: unknown) {
    if (error instanceof KISError) {
      await sendKISApiErrorAlert({
        operation: "balance",
        httpStatus: error.status,
        kisCode: error.kisCode,
        kisMessage: error.detail?.slice(0, 200),
        timestamp,
      }).catch(() => {});
      if (error.status === 401) {
        return {
          ok: false as const,
          status: 401,
          body: { error: "토큰이 만료되었습니다", kisCode: error.kisCode },
        };
      }
      return {
        ok: false as const,
        status: 500,
        body: { error: "잔고 조회 실패", kisCode: error.kisCode, kisMessage: error.detail },
      };
    }

    await sendKISApiErrorAlert({
      operation: "balance",
      kisMessage: error instanceof Error ? error.message.slice(0, 200) : "알 수 없는 오류",
      timestamp,
    }).catch(() => {});

    return {
      ok: false as const,
      status: 500,
      body: { error: "잔고 조회 실패" },
    };
  }
}
