"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { EngineControlSection } from "@/components/settings/engine-control-section";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`, background: COLORS.sub,
  color: COLORS.ink, fontSize: 14, fontFamily: "inherit", outline: "none", letterSpacing: "normal",
};

export function SettingsTab() {
  const kisConfig    = useAppStore((s) => s.kisConfig);
  const setKISConfig = useAppStore((s) => s.setKISConfig);

  const [appKey,    setAppKey]    = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [saved,     setSaved]     = useState(false);
  const [testing,   setTesting]   = useState(false);
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
      const res  = await fetch("/api/kis/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appKey, appSecret }) });
      const data = await res.json();
      if (data.token) {
        setKISConfig({ appKey, appSecret, accountNo, token: data.token, tokenExpiry: new Date(Date.now() + 86400000).toISOString() });
        setTestResult("연결 성공! 토큰 발급 완료");
      } else {
        const parts = [
          data.status ? `HTTP ${data.status}` : "",
          data.error || "알 수 없는 오류",
          data.detail || "",
        ].filter(Boolean);
        setTestResult(`실패: ${parts.join(" / ")}`);
      }
    } catch {
      setTestResult("네트워크 오류 — KIS 서버 연결 실패");
    } finally {
      setTesting(false);
    }
  };

  const hasKey   = !!kisConfig.appKey;
  const hasToken = !!kisConfig.token;
  const activeSourceLabel =
    kisConfig.source === "env" ? "환경변수(env)" :
    kisConfig.source === "db" ? "DB(kis_config)" :
    "미확인";
  const runtimeModeLabel = kisConfig.runtimeMode === "paper" ? "모의투자" : kisConfig.runtimeMode || "미확인";

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
            KIS Developers (apiportal.koreainvestment.com)에서 모의투자용 앱키를 발급받으세요. 현재 런타임 기준값은 {activeSourceLabel}이며,
            {kisConfig.source === "env"
              ? " 현재 DB 값이 없거나 불완전해 env 폴백으로 운영 중입니다. 저장하면 서버 kis_config와 브라우저 캐시가 함께 갱신됩니다."
              : " 저장 시 서버 kis_config와 브라우저 캐시가 함께 갱신되며, 실제 운영 조회도 DB 값을 우선 사용합니다."}
          </span>
        </div>

        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: COLORS.dim }}>활성 소스</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{activeSourceLabel}</span>
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: COLORS.dim }}>활성 계좌번호</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{kisConfig.accountNo || "미설정"}</span>
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: COLORS.dim }}>런타임 모드</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{runtimeModeLabel}</span>
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: COLORS.dim }}>KIS API Base</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{kisConfig.apiBaseUrl || "미설정"}</span>
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: COLORS.dim }}>설정 소스 보유</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>
              env {kisConfig.hasEnvConfig ? "있음" : "없음"} / db {kisConfig.hasDbConfig ? "있음" : "없음"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 엔진 제어 */}
      <EngineControlSection />

      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>NEXIO v2.4 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
