import { NextResponse } from "next/server";
import { requireSessionWriteRequest } from "@/lib/request-guard";
import { getBrokerLabel, normalizeBrokerId } from "@/lib/broker/registry";
import { persistActiveBrokerId, persistBrokerDirectory, resolveActiveBrokerId, resolveBrokerDirectory } from "@/lib/broker/config";
import { createDefaultBrokerDirectoryEntry } from "@/lib/broker/catalog";
import type { BrokerCredentialFields, BrokerDirectoryEntry, BrokerId } from "@/lib/broker/types";

function normalizeDirectoryEntry(input: unknown, brokerId: BrokerId): BrokerDirectoryEntry {
  const base = createDefaultBrokerDirectoryEntry(brokerId);
  const source = typeof input === "object" && input ? input as Partial<BrokerDirectoryEntry> : {};
  const credentials: Partial<BrokerCredentialFields> =
    typeof source.credentials === "object" && source.credentials ? source.credentials as Partial<BrokerCredentialFields> : {};

  return {
    brokerId,
    enabled: typeof source.enabled === "boolean" ? source.enabled : base.enabled,
    connectionMode:
      source.connectionMode === "planned" || source.connectionMode === "paper" || source.connectionMode === "live"
        ? source.connectionMode
        : base.connectionMode,
    credentials: {
      apiKey: typeof credentials.apiKey === "string" ? credentials.apiKey : "",
      apiSecret: typeof credentials.apiSecret === "string" ? credentials.apiSecret : "",
      accountNo: typeof credentials.accountNo === "string" ? credentials.accountNo : "",
      accountProductCode: typeof credentials.accountProductCode === "string" ? credentials.accountProductCode : "",
      clientId: typeof credentials.clientId === "string" ? credentials.clientId : "",
      userId: typeof credentials.userId === "string" ? credentials.userId : "",
    },
    memo: typeof source.memo === "string" ? source.memo : "",
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const [activeBrokerId, directory] = await Promise.all([
    resolveActiveBrokerId(),
    resolveBrokerDirectory(),
  ]);

  return NextResponse.json({
    activeBrokerId,
    activeBrokerLabel: getBrokerLabel(activeBrokerId),
    brokers: directory,
  });
}

export async function POST(req: Request) {
  const guard = requireSessionWriteRequest(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const nextActiveBrokerId = normalizeBrokerId(typeof body?.activeBrokerId === "string" ? body.activeBrokerId : undefined);
  const currentDirectory = await resolveBrokerDirectory();
  const rawBrokers = typeof body?.brokers === "object" && body.brokers ? body.brokers as Record<string, unknown> : {};
  const nextDirectory = { ...currentDirectory };

  (Object.keys(currentDirectory) as BrokerId[]).forEach((brokerId) => {
    if (brokerId in rawBrokers) {
      nextDirectory[brokerId] = normalizeDirectoryEntry(rawBrokers[brokerId], brokerId);
    }
  });

  await Promise.all([
    persistActiveBrokerId(nextActiveBrokerId),
    persistBrokerDirectory(nextDirectory),
  ]);

  return NextResponse.json({
    success: true,
    activeBrokerId: nextActiveBrokerId,
    activeBrokerLabel: getBrokerLabel(nextActiveBrokerId),
    brokers: nextDirectory,
  });
}
