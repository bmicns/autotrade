import { supabase } from "@/lib/supabase/api-client";

export interface RuntimeKisConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
}

export type KISConfigSource = "db" | "env";

function clean(value: string | null | undefined): string {
  return String(value ?? "").replace(/\\n|\n/g, "").trim();
}

function isComplete(config: RuntimeKisConfig): boolean {
  return !!(config.appKey && config.appSecret && config.accountNo);
}

export function getEnvKisConfig(): RuntimeKisConfig | null {
  const config: RuntimeKisConfig = {
    appKey: clean(process.env.KIS_APP_KEY),
    appSecret: clean(process.env.KIS_APP_SECRET),
    accountNo: clean(process.env.KIS_ACCOUNT_NO),
  };
  return isComplete(config) ? config : null;
}

export async function getDbKisConfig(): Promise<RuntimeKisConfig | null> {
  const { data } = await supabase
    .from("kis_config")
    .select("app_key, app_secret, account_no")
    .eq("id", "default")
    .maybeSingle();

  const config: RuntimeKisConfig = {
    appKey: clean((data?.app_key as string | undefined) ?? ""),
    appSecret: clean((data?.app_secret as string | undefined) ?? ""),
    accountNo: clean((data?.account_no as string | undefined) ?? ""),
  };

  return isComplete(config) ? config : null;
}

export async function persistKisConfig(config: RuntimeKisConfig): Promise<void> {
  await supabase.from("kis_config").upsert({
    id: "default",
    app_key: config.appKey,
    app_secret: config.appSecret,
    account_no: config.accountNo,
    updated_at: new Date().toISOString(),
  });
}

export async function getKisCredentialCandidates(): Promise<Array<{ source: KISConfigSource; config: RuntimeKisConfig }>> {
  const candidates: Array<{ source: KISConfigSource; config: RuntimeKisConfig }> = [];
  const dbConfig = await getDbKisConfig();
  if (dbConfig) {
    candidates.push({ source: "db", config: dbConfig });
  }

  const envConfig = getEnvKisConfig();
  if (
    envConfig &&
    !candidates.some(({ config }) =>
      config.appKey === envConfig.appKey &&
      config.appSecret === envConfig.appSecret &&
      config.accountNo === envConfig.accountNo,
    )
  ) {
    candidates.push({ source: "env", config: envConfig });
  }

  return candidates;
}

export async function getActiveKisConfig(): Promise<{ source: KISConfigSource; config: RuntimeKisConfig } | null> {
  const [first] = await getKisCredentialCandidates();
  return first ?? null;
}
