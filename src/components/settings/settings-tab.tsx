"use client";

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore, TradeSettings } from "@/lib/store";
import { Icon } from "@/components/ui/icons";

type SettingKey =
  | "maxAmountPerTrade"
  | "maxTradesPerDay"
  | "stopLoss"
  | "takeProfit"
  | "trailingStop"
  | "morningSession"
  | "afternoonSession";

interface SettingMeta {
  key: SettingKey;
  label: string;
  icon: "trend" | "clock" | "dn" | "up";
  unit: string;
  type: "number" | "time-range";
  min?: number;
  max?: number;
  step?: number;
  description: string;
}

const SETTING_METAS: SettingMeta[] = [
  { key: "maxAmountPerTrade", label: "1회 매매 한도", icon: "trend", unit: "만원", type: "number", min: 10, max: 1000, step: 10, description: "Kelly 기준 1회 최대 투자금" },
  { key: "maxTradesPerDay", label: "1일 최대 횟수", icon: "clock", unit: "회", type: "number", min: 1, max: 20, step: 1, description: "하루 최대 매매 횟수" },
  { key: "stopLoss", label: "손절 라인", icon: "dn", unit: "%", type: "number", min: 1, max: 20, step: 0.5, description: "손실 시 자동 매도 기준" },
  { key: "takeProfit", label: "1차 익절", icon: "up", unit: "%", type: "number", min: 1, max: 50, step: 0.5, description: "수익 실현 기준 (비율 50%)" },
  { key: "trailingStop", label: "트레일링 스탑", icon: "trend", unit: "%", type: "number", min: 1, max: 10, step: 0.5, description: "고점 대비 하락 시 매도" },
  { key: "morningSession", label: "오전 세션", icon: "clock", unit: "", type: "time-range", description: "오전 매매 허용 시간대" },
  { key: "afternoonSession", label: "오후 세션", icon: "clock", unit: "", type: "time-range", description: "오후 매매 허용 시간대" },
];

const GROUPS = [
  { title: "매매 한도", keys: ["maxAmountPerTrade", "maxTradesPerDay"] },
  { title: "손익 관리", keys: ["stopLoss", "takeProfit", "trailingStop"] },
  { title: "시간대 필터", keys: ["morningSession", "afternoonSession"] },
];

