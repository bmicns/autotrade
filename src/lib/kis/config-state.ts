import { KIS_API_BASE, KIS_RUNTIME_MODE } from "../constants";
import type { KISConfigSource, RuntimeKisConfig } from "./runtime-config";

export interface KISConfigState {
  appKey: string;
  appSecret: string;
  accountNo: string;
  source: KISConfigSource | null;
  runtimeMode: string;
  apiBaseUrl: string;
  hasEnvConfig: boolean;
  hasDbConfig: boolean;
}

export function buildKisConfigState(params: {
  active: { source: KISConfigSource; config: RuntimeKisConfig } | null;
  envConfig: RuntimeKisConfig | null;
  dbConfig: RuntimeKisConfig | null;
}): KISConfigState {
  return {
    appKey: params.active?.config.appKey ?? "",
    appSecret: params.active?.config.appSecret ?? "",
    accountNo: params.active?.config.accountNo ?? "",
    source: params.active?.source ?? null,
    runtimeMode: KIS_RUNTIME_MODE,
    apiBaseUrl: KIS_API_BASE,
    hasEnvConfig: !!params.envConfig,
    hasDbConfig: !!params.dbConfig,
  };
}
