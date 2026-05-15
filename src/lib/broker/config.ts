import { supabase } from "@/lib/supabase/api-client";
import { createDefaultBrokerDirectory, createDefaultBrokerDirectoryEntry } from "./catalog";
import { DEFAULT_BROKER_ID, getBrokerLabel, normalizeBrokerId } from "./registry";
import type { BrokerDirectoryEntry, BrokerId } from "./types";

const ACTIVE_BROKER_CONFIG_KEY = "active_broker_id";
const BROKER_DIRECTORY_CONFIG_KEY = "broker_directory";

function normalizeBrokerDirectoryEntry(input: unknown, brokerId: BrokerId): BrokerDirectoryEntry {
  const base = createDefaultBrokerDirectoryEntry(brokerId);
  const source = typeof input === "object" && input ? input as Partial<BrokerDirectoryEntry> : null;
  const credentials = typeof source?.credentials === "object" && source.credentials
    ? source.credentials
    : null;

  return {
    brokerId,
    enabled: typeof source?.enabled === "boolean" ? source.enabled : base.enabled,
    connectionMode:
      source?.connectionMode === "live" || source?.connectionMode === "paper" || source?.connectionMode === "planned"
        ? source.connectionMode
        : base.connectionMode,
    credentials: {
      apiKey: typeof credentials?.apiKey === "string" ? credentials.apiKey : "",
      apiSecret: typeof credentials?.apiSecret === "string" ? credentials.apiSecret : "",
      accountNo: typeof credentials?.accountNo === "string" ? credentials.accountNo : "",
      accountProductCode: typeof credentials?.accountProductCode === "string" ? credentials.accountProductCode : "",
      clientId: typeof credentials?.clientId === "string" ? credentials.clientId : "",
      userId: typeof credentials?.userId === "string" ? credentials.userId : "",
    },
    memo: typeof source?.memo === "string" ? source.memo : "",
    updatedAt: typeof source?.updatedAt === "string" ? source.updatedAt : null,
  };
}

function parseBrokerDirectoryValue(value: unknown): Record<BrokerId, BrokerDirectoryEntry> {
  const defaults = createDefaultBrokerDirectory();
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  const source = typeof parsed === "object" && parsed ? parsed as Record<string, unknown> : {};

  (Object.keys(defaults) as BrokerId[]).forEach((brokerId) => {
    defaults[brokerId] = normalizeBrokerDirectoryEntry(source[brokerId], brokerId);
  });

  return defaults;
}

export async function resolveActiveBrokerId(): Promise<BrokerId> {
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", ACTIVE_BROKER_CONFIG_KEY)
    .maybeSingle();

  return normalizeBrokerId(typeof data?.value === "string" ? data.value : DEFAULT_BROKER_ID);
}

export async function resolveActiveBrokerState(): Promise<{ brokerId: BrokerId; brokerLabel: string }> {
  const brokerId = await resolveActiveBrokerId();
  return {
    brokerId,
    brokerLabel: getBrokerLabel(brokerId),
  };
}

export async function persistActiveBrokerId(brokerId?: string | null): Promise<BrokerId> {
  const normalized = normalizeBrokerId(brokerId);
  await supabase.from("app_config").upsert({
    key: ACTIVE_BROKER_CONFIG_KEY,
    value: normalized,
    updated_at: new Date().toISOString(),
  });
  return normalized;
}

export async function resolveBrokerDirectory(): Promise<Record<BrokerId, BrokerDirectoryEntry>> {
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", BROKER_DIRECTORY_CONFIG_KEY)
    .maybeSingle();

  return parseBrokerDirectoryValue(data?.value);
}

export async function persistBrokerDirectory(directory: Record<BrokerId, BrokerDirectoryEntry>) {
  await supabase.from("app_config").upsert({
    key: BROKER_DIRECTORY_CONFIG_KEY,
    value: JSON.stringify(directory),
    updated_at: new Date().toISOString(),
  });
}

export async function persistBrokerDirectoryEntry(
  brokerId: BrokerId,
  entry: BrokerDirectoryEntry,
): Promise<Record<BrokerId, BrokerDirectoryEntry>> {
  const nextDirectory = await resolveBrokerDirectory();
  nextDirectory[brokerId] = normalizeBrokerDirectoryEntry(entry, brokerId);
  await persistBrokerDirectory(nextDirectory);
  return nextDirectory;
}
