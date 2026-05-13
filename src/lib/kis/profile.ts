import type { AssetClass } from "../market/types";

export type KISProfileId = string;

export const DEFAULT_KIS_PROFILE_ID = "default";

function clean(value: string | null | undefined): string {
  return String(value ?? "").replace(/\\n|\n/g, "").trim();
}

export function normalizeKisProfileId(profileId?: string | null): KISProfileId {
  const normalized = clean(profileId).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  return normalized || DEFAULT_KIS_PROFILE_ID;
}

export function buildProfileEnvVar(base: string, profileId?: string | null): string {
  const normalized = normalizeKisProfileId(profileId);
  if (normalized === DEFAULT_KIS_PROFILE_ID) {
    return base;
  }
  return `${base}_${normalized.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export function buildKisProductCodeConfigKey(profileId?: string | null): string {
  const normalized = normalizeKisProfileId(profileId);
  return normalized === DEFAULT_KIS_PROFILE_ID
    ? "kis_account_product_code"
    : `kis_account_product_code:${normalized}`;
}

export function resolveKisProfileForAssetClass(assetClass: AssetClass): KISProfileId {
  switch (assetClass) {
    case "us_stock":
    case "us_etf":
      return "us";
    case "kr_stock":
    case "kr_etf":
    default:
      return "kr";
  }
}

export function getKisProfileLabel(profileId?: string | null): string {
  const normalized = normalizeKisProfileId(profileId);
  switch (normalized) {
    case "default":
      return "모의투자";
    case "kr":
      return "국내";
    case "us":
      return "해외";
    default:
      return normalized.toUpperCase();
  }
}

export function maskKisAccountNo(accountNo?: string | null): string {
  const normalized = String(accountNo ?? "").replace(/\D/g, "");
  if (!normalized) return "미설정";
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 2)}${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-2)}`;
}
