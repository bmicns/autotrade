export interface KISConfigRowSnapshot {
  app_key?: string | null;
  app_secret?: string | null;
  account_no?: string | null;
  token?: string | null;
  token_expiry?: string | null;
}

export interface KISConfigRequestBody {
  appKey?: string | null;
  appSecret?: string | null;
  accountNo?: string | null;
  token?: string | null;
  tokenExpiry?: string | null;
}

export function buildKisConfigUpsertPayload(
  id: string,
  current: KISConfigRowSnapshot | null | undefined,
  next: KISConfigRequestBody,
  updatedAt: string,
) {
  const hasExplicitToken = Object.prototype.hasOwnProperty.call(next, "token");
  const hasExplicitTokenExpiry = Object.prototype.hasOwnProperty.call(next, "tokenExpiry");

  return {
    id,
    app_key: next.appKey ?? current?.app_key ?? "",
    app_secret: next.appSecret ?? current?.app_secret ?? "",
    account_no: next.accountNo ?? current?.account_no ?? "",
    token: hasExplicitToken ? (next.token ?? null) : (current?.token ?? null),
    token_expiry: hasExplicitTokenExpiry ? (next.tokenExpiry ?? null) : (current?.token_expiry ?? null),
    updated_at: updatedAt,
  };
}
