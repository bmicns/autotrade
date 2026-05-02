"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateSessionToken } from "@/lib/session";

const SESSION_COOKIE = "nexio_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export type LoginResult =
  | { success: true }
  | { success: false; error: string };

export async function loginAction(
  _prev: LoginResult | null,
  formData: FormData
): Promise<LoginResult> {
  const id = (formData.get("id") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null)?.trim() ?? "";

  if (!id || !password) {
    return { success: false, error: "아이디와 비밀번호를 입력해 주세요." };
  }

  const adminId = process.env.ADMIN_ID;
  const adminPw = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!adminId || !adminPw || !secret) {
    return { success: false, error: "서버 설정 오류입니다. 관리자에게 문의하세요." };
  }

  if (id !== adminId || password !== adminPw) {
    return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  const cookieStore = await cookies();
  const token = generateSessionToken(secret);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
