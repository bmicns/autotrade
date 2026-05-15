import type { KISConfig } from "@/lib/store";
import { DEFAULT_BROKER_ID, normalizeBrokerId } from "./registry";
import type { BrokerBalanceResult, BrokerStockPrice } from "./types";
import { getBrokerAdapter } from "./adapter";

interface BrokerClientParams {
  brokerId?: string | null;
  config: KISConfig;
}

export async function fetchBrokerPrice(params: BrokerClientParams, stockCode: string): Promise<BrokerStockPrice | null> {
  const brokerId = normalizeBrokerId(params.brokerId ?? params.config.brokerId ?? DEFAULT_BROKER_ID);
  return getBrokerAdapter(brokerId).fetchClientPrice(params.config, stockCode);
}

export async function fetchBrokerPrices(params: BrokerClientParams, codes: string[]): Promise<Map<string, BrokerStockPrice>> {
  const brokerId = normalizeBrokerId(params.brokerId ?? params.config.brokerId ?? DEFAULT_BROKER_ID);
  return getBrokerAdapter(brokerId).fetchClientPrices(params.config, codes);
}

export async function fetchBrokerBalance(params: BrokerClientParams): Promise<BrokerBalanceResult | null> {
  const brokerId = normalizeBrokerId(params.brokerId ?? params.config.brokerId ?? DEFAULT_BROKER_ID);
  return getBrokerAdapter(brokerId).fetchClientBalance(params.config);
}
