"use client";

import { useActionState } from "react";
import { COLORS } from "@/lib/constants";
import { loginAction } from "@/actions/auth";

const initialState = null;

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center px-5" style={{ background: COLORS.hero }}>
      <div className="w-full max-w-[360px]" style={{ marginTop: "-100px" }}>
        {/* 로고 */}
        <div className="mb-10 text-center">
          <div className="text-[28px] font-black tracking-[0.15em] text-white">
            NEXIO<span style={{ color: COLORS.rise }}>.</span>
          </div>
          <p className="mt-2 text-sm text-white/40">국내주식 자동매매 시스템</p>
        </div>

        {/* 폼 */}
        <form action={formAction} className="flex flex-col gap-3">
          <input
            type="text"
            name="id"
            placeholder="아이디"
            autoComplete="username"
            required
            className="rounded-lg border-none px-4 py-3.5 text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
          />
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            autoComplete="current-password"
            required
            className="rounded-lg border-none px-4 py-3.5 text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
          />

          {state && !state.success && (
            <p
              role="alert"
              className="rounded-lg px-4 py-2.5 text-xs font-medium"
              style={{ background: `${COLORS.rise}20`, color: COLORS.rise }}
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 rounded-lg border-none py-3.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: COLORS.rise, boxShadow: `0 4px 20px ${COLORS.rise}40` }}
          >
            {isPending ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
