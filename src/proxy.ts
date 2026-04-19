import { NextRequest, NextResponse } from "next/server";

// 크론 전용 라우트 — CRON_SECRET Bearer로 인증, 세션 검증 생략
const CRON_ROUTES = new Set([
  "/api/engine",
  "/api/daily-report",
  "/api/market-close",
  "/api/observer",
]);

// 인증 불필요 공개 경로
const PUBLIC_PATHS = ["/login"];

const SESSION_COOKIE = "nexio_session";

export async function proxy(req: NextRequest) {
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

  if (!secret || sessionToken !== secret) {
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
