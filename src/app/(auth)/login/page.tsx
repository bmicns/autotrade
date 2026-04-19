"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/constants";

export default function LoginPage() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "로그인 실패");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5" style={{ background: COLORS.hero }}>
      <div className="w-full max-w-[360px]" style={{ marginTop: "-100px" }}>
        {/* 로고 */}
        <div className="mb-10 text-center">
          <div className="text-[28px] font-black tracking-[0.15em] text-white">
            NEXIO<span style={{ color: COLORS.rise }}>.</span>
          </div>
          <p className="mt-2 text-sm text-white/40" style={{ marginBottom: "10px" }}>국내주식 자동매매 시스템</p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3 items-center">
          <input
            type="text"
            placeholder="아이디"
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            required
            className="rounded-lg border-none text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff", padding: "16px", width: "80%" }}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="rounded-lg border-none text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff", padding: "16px", width: "80%" }}
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg px-4 py-2.5 text-xs font-medium w-4/5"
              style={{ background: `${COLORS.rise}20`, color: COLORS.rise }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg border-none text-sm font-bold text-white disabled:opacity-50"
            style={{ background: COLORS.rise, boxShadow: `0 4px 20px ${COLORS.rise}40`, padding: "16px", width: "80%" }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
