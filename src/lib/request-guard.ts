const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeHttpMethod(method: string): boolean {
  return SAFE_HTTP_METHODS.has(method.toUpperCase());
}

export function hasTrustedOrigin(headers: Headers, requestUrl: string): boolean {
  const requestOrigin = new URL(requestUrl).origin;
  const origin = headers.get("origin");
  if (origin) {
    return origin === requestOrigin;
  }

  const referer = headers.get("referer");
  if (!referer) return false;

  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}
