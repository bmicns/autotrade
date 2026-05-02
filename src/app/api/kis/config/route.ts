import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";
import { getActiveKisConfig, getDbKisConfig, getEnvKisConfig } from "@/lib/kis/runtime-config";
import { KIS_API_BASE, KIS_RUNTIME_MODE } from "@/lib/constants";


const ID = "default";

// GET — KIS 설정 조회
export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const active = await getActiveKisConfig();
  const dbConfig = await getDbKisConfig();
  const envConfig = getEnvKisConfig();
  const { data } = await supabase
    .from("kis_config")
    .select("token, token_expiry")
    .eq("id", ID)
    .maybeSingle();

  if (!active) {
    return NextResponse.json({
      appKey: "",
      appSecret: "",
      accountNo: "",
      source: null,
      hasEnvConfig: !!envConfig,
      hasDbConfig: !!dbConfig,
    });
  }

  return NextResponse.json({
    appKey: active.config.appKey,
    appSecret: active.config.appSecret,
    accountNo: active.config.accountNo,
    token: data?.token ?? "",
    tokenExpiry: data?.token_expiry ?? "",
    source: active.source,
    runtimeMode: KIS_RUNTIME_MODE,
    apiBaseUrl: KIS_API_BASE,
    hasEnvConfig: !!envConfig,
    hasDbConfig: !!dbConfig,
  });
}

// POST — KIS 설정 저장
export async function POST(req: Request) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const body = await req.json();
  const { appKey, appSecret, accountNo, token, tokenExpiry } = body;

  const { error } = await supabase
    .from("kis_config")
    .upsert({
      id: ID,
      app_key: appKey ?? "",
      app_secret: appSecret ?? "",
      account_no: accountNo ?? "",
      token: token ?? null,
      token_expiry: tokenExpiry ?? null,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
