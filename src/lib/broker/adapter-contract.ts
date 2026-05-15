import type { EngineConfig, KISHealthStatus } from "@/lib/engine/types";
import type { KISConfig } from "@/lib/store";
import type { BrokerBalanceResult, BrokerId, BrokerStockPrice } from "./types";

export interface BrokerPricePayload {
  code: string;
  appKey: string;
  appSecret: string;
  token: string;
  accountNo: string;
  accountProductCode: string;
}

export interface BrokerBalancePayload {
  appKey: string;
  appSecret: string;
  token: string;
  accountNo: string;
  accountProductCode: string;
}

export interface BrokerManualOrderPayload {
  side: "buy" | "sell";
  stockCode: string;
  marketType: "kr" | "us";
  normalizedProfileId: string | null;
  normalizedNote: string;
  normalizedStockName: string;
  qty: number;
  px: number;
  exchangeCode?: string;
  orderType: string;
}

export type BrokerServiceResult<TBody> =
  | {
      ok: true;
      status: number;
      body: TBody;
    }
  | {
      ok: false;
      status: number;
      body: { error: string; [key: string]: unknown };
    };

export type BrokerHealthStatus = KISHealthStatus & {
  brokerId: BrokerId;
  brokerLabel: string;
  profileId?: string;
  source?: string;
  recovered?: boolean;
};

export interface BrokerClientParams {
  brokerId?: string | null;
  config: KISConfig;
}

export type DomesticExecutionContextResult =
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
    };

export interface BrokerAdapter {
  id: BrokerId;
  label: string;
  implementationStatus: "implemented" | "planned";
  fetchPrice(payload: BrokerPricePayload): Promise<BrokerServiceResult<unknown>>;
  fetchBalance(payload: BrokerBalancePayload): Promise<BrokerServiceResult<unknown>>;
  checkHealth(): Promise<{ status: BrokerHealthStatus; httpStatus: number }>;
  placeManualOrder(payload: BrokerManualOrderPayload): Promise<BrokerServiceResult<unknown>>;
  resolveDomesticExecutionContext(): Promise<DomesticExecutionContextResult>;
  fetchClientPrice(config: KISConfig, stockCode: string): Promise<BrokerStockPrice | null>;
  fetchClientPrices(config: KISConfig, codes: string[]): Promise<Map<string, BrokerStockPrice>>;
  fetchClientBalance(config: KISConfig): Promise<BrokerBalanceResult | null>;
}
