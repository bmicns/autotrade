import { supabase } from "@/lib/supabase/api-client";
import { normalizeKisAccountInput } from "./account";
import type { AssetClass } from "@/lib/market/types";
import {
  buildKisProductCodeConfigKey,
  buildProfileEnvVar,
  DEFAULT_KIS_PROFILE_ID,
  normalizeKisProfileId,
  resolveKisProfileForAssetClass,
  type KISProfileId,
} from "./profile";

export interface RuntimeKisConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountProductCode?: string;
}

export type KISConfigSource = "db" | "env";

function clean(value: string | null | undefined): string {
  return String(value ?? "").replace(/\\n|\n/g, "").trim();
}

function isComplete(config: RuntimeKisConfig): boolean {
  return !!(config.appKey && config.appSecret && config.accountNo);
}

export function getEnvKisConfig(profileId?: string | null): RuntimeKisConfig | null {
  const normalizedProfileId = normalizeKisProfileId(profileId);
  const normalized = normalizeKisAccountInput(
    clean(process.env[buildProfileEnvVar("KIS_ACCOUNT_NO", normalizedProfileId)]),
    clean(process.env[buildProfileEnvVar("KIS_ACCOUNT_PRODUCT_CODE", normalizedProfileId)] || "01"),
  );
  const config: RuntimeKisConfig = {
    appKey: clean(process.env[buildProfileEnvVar("KIS_APP_KEY", normalizedProfileId)]),
    appSecret: clean(process.env[buildProfileEnvVar("KIS_APP_SECRET", normalizedProfileId)]),
    accountNo: normalized.accountNo,
    accountProductCode: normalized.accountProductCode,
  };
  return isComplete(config) ? config : null;
}

export async function getDbKisConfig(profileId?: string | null): Promise<RuntimeKisConfig | null> {
  const normalizedProfileId = normalizeKisProfileId(profileId);
  const [{ data }, productCodeRow] = await Promise.all([
    supabase
      .from("kis_config")
      .select("app_key, app_secret, account_no")
      .eq("id", normalizedProfileId)
      .maybeSingle(),
    supabase
      .from("app_config")
      .select("value")
      .eq("key", buildKisProductCodeConfigKey(normalizedProfileId))
      .maybeSingle(),
  ]);

  const normalized = normalizeKisAccountInput(
    clean((data?.account_no as string | undefined) ?? ""),
    clean((productCodeRow.data?.value as string | undefined) ?? "01"),
  );
  const config: RuntimeKisConfig = {
    appKey: clean((data?.app_key as string | undefined) ?? ""),
    appSecret: clean((data?.app_secret as string | undefined) ?? ""),
    accountNo: normalized.accountNo,
    accountProductCode: normalized.accountProductCode,
  };

  return isComplete(config) ? config : null;
}

export async function persistKisConfig(config: RuntimeKisConfig, profileId?: string | null): Promise<void> {
  const normalizedProfileId = normalizeKisProfileId(profileId);
  const updatedAt = new Date().toISOString();
  const normalized = normalizeKisAccountInput(config.accountNo, config.accountProductCode);
  await Promise.all([
    supabase.from("kis_config").upsert({
      id: normalizedProfileId,
      app_key: config.appKey,
      app_secret: config.appSecret,
      account_no: normalized.accountNo,
      updated_at: updatedAt,
    }),
    supabase.from("app_config").upsert({
      key: buildKisProductCodeConfigKey(normalizedProfileId),
      value: normalized.accountProductCode,
      updated_at: updatedAt,
    }),
  ]);
}

export async function getKisCredentialCandidates(
  profileId?: string | null,
  fallbackProfileIds?: Array<string | null | undefined>,
): Promise<Array<{ source: KISConfigSource; config: RuntimeKisConfig; profileId: KISProfileId }>> {
  const requestedProfileId = normalizeKisProfileId(profileId);
  const profileQueue = [
    requestedProfileId,
    ...((fallbackProfileIds ?? (requestedProfileId === DEFAULT_KIS_PROFILE_ID ? [] : [DEFAULT_KIS_PROFILE_ID]))
      .map((item) => normalizeKisProfileId(item))),
  ].filter((item, index, array) => array.indexOf(item) === index);

  const candidates: Array<{ source: KISConfigSource; config: RuntimeKisConfig; profileId: KISProfileId }> = [];

  for (const currentProfileId of profileQueue) {
    const dbConfig = await getDbKisConfig(currentProfileId);
    if (dbConfig) {
      candidates.push({ source: "db", config: dbConfig, profileId: currentProfileId });
    }

    const envConfig = getEnvKisConfig(currentProfileId);
    if (
      envConfig &&
      !candidates.some(({ config, profileId: existingProfileId }) =>
        existingProfileId === currentProfileId &&
        config.appKey === envConfig.appKey &&
        config.appSecret === envConfig.appSecret &&
        config.accountNo === envConfig.accountNo &&
        config.accountProductCode === envConfig.accountProductCode,
      )
    ) {
      candidates.push({ source: "env", config: envConfig, profileId: currentProfileId });
    }
  }

  return candidates;
}

export async function getActiveKisConfig(
  profileId?: string | null,
  fallbackProfileIds?: Array<string | null | undefined>,
): Promise<{ source: KISConfigSource; config: RuntimeKisConfig; profileId: KISProfileId } | null> {
  const [first] = await getKisCredentialCandidates(profileId, fallbackProfileIds);
  return first ?? null;
}

export async function getActiveKisConfigForAssetClass(
  assetClass: AssetClass,
): Promise<{ source: KISConfigSource; config: RuntimeKisConfig; profileId: KISProfileId } | null> {
  return getActiveKisConfig(resolveKisProfileForAssetClass(assetClass), [DEFAULT_KIS_PROFILE_ID]);
}
