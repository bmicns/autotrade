import type { BrokerDirectoryEntry, BrokerId } from "@/lib/broker/types";

export type KISProfileId = "default" | "kr" | "us";

export interface KISProfileState {
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountProductCode: string;
  token?: string;
  tokenExpiry?: string;
  source?: "env" | "db" | null;
  runtimeMode?: string;
  apiBaseUrl?: string;
  hasEnvConfig?: boolean;
  hasDbConfig?: boolean;
  saved: boolean;
  testing: boolean;
  testResult: string | null;
  loading: boolean;
  resetting: boolean;
}

export interface BrokerSettingsState {
  activeBrokerId: BrokerId;
  directory: Record<BrokerId, BrokerDirectoryEntry>;
  loading: boolean;
  saving: boolean;
  result: string | null;
}
