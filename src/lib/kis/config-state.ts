import { KIS_API_BASE, KIS_RUNTIME_MODE, NEXIO_ENV } from "../constants";
import type { KISConfigSource, RuntimeKisConfig } from "./runtime-config";
import { getKisProfileLabel, maskKisAccountNo } from "./profile";
import { DEFAULT_BROKER_ID, getBrokerLabel } from "../broker/registry";
import type { BrokerId } from "../broker/types";

export interface KISConfigState {
  brokerId: BrokerId;
  brokerLabel: string;
  profileId: string;
  profileLabel: string;
  appKey: string;
  appSecret: string;
  accountNo: string;
  maskedAccountNo: string;
  accountProductCode: string;
  source: KISConfigSource | null;
  runtimeMode: string;
  environment: "dev" | "paper" | "prod";
  apiBaseUrl: string;
  hasEnvConfig: boolean;
  hasDbConfig: boolean;
}

export function buildKisConfigState(params: {
  active: { source: KISConfigSource; config: RuntimeKisConfig; profileId: string } | null;
  envConfig: RuntimeKisConfig | null;
  dbConfig: RuntimeKisConfig | null;
}): KISConfigState {
  return {
    brokerId: DEFAULT_BROKER_ID,
    brokerLabel: getBrokerLabel(DEFAULT_BROKER_ID),
    profileId: params.active?.profileId ?? "default",
    profileLabel: getKisProfileLabel(params.active?.profileId ?? "default"),
    appKey: params.active?.config.appKey ?? "",
    appSecret: params.active?.config.appSecret ?? "",
    accountNo: params.active?.config.accountNo ?? "",
    maskedAccountNo: maskKisAccountNo(params.active?.config.accountNo ?? ""),
    accountProductCode: params.active?.config.accountProductCode ?? "01",
    source: params.active?.source ?? null,
    runtimeMode: KIS_RUNTIME_MODE,
    environment: NEXIO_ENV,
    apiBaseUrl: KIS_API_BASE,
    hasEnvConfig: !!params.envConfig,
    hasDbConfig: !!params.dbConfig,
  };
}
