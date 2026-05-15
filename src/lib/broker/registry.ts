import type { BrokerId } from "./types";

const ENV_BROKER_ID_MAP: Record<string, BrokerId> = {
  kis: "kis",
  samsung: "samsung",
  kiwoom: "kiwoom",
  nh: "nh",
  kb: "kb",
  mirae: "mirae",
  ls: "ls",
};

export const DEFAULT_BROKER_ID: BrokerId = ENV_BROKER_ID_MAP[process.env.NEXIO_BROKER_ID ?? ""] ?? "kis";

const BROKER_LABELS: Record<BrokerId, string> = {
  kis: "한국투자",
  samsung: "삼성증권",
  kiwoom: "키움증권",
  nh: "NH투자증권",
  kb: "KB증권",
  mirae: "미래에셋증권",
  ls: "LS증권",
};

export function normalizeBrokerId(value?: string | null): BrokerId {
  if (!value) return "kis";
  return ENV_BROKER_ID_MAP[value] ?? "kis";
}

export function getBrokerLabel(brokerId?: string | null): string {
  return BROKER_LABELS[normalizeBrokerId(brokerId)] ?? "브로커";
}
