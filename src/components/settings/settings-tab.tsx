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

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`, background: COLORS.sub,
  color: COLORS.ink, fontSize: 14, fontFamily: "inherit", outline: "none", letterSpacing: "normal",
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
    if (!appKey || !appSecret) { setTestResult("App Key와 App Secret을 입력하세요"); return; }
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/kis/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appKey, appSecret }) });
      const data = await res.json();
      if (data.token) {
        setKISConfig({ appKey, appSecret, accountNo, token: data.token, tokenExpiry: new Date(Date.now() + 86400000).toISOString() });
        setTestResult("연결 성공! 토큰 발급 완료");
      } else { setTestResult(`실패: ${data.error || "알 수 없는 오류"}`); }
    } catch { setTestResult("네트워크 오류 — KIS 서버 연결 실패"); }
    finally { setTesting(false); }
  };

  const hasKey = !!kisConfig.appKey;
  const hasToken = !!kisConfig.token;

  return (
    <div>
      {/* KIS API 연결 */}
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>KIS 모의투자 API</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: hasToken ? "#22C55E" : hasKey ? "#F59E0B" : COLORS.dim }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: hasToken ? "#22C55E" : hasKey ? "#F59E0B" : COLORS.dim }}>
            {hasToken ? "연결됨" : hasKey ? "키 저장됨" : "미설정"}
          </span>
        </div>
      </div>

      <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column" as const, gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>App Key</label>
          <input type="text" value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="KIS Developers에서 발급받은 앱키" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>App Secret</label>
          <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="KIS Developers에서 발급받은 시크릿" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>계좌번호</label>
          <input type="text" value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="모의투자 계좌번호 (예: 5012345601)" style={inputStyle} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
            background: saved ? "#22C55E" : COLORS.ink, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{saved ? "✓ 저장됨" : "저장"}</button>
          <button onClick={handleTest} disabled={testing} style={{
            flex: 1, padding: "10px 0", borderRadius: 12,
            background: "transparent", color: COLORS.rise,
            border: `1.5px solid ${COLORS.rise}`,
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            opacity: testing ? 0.5 : 1,
          }}>{testing ? "테스트 중..." : "연결 테스트"}</button>
        </div>

        {testResult && (
          <div style={{
            borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500,
            background: testResult.includes("성공") ? "#F0FDF4" : "#FEF2F2",
            color: testResult.includes("성공") ? "#16A34A" : "#DC2626",
            border: `1px solid ${testResult.includes("성공") ? "#BBF7D0" : "#FECACA"}`,
          }}>{testResult}</div>
        )}

        <div style={{ borderRadius: 12, padding: 12, background: `${COLORS.fall}08`, border: `1px solid ${COLORS.fall}15` }}>
          <span style={{ fontSize: 11, lineHeight: 1.6, color: COLORS.mid }}>
            KIS Developers (apiportal.koreainvestment.com)에서 모의투자용 앱키를 발급받으세요. 키는 브라우저 로컬에만 저장됩니다.
          </span>
        </div>
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 매매 설정 */}
      {TRADE_GROUPS.map((sec, si) => (
        <div key={si}>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>{sec.title}</span>
          </div>
          {sec.rows.map((r, ri) => (
            <div key={ri}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={r.i} size={16} color={COLORS.mid} strokeWidth={1.5} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{r.l}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{r.r}</span>
                  <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
                </div>
              </div>
              <div style={{ height: 1, background: COLORS.line }} />
            </div>
          ))}
        </div>
      ))}

      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>NEXIO v2.3 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
