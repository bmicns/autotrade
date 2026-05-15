import type { BrokerBalanceResult, BrokerId, BrokerStockPrice } from "../types";
import type { BrokerAdapter, BrokerBalancePayload, BrokerHealthStatus, BrokerManualOrderPayload, BrokerPricePayload, BrokerServiceResult, DomesticExecutionContextResult } from "../adapter-contract";
import { getBrokerLabel } from "../registry";

function unsupportedResult(label: string, capability: string): BrokerServiceResult<unknown> {
  return {
    ok: false,
    status: 501,
    body: { error: `${label} ${capability}는 아직 구현되지 않았습니다` },
  };
}

function unsupportedHealth(id: BrokerId, label: string): { status: BrokerHealthStatus; httpStatus: number } {
  return {
    status: {
      connected: false,
      lastChecked: new Date(Date.now() + 9 * 3600000).toISOString().replace("Z", "+09:00"),
      latencyMs: 0,
      brokerId: id,
      brokerLabel: label,
      errorMessage: `${label} 헬스체크는 아직 구현되지 않았습니다`,
    },
    httpStatus: 501,
  };
}

export function createPlannedBrokerAdapter(id: BrokerId): BrokerAdapter {
  const label = getBrokerLabel(id);
  return {
    id,
    label,
    implementationStatus: "planned",
    fetchPrice: async (_payload: BrokerPricePayload) => unsupportedResult(label, "시세 조회"),
    fetchBalance: async (_payload: BrokerBalancePayload) => unsupportedResult(label, "잔고 조회"),
    checkHealth: async () => unsupportedHealth(id, label),
    placeManualOrder: async (_payload: BrokerManualOrderPayload) => unsupportedResult(label, "주문 라우트"),
    resolveDomesticExecutionContext: async (): Promise<DomesticExecutionContextResult> => ({
      ok: false,
      status: 501,
      error: `${label} 국내 주문 실행은 아직 구현되지 않았습니다`,
    }),
    fetchClientPrice: async (_config, _stockCode): Promise<BrokerStockPrice | null> => null,
    fetchClientPrices: async (_config, _codes): Promise<Map<string, BrokerStockPrice>> => new Map(),
    fetchClientBalance: async (_config): Promise<BrokerBalanceResult | null> => null,
  };
}
