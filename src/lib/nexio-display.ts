import { getKisProfileLabel } from "@/lib/kis/profile";

const STRATEGY_LABELS: Record<string, string> = {
  watchlist_pullback: "관심종목",
  surge_momentum: "급등모멘텀",
  institutional_follow: "기관추종",
};

const CONFIG_SOURCE_LABELS: Record<string, string> = {
  db: "DB설정",
  env: "ENV",
};

export function getStrategyLabel(strategyKey?: string | null): string {
  if (!strategyKey) return "미분류";
  return STRATEGY_LABELS[strategyKey] ?? strategyKey;
}

export function formatRuntimeModeLabel(mode?: string | null): string {
  if (!mode) return "미설정";
  if (mode === "paper") return "모의투자";
  if (mode === "live") return "실전";
  return mode.toUpperCase();
}

export function formatConfigSourceLabel(source?: string | null): string | null {
  if (!source) return null;
  return CONFIG_SOURCE_LABELS[source] ?? source.toUpperCase();
}

export function resolveProfileDisplayLabel(params: { profileLabel?: string | null; profileId?: string | null }): string {
  if (params.profileLabel) return params.profileLabel;
  if (params.profileId) return getKisProfileLabel(params.profileId);
  return "미설정";
}

export function formatRuntimeContextLine(params: {
  brokerLabel?: string | null;
  environment?: string | null;
  runtimeMode?: string | null;
  profileLabel?: string | null;
  profileId?: string | null;
  accountMask?: string | null;
  source?: string | null;
}): string {
  const parts = [
    params.brokerLabel ?? null,
    String(params.environment ?? "dev").toUpperCase(),
    formatRuntimeModeLabel(params.runtimeMode),
    resolveProfileDisplayLabel({ profileLabel: params.profileLabel, profileId: params.profileId }),
  ].filter(Boolean) as string[];
  if (params.accountMask) parts.push(params.accountMask);
  const sourceLabel = formatConfigSourceLabel(params.source);
  if (sourceLabel) parts.push(sourceLabel);
  return parts.join(" · ");
}
