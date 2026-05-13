import { supabase } from "@/lib/supabase/api-client";
import { getTokenDetails } from "@/lib/kis/api";

function isTokenUsable(token?: string | null, tokenExpiry?: string | null): token is string {
  if (!token) return false;
  if (!tokenExpiry) return true;
  const expiryMs = new Date(tokenExpiry).getTime();
  if (!Number.isFinite(expiryMs)) return true;
  return expiryMs - Date.now() > 60_000;
}

async function persistIssuedToken(profileId: string, token: string, tokenExpiry: string | null) {
  await supabase.from("kis_config").upsert({
    id: profileId,
    token,
    token_expiry: tokenExpiry,
    updated_at: new Date().toISOString(),
  });
}

export async function resolveKisAccessToken(profileId: string, appKey: string, appSecret: string): Promise<string> {
  const { data } = await supabase
    .from("kis_config")
    .select("token, token_expiry")
    .eq("id", profileId)
    .maybeSingle();

  const storedToken = typeof data?.token === "string" ? data.token : null;
  const storedExpiry = typeof data?.token_expiry === "string" ? data.token_expiry : null;
  if (isTokenUsable(storedToken, storedExpiry)) {
    return storedToken;
  }

  const fresh = await getTokenDetails(appKey, appSecret);
  await persistIssuedToken(profileId, fresh.token, fresh.tokenExpiry);
  return fresh.token;
}
