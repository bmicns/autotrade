import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "nexio_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const { id, password } = await req.json();

  const adminId = process.env.ADMIN_ID;
  const adminPw = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!adminId || !adminPw || !secret) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 500 });
  }

  if (id !== adminId || password !== adminPw) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
