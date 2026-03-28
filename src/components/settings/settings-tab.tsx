"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/ui/icons";

const TRADE_GROUPS = [
  { title: "매매 한도", rows: [{ l: "1회 매매 한도", i: "trend" as const, r: "100만원 (Kelly)" }, { l: "1일 최대 횟수", i: "clock" as const, r: "5회" }] },
  { title: "손익 관리", rows: [{ l: "손절 라인", i: "dn" as const, r: "-5%" }, { l: "1차 익절", i: "up" as const, r: "+5% · 50%" }, { l: "트레일링 스탑", i: "trend" as const, r: "고점 -3%" }] },
  { title: "시간대 필터", rows: [{ l: "오전 세션", i: "clock" as const, r: "09:30~11:30" }, { l: "오후 세션", i: "clock" as const, r: "13:00~14:50" }] },
];

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1.5px solid ${COLORS.line}`,
  background: COLORS.sub,
  color: COLORS.ink,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  letterSpacing: "-0.5px",
};

export function SettingsTab() {
  const kisConfig = useAppStore((s) => s.kisConfig);
  const setKISConfig = useAppStore((s) => s.setKISConfig);

  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    setAppKey(kisConfig.appKey);
    setAppSecret(kisConfig.appSecret);
    setAccountNo(kisConfig.accountNo);
  }, [kisConfig]);

  const handleSave = () => {
    setKISConfig({ appKey, appSecret, accountNo, token: kisConfig.token, tokenExpiry: kisConfig.tokenExpiry });
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (!appKey || !appSecret) {
      setTestResult("App Key와 App Secret을 입력하세요");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/kis/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey, appSecret }),
      });
      const data = await res.json();
      if (data.token) {
        setKISConfig({ appKey, appSecret, accountNo, token: data.token, tokenExpiry: new Date(Date.now() + 86400000).toISOString() });
        setTestResult("연결 성공! 토큰 발급 완료");
      } else {
        setTestResult(`실패: ${data.error || "알 수 없는 오류"}`);
      }
    } catch {
      setTestResult("네트워크 오류 — KIS 서버 연결 실패");
    } finally {
      setTesting(false);
    }
  };

  const hasKey = !!kisConfig.appKey;
  const hasToken = !!kisConfig.token;

  return (
    <div>
      {/* KIS API 연결 */}
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
        <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>KIS 모의투자 API</span>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: hasToken ? "#22C55E" : hasKey ? "#F59E0B" : COLORS.dim }}
          />
          <span className="text-[10px] font-semibold" style={{ color: hasToken ? "#22C55E" : hasKey ? "#F59E0B" : COLORS.dim }}>
            {hasToken ? "연결됨" : hasKey ? "키 저장됨" : "미설정"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 pb-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold" style={{ color: COLORS.mid }}>App Key</label>
          <input
            type="text"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder="KIS Developers에서 발급받은 앱키"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold" style={{ color: COLORS.mid }}>App Secret</label>
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="KIS Developers에서 발급받은 시크릿"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold" style={{ color: COLORS.mid }}>계좌번호</label>
          <input
            type="text"
            value={accountNo}
            onChange={(e) => setAccountNo(e.target.value)}
            placeholder="모의투자 계좌번호 (예: 5012345601)"
            style={inputStyle}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg py-2.5 text-xs font-bold transition-all"
            style={{
              background: saved ? "#22C55E" : COLORS.ink,
              color: "#fff",
              border: "none",
            }}
          >
            {saved ? "✓ 저장됨" : "저장"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all"
            style={{
              background: "transparent",
              color: COLORS.rise,
              border: `1.5px solid ${COLORS.rise}`,
              opacity: testing ? 0.5 : 1,
            }}
          >
            {testing ? "테스트 중..." : "연결 테스트"}
          </button>
        </div>

        {testResult && (
          <div
            className="rounded-lg px-3 py-2.5 text-xs font-medium"
            style={{
              background: testResult.includes("성공") ? "#F0FDF4" : "#FEF2F2",
              color: testResult.includes("성공") ? "#16A34A" : "#DC2626",
              border: `1px solid ${testResult.includes("성공") ? "#BBF7D0" : "#FECACA"}`,
            }}
          >
            {testResult}
          </div>
        )}

        <div className="rounded-lg p-3" style={{ background: `${COLORS.fall}08`, border: `1px solid ${COLORS.fall}15` }}>
          <span className="text-[11px] leading-relaxed" style={{ color: COLORS.mid }}>
            KIS Developers (apiportal.koreainvestment.com)에서 모의투자용 앱키를 발급받으세요. 키는 브라우저 로컬에만 저장됩니다.
          </span>
        </div>
      </div>

      <div className="h-px" style={{ background: COLORS.line }} />

      {/* 매매 설정 그룹 */}
      {TRADE_GROUPS.map((sec, si) => (
        <div key={si}>
          <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
            <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>{sec.title}</span>
          </div>
          {sec.rows.map((r, ri) => (
            <div key={ri}>
              <div className="flex cursor-pointer items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
                    <Icon name={r.i} size={16} color={COLORS.mid} strokeWidth={1.5} />
                  </div>
                  <span className="text-xs font-medium" style={{ color: COLORS.ink }}>{r.l}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: COLORS.mid }}>{r.r}</span>
                  <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
                </div>
              </div>
              <div className="h-px" style={{ background: COLORS.line }} />
            </div>
          ))}
        </div>
      ))}

      <div className="py-7 text-center">
        <span className="text-xs" style={{ color: COLORS.dim }}>NEXIO v2.0 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
