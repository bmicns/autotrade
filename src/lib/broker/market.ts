import type { BrokerId } from "./types";
import { getBrokerAdapter } from "./adapter";
import type { BrokerBalancePayload, BrokerPricePayload } from "./adapter-contract";

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

  return { code, appKey, appSecret, token, accountNo, accountProductCode } satisfies BrokerPricePayload;
}

export async function fetchBrokerPrice(
  brokerId: BrokerId,
  payload: ReturnType<typeof validateBrokerPricePayload> & { error?: undefined },
) {
  const adapter = getBrokerAdapter(brokerId);
  return adapter.fetchPrice(payload);
}

export function validateBrokerBalancePayload(input: Record<string, unknown>) {
  const appKey = typeof input.appKey === "string" ? input.appKey : "";
  const appSecret = typeof input.appSecret === "string" ? input.appSecret : "";
  const token = typeof input.token === "string" ? input.token : "";
  const accountNo = typeof input.accountNo === "string" ? input.accountNo : "";
  const accountProductCode = typeof input.accountProductCode === "string" ? input.accountProductCode : "01";

  return { appKey, appSecret, token, accountNo, accountProductCode } satisfies BrokerBalancePayload;
}

export async function fetchBrokerBalance(
  brokerId: BrokerId,
  payload: ReturnType<typeof validateBrokerBalancePayload> & { error?: undefined },
) {
  const adapter = getBrokerAdapter(brokerId);
  return adapter.fetchBalance(payload);
}
