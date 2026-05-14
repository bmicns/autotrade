import { NextResponse } from "next/server";

import { verifySessionToken } from "./session";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE = "nexio_session";

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

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    return trimmed.slice(eq + 1).trim() || null;
  }

  return null;
}

export function requireTrustedWriteRequest(request: Request): NextResponse | null {
  if (isSafeHttpMethod(request.method)) return null;
  if (hasTrustedOrigin(request.headers, request.url)) return null;
  return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
}

export function requireSessionRequest(request: Request): NextResponse | null {
  const secret = process.env.SESSION_SECRET;
  const sessionToken = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);

  if (!secret || !sessionToken || !verifySessionToken(sessionToken, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function requireSessionWriteRequest(request: Request): NextResponse | null {
  const originGuard = requireTrustedWriteRequest(request);
  if (originGuard) return originGuard;
  return requireSessionRequest(request);
}

export function requireCronBearerAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