function getDisplayValue(key: SettingKey, ts: TradeSettings): string {
  switch (key) {
    case "maxAmountPerTrade": return `${ts.maxAmountPerTrade}만원 (Kelly)`;
    case "maxTradesPerDay": return `${ts.maxTradesPerDay}회`;
    case "stopLoss": return `-${ts.stopLoss}%`;
    case "takeProfit": return `+${ts.takeProfit}% · ${ts.takeProfitRatio}%`;
    case "trailingStop": return `고점 -${ts.trailingStop}%`;
    case "morningSession": return `${ts.morningStart}~${ts.morningEnd}`;
    case "afternoonSession": return `${ts.afternoonStart}~${ts.afternoonEnd}`;
  }
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`, background: COLORS.sub,
  color: COLORS.ink, fontSize: 14, fontFamily: "inherit", outline: "none", letterSpacing: "normal",
};

/* ── 바텀시트 편집 모달 ── */
function EditSheet({ meta, ts, onSave, onClose }: {
  meta: SettingMeta;
  ts: TradeSettings;
  onSave: (next: Partial<TradeSettings>) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [ratio, setRatio] = useState("");

  useEffect(() => {
    switch (meta.key) {
      case "maxAmountPerTrade": setValue(String(ts.maxAmountPerTrade)); break;
      case "maxTradesPerDay": setValue(String(ts.maxTradesPerDay)); break;
      case "stopLoss": setValue(String(ts.stopLoss)); break;
      case "takeProfit": setValue(String(ts.takeProfit)); setRatio(String(ts.takeProfitRatio)); break;
      case "trailingStop": setValue(String(ts.trailingStop)); break;
      case "morningSession": setValue(ts.morningStart); setValue2(ts.morningEnd); break;
      case "afternoonSession": setValue(ts.afternoonStart); setValue2(ts.afternoonEnd); break;
    }
  }, [meta.key, ts]);

  const handleSave = () => {
    switch (meta.key) {
      case "maxAmountPerTrade": onSave({ maxAmountPerTrade: Number(value) || 100 }); break;
      case "maxTradesPerDay": onSave({ maxTradesPerDay: Number(value) || 5 }); break;
      case "stopLoss": onSave({ stopLoss: Number(value) || 5 }); break;
      case "takeProfit": onSave({ takeProfit: Number(value) || 5, takeProfitRatio: Number(ratio) || 50 }); break;
      case "trailingStop": onSave({ trailingStop: Number(value) || 3 }); break;
      case "morningSession": onSave({ morningStart: value, morningEnd: value2 }); break;
      case "afternoonSession": onSave({ afternoonStart: value, afternoonEnd: value2 }); break;
    }
  };

  return (
    <>
      {/* 배경 오버레이 */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998,
        animation: "fadeIn .2s ease",
      }} />
      {/* 바텀시트 */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
        background: COLORS.bg, borderRadius: "20px 20px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
        animation: "slideUp .25s ease",
      }}>
        {/* 핸들 */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.line, margin: "0 auto 16px" }} />

        {/* 제목 */}
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink }}>{meta.label}</span>
        </div>
        <span style={{ fontSize: 12, color: COLORS.dim, display: "block", marginBottom: 20 }}>{meta.description}</span>

        {/* 입력 필드 */}
        {meta.type === "number" && meta.key !== "takeProfit" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min={meta.min}
                max={meta.max}
                step={meta.step}
                style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "14px 16px", textAlign: "center" }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.mid, flexShrink: 0 }}>{meta.unit}</span>
            </div>
            {meta.min != null && meta.max != null && (
              <input
                type="range"
                min={meta.min}
                max={meta.max}
                step={meta.step}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                style={{ width: "100%", marginTop: 12, accentColor: COLORS.rise }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: COLORS.dim }}>{meta.min}{meta.unit}</span>
              <span style={{ fontSize: 10, color: COLORS.dim }}>{meta.max}{meta.unit}</span>
            </div>
          </div>
        )}

        {/* 1차 익절: 값 + 비율 */}
        {meta.key === "takeProfit" && (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>익절 기준</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} min={1} max={50} step={0.5}
                  style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "14px 16px", textAlign: "center" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.mid, flexShrink: 0 }}>%</span>
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>매도 비율</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" value={ratio} onChange={(e) => setRatio(e.target.value)} min={10} max={100} step={10}
                  style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "14px 16px", textAlign: "center" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.mid, flexShrink: 0 }}>%</span>
              </div>
            </div>
          </div>
        )}

        {/* 시간대 */}
        {meta.type === "time-range" && (
          <div style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>시작</label>
              <input type="time" value={value} onChange={(e) => setValue(e.target.value)}
                style={{ ...inputStyle, fontSize: 16, fontWeight: 600, padding: "14px 16px", textAlign: "center" }} />
            </div>
            <span style={{ fontSize: 16, color: COLORS.dim, marginTop: 20 }}>~</span>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>종료</label>
              <input type="time" value={value2} onChange={(e) => setValue2(e.target.value)}
                style={{ ...inputStyle, fontSize: 16, fontWeight: 600, padding: "14px 16px", textAlign: "center" }} />
            </div>
          </div>
        )}

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px 0", borderRadius: 12, border: `1.5px solid ${COLORS.line}`,
            background: "transparent", color: COLORS.mid,
            fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>취소</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "14px 0", borderRadius: 12, border: "none",
            background: COLORS.ink, color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>저장</button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  );
}

/* ── 메인 설정 탭 ── */
export function SettingsTab() {
  const kisConfig = useAppStore((s) => s.kisConfig);
  const setKISConfig = useAppStore((s) => s.setKISConfig);
  const tradeSettings = useAppStore((s) => s.tradeSettings);
  const setTradeSettings = useAppStore((s) => s.setTradeSettings);

  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<SettingKey | null>(null);

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

  const handleTradeSettingSave = useCallback((partial: Partial<TradeSettings>) => {
    setTradeSettings({ ...tradeSettings, ...partial });
    setEditKey(null);
  }, [tradeSettings, setTradeSettings]);

  const hasKey = !!kisConfig.appKey;
  const hasToken = !!kisConfig.token;
  const editMeta = editKey ? SETTING_METAS.find((m) => m.key === editKey) : null;

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
      {GROUPS.map((sec, si) => (
        <div key={si}>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>{sec.title}</span>
          </div>
          {sec.keys.map((key) => {
            const meta = SETTING_METAS.find((m) => m.key === key)!;
            return (
              <div key={key}>
                <div
                  onClick={() => setEditKey(key as SettingKey)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={meta.icon} size={16} color={COLORS.mid} strokeWidth={1.5} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{meta.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: COLORS.mid }}>{getDisplayValue(key as SettingKey, tradeSettings)}</span>
                    <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
                  </div>
                </div>
                <div style={{ height: 1, background: COLORS.line }} />
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>NEXIO v2.4 · Vercel + Supabase</span>
      </div>

      {/* 바텀시트 편집 모달 */}
      {editMeta && (
        <EditSheet
          meta={editMeta}
          ts={tradeSettings}
          onSave={handleTradeSettingSave}
          onClose={() => setEditKey(null)}
        />
      )}
    </div>
  );
}
