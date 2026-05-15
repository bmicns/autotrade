import { getBalance, getPrice, KISError } from "@/lib/kis/api";
import { sendKISApiErrorAlert } from "@/lib/engine/notify";
import type { BrokerId } from "./types";
import { getBrokerLabel } from "./registry";

export function validateBrokerPricePayload(input: Record<string, unknown>) {
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const appKey = typeof input.appKey === "string" ? input.appKey : "";
  const appSecret = typeof input.appSecret === "string" ? input.appSecret : "";
  const token = typeof input.token === "string" ? input.token : "";
  const accountNo = typeof input.accountNo === "string" ? input.accountNo : "";
  const accountProductCode = typeof input.accountProductCode === "string" ? input.accountProductCode : "01";

  if (!code || !appKey || !appSecret || !token) {
    return { error: "code, appKey, appSecret, token 필수" };
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

  const data = await getPrice(
    {
      appKey: payload.appKey,
      appSecret: payload.appSecret,
      accountNo: payload.accountNo,
      accountProductCode: payload.accountProductCode,
      token: payload.token,
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

  if (!appKey || !appSecret || !token || !accountNo) {
    return { error: "appKey, appSecret, token, accountNo 필수" };
  }

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
    const data = await getBalance({
      appKey: payload.appKey,
      appSecret: payload.appSecret,
      accountNo: payload.accountNo,
      accountProductCode: payload.accountProductCode,
      token: payload.token,
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
