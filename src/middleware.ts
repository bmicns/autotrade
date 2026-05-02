import { NextRequest, NextResponse } from "next/server";

// 크론 전용 라우트 — CRON_SECRET Bearer로 인증, 세션 검증 생략
const CRON_ROUTES = new Set([
  "/api/engine",
  "/api/daily-report",
  "/api/market-close",
  "/api/observer",
]);

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const SESSION_COOKIE = "nexio_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Edge Runtime용 HMAC-SHA256 검증 (Web Crypto API)
async function verifySessionEdge(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!ts || !sig) return false;

  const age = Date.now() - Number(ts);
  if (age < 0 || age > SESSION_MAX_AGE_MS) return false;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(ts));
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return expected === sig;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 크론 라우트: CRON_SECRET Bearer 검증
  if (CRON_ROUTES.has(pathname)) {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // 공개 경로 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 세션 쿠키 검증
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;

  if (!secret || !sessionToken || !(await verifySessionEdge(sessionToken, secret))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff|woff2|ttf|eot|map)$).*)",
  ],
};
