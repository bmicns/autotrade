import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { generateSessionToken } from "@/lib/session";

const SESSION_COOKIE = "nexio_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// 인메모리 rate limit — 서버리스(Vercel) 특성상 인스턴스별 독립 카운트로 완전한 방어는 불가.
// 단일 관리자 앱이므로 허용. 실제 무차별 대입 방어는 Vercel IP 차단/WAF 레이어에 의존.
const LOGIN_RATE_LIMIT  = 5;
const LOGIN_WINDOW_MS   = 60_000;
const LOGIN_FAIL_DELAY  = 1_000; // 실패 시 1초 고정 지연 — 브루트포스 속도 제한
let loginWindowStart = Date.now();
let loginReqCount    = 0;

function checkLoginRateLimit(): boolean {
  const now = Date.now();
  if (now - loginWindowStart > LOGIN_WINDOW_MS) { loginWindowStart = now; loginReqCount = 0; }
  if (loginReqCount >= LOGIN_RATE_LIMIT) return false;
  loginReqCount++;
  return true;
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) {
      // 길이 차이 노출 방지: 동일 길이 버퍼로 비교 후 false 반환
      timingSafeEqual(ba, ba);
      return false;
    }
    return timingSafeEqual(ba, bb);
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!checkLoginRateLimit()) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  const { id, password } = await req.json();

  const adminId = process.env.ADMIN_ID;
  const adminPw = process.env.ADMIN_PASSWORD;
  const secret  = process.env.SESSION_SECRET;

  if (!adminId || !adminPw || !secret) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 500 });
  }

  // timingSafeEqual로 id/pw 모두 비교 (타이밍 공격 방지)
  const idOk = safeEqual(String(id ?? ""), adminId);
  const pwOk = safeEqual(String(password ?? ""), adminPw);
  if (!idOk || !pwOk) {
    await new Promise((r) => setTimeout(r, LOGIN_FAIL_DELAY));
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const token = generateSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
