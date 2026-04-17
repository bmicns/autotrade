import { supabase } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";


const ID = "default";

// GET — KIS 설정 조회
export async function GET() {
  const { data } = await supabase
    .from("kis_config")
    .select("app_key, app_secret, account_no, token, token_expiry")
    .eq("id", ID)
    .single();

  if (!data) return NextResponse.json({ appKey: "", appSecret: "", accountNo: "" });

  return NextResponse.json({
    appKey: data.app_key,
    appSecret: data.app_secret,
    accountNo: data.account_no,
    token: data.token ?? "",
    tokenExpiry: data.token_expiry ?? "",
  });
}

// POST — KIS 설정 저장
export async function POST(req: Request) {
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
