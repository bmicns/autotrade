import { fetchBalance as fetchKisBalance, fetchPrice as fetchKisPrice, fetchPrices as fetchKisPrices } from "@/lib/kis/client";
import type { KISConfig } from "@/lib/store";
import { DEFAULT_BROKER_ID, normalizeBrokerId } from "./registry";
import type { BrokerBalanceResult, BrokerStockPrice } from "./types";

interface BrokerClientParams {
  brokerId?: string | null;
  config: KISConfig;
}

export async function fetchBrokerPrice(params: BrokerClientParams, stockCode: string): Promise<BrokerStockPrice | null> {
  const brokerId = normalizeBrokerId(params.brokerId ?? params.config.brokerId ?? DEFAULT_BROKER_ID);
  if (brokerId !== "kis") {
    return null;
  }
  return fetchKisPrice(params.config, stockCode);
}

export async function fetchBrokerPrices(params: BrokerClientParams, codes: string[]): Promise<Map<string, BrokerStockPrice>> {
  const brokerId = normalizeBrokerId(params.brokerId ?? params.config.brokerId ?? DEFAULT_BROKER_ID);
  if (brokerId !== "kis") {
    return new Map();
  }
  return fetchKisPrices(params.config, codes);
}

export async function fetchBrokerBalance(params: BrokerClientParams): Promise<BrokerBalanceResult | null> {
  const brokerId = normalizeBrokerId(params.brokerId ?? params.config.brokerId ?? DEFAULT_BROKER_ID);
  if (brokerId !== "kis") {
    return null;
  }
  return fetchKisBalance(params.config);
}
