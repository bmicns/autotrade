import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";
import {
  getActiveKisConfig,
  getDbKisConfig,
  getEnvKisConfig,
} from "@/lib/kis/runtime-config";
import { buildKisConfigState } from "@/lib/kis/config-state";
import { buildKisConfigUpsertPayload } from "@/lib/kis/config-payload";
import { normalizeKisAccountInput } from "@/lib/kis/account";
import { buildKisProductCodeConfigKey, normalizeKisProfileId } from "@/lib/kis/profile";
import { apiCacheHeaders } from "@/lib/http-cache";

// GET — KIS 설정 조회
export async function GET(req: Request) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
  }

  const profileId = normalizeKisProfileId(new URL(req.url).searchParams.get("profile"));
  const active = await getActiveKisConfig(profileId);
  const dbConfig = await getDbKisConfig(profileId);
  const envConfig = getEnvKisConfig(profileId);
  const { data } = await supabase
    .from("kis_config")
    .select("token, token_expiry")
    .eq("id", profileId)
    .maybeSingle();

  const state = buildKisConfigState({ active, envConfig, dbConfig });
  return NextResponse.json(
    {
      ...state,
      token: data?.token ?? "",
      tokenExpiry: data?.token_expiry ?? "",
    },
    { headers: apiCacheHeaders.realtime },
  );
}

// POST — KIS 설정 저장
export async function POST(req: Request) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const body = await req.json();
  const profileId = normalizeKisProfileId(typeof body?.profileId === "string" ? body.profileId : undefined);
  const { appKey, appSecret, accountNo, accountProductCode, token, tokenExpiry } = body;
  const normalizedAccount = normalizeKisAccountInput(
    typeof accountNo === "string" ? accountNo : "",
    typeof accountProductCode === "string" ? accountProductCode : "01",
  );
  const [{ data: current }, currentProductCodeRow] = await Promise.all([
    supabase
      .from("kis_config")
      .select("app_key, app_secret, account_no, token, token_expiry")
      .eq("id", profileId)
      .maybeSingle(),
    supabase
      .from("app_config")
      .select("value")
      .eq("key", buildKisProductCodeConfigKey(profileId))
      .maybeSingle(),
  ]);

  const currentProductCode = typeof currentProductCodeRow.data?.value === "string"
    ? currentProductCodeRow.data.value
    : "01";
  const currentNormalizedAccount = normalizeKisAccountInput(
    typeof current?.account_no === "string" ? current.account_no : "",
    currentProductCode,
  );
  const nextAppKey = typeof appKey === "string" ? appKey : current?.app_key ?? "";
  const nextAppSecret = typeof appSecret === "string" ? appSecret : current?.app_secret ?? "";
  const nextAccountNo = typeof accountNo === "string" ? normalizedAccount.accountNo : currentNormalizedAccount.accountNo;
  const nextAccountProductCode = "accountProductCode" in body
    ? normalizedAccount.accountProductCode
    : currentNormalizedAccount.accountProductCode;
  const credentialsChanged =
    nextAppKey !== (current?.app_key ?? "") ||
    nextAppSecret !== (current?.app_secret ?? "") ||
    nextAccountNo !== currentNormalizedAccount.accountNo ||
    nextAccountProductCode !== currentNormalizedAccount.accountProductCode;
  const shouldClearStoredToken =
    credentialsChanged &&
    !Object.prototype.hasOwnProperty.call(body, "token") &&
    !Object.prototype.hasOwnProperty.call(body, "tokenExpiry");

  const updatedAt = new Date().toISOString();
  const [{ error: configError }, { error: productCodeError }] = await Promise.all([
    supabase
      .from("kis_config")
      .upsert(
        buildKisConfigUpsertPayload(
          profileId,
          current,
          {
            appKey,
            appSecret,
            accountNo: normalizedAccount.accountNo,
            token: shouldClearStoredToken ? null : token,
            tokenExpiry: shouldClearStoredToken ? null : tokenExpiry,
          },
          updatedAt,
        )
      ),
    "accountProductCode" in body
      ? supabase.from("app_config").upsert({
          key: buildKisProductCodeConfigKey(profileId),
          value: normalizedAccount.accountProductCode,
          updated_at: updatedAt,
        })
      : Promise.resolve({ error: null }),
  ]);

  if (configError || productCodeError) {
    return NextResponse.json(
      { success: false, error: configError?.message ?? productCodeError?.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, profileId });
}

// DELETE — DB 저장 KIS 설정 초기화
export async function DELETE(req: Request) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const profileId = normalizeKisProfileId(new URL(req.url).searchParams.get("profile"));
  const [{ error: configError }, { error: productCodeError }] = await Promise.all([
    supabase.from("kis_config").delete().eq("id", profileId),
    supabase.from("app_config").delete().eq("key", buildKisProductCodeConfigKey(profileId)),
  ]);

  if (configError || productCodeError) {
    return NextResponse.json(
      { success: false, error: configError?.message ?? productCodeError?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, profileId });
}
