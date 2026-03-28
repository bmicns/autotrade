"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COLORS } from "@/lib/constants";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다" : error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5" style={{ background: COLORS.hero }}>
      <div className="w-full max-w-[360px]">
        {/* 로고 */}
        <div className="mb-10 text-center">
          <div className="text-[28px] font-black tracking-[0.15em] text-white">
            NEXIO<span style={{ color: COLORS.rise }}>.</span>
          </div>
          <p className="mt-2 text-sm text-white/40">국내주식 자동매매 시스템</p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border-none px-4 py-3.5 text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-lg border-none px-4 py-3.5 text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
          />

          {error && (
            <p className="rounded-lg px-4 py-2.5 text-xs font-medium" style={{ background: `${COLORS.rise}20`, color: COLORS.rise }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg border-none py-3.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: COLORS.rise, boxShadow: `0 4px 20px ${COLORS.rise}40` }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {/* 회원가입 링크 */}
        <p className="mt-6 text-center text-xs text-white/40">
          계정이 없으신가요?{" "}
          <a href="/signup" className="font-semibold text-white/70 hover:text-white">
            회원가입
          </a>
        </p>
      </div>
    </div>
  );
}
