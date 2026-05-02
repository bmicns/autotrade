"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import {
  setEngineEnabled,
  setMaxPositions as saveMaxPositionsAction,
  setMaxPerSector as saveMaxPerSectorAction,
} from "@/actions/engine-control";

const controlInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`,
  background: COLORS.sub,
  color: COLORS.ink,
  fontSize: 16,
  fontWeight: 700,
  fontFamily: "inherit",
  outline: "none",
  textAlign: "center",
};

const saveButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

export function EngineControlSection() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maxPositions, setMaxPositions] = useState(5);
  const [posInput, setPosInput] = useState("5");
  const [posSaved, setPosSaved] = useState(false);
  const [maxPerSector, setMaxPerSector] = useState(2);
  const [secInput, setSecInput] = useState("2");
  const [secSaved, setSecSaved] = useState(false);

  useEffect(() => {
    fetch("/api/engine-control")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(d.engine_enabled ?? true);
        setMaxPositions(d.max_positions ?? 5);
        setPosInput(String(d.max_positions ?? 5));
        setMaxPerSector(d.max_per_sector ?? 2);
        setSecInput(String(d.max_per_sector ?? 2));
      })
      .finally(() => setLoading(false));
  }, []);

  const saveMaxPerSector = async () => {
    const val = Number(secInput);
    if (!Number.isInteger(val) || val < 1 || val > 10) return;
    setSaving(true);
    try {
      await saveMaxPerSectorAction(val);
      setMaxPerSector(val);
      setSecSaved(true);
      setTimeout(() => setSecSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const saveMaxPositions = async () => {
    const val = Number(posInput);
    if (!Number.isInteger(val) || val < 1 || val > 20) return;
    setSaving(true);
    try {
      await saveMaxPositionsAction(val);
      setMaxPositions(val);
      setPosSaved(true);
      setTimeout(() => setPosSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (next: boolean) => {
    setSaving(true);
    setConfirm(false);
    try {
      await setEngineEnabled(next);
      setEnabled(next);
    } catch {
      /* 실패 시 상태 유지 */
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>엔진 제어</span>
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderRadius: 14,
          background: enabled ? "#F0FDF4" : "#FEF2F2",
          border: `1.5px solid ${enabled ? "#BBF7D0" : "#FECACA"}`,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: enabled ? "#16A34A" : "#DC2626" }}>
              {loading ? "확인 중..." : enabled ? "엔진 실행 중" : "엔진 정지됨"}
            </div>
            <div style={{ fontSize: 11, color: COLORS.mid, marginTop: 2 }}>
              {enabled ? "다음 크론에서 정상 실행" : "크론 호출 시 건너뜀"}
            </div>
          </div>
          <button
            disabled={loading || saving}
            onClick={() => enabled ? setConfirm(true) : toggle(true)}
            style={{
              padding: "8px 16px", borderRadius: 10, border: "none",
              background: enabled ? "#DC2626" : "#16A34A",
              color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: loading || saving ? "not-allowed" : "pointer",
              opacity: loading || saving ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {saving ? "처리 중..." : enabled ? "정지" : "재시작"}
          </button>
        </div>
      </div>

      {/* 최대 포지션 수 */}
      <div style={{ padding: "16px 20px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 8 }}>최대 동시 보유 종목 수</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            value={posInput}
            onChange={(e) => setPosInput(e.target.value)}
            min={1} max={20} step={1}
            style={controlInputStyle}
          />
          <span style={{ fontSize: 13, color: COLORS.mid }}>종목</span>
          <button
            disabled={saving || Number(posInput) === maxPositions}
            onClick={saveMaxPositions}
            style={{
              ...saveButtonStyle,
              background: posSaved ? "#22C55E" : COLORS.ink, color: "#fff",
              opacity: (saving || Number(posInput) === maxPositions) ? 0.5 : 1,
            }}
          >
            {posSaved ? "✓" : "저장"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 6 }}>
          현재 설정: {maxPositions}종목 · 보유 종목이 이 수에 도달하면 신규 매수 건너뜀
        </div>
      </div>

      {/* 섹터당 최대 종목 수 */}
      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 8 }}>섹터당 최대 보유 종목 수</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            value={secInput}
            onChange={(e) => setSecInput(e.target.value)}
            min={1} max={10} step={1}
            style={controlInputStyle}
          />
          <span style={{ fontSize: 13, color: COLORS.mid }}>종목</span>
          <button
            disabled={saving || Number(secInput) === maxPerSector}
            onClick={saveMaxPerSector}
            style={{
              ...saveButtonStyle,
              background: secSaved ? "#22C55E" : COLORS.ink, color: "#fff",
              opacity: (saving || Number(secInput) === maxPerSector) ? 0.5 : 1,
            }}
          >
            {secSaved ? "✓" : "저장"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 6 }}>
          현재 설정: {maxPerSector}종목 · 같은 섹터 종목이 이 수에 도달하면 신규 매수 건너뜀
        </div>
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 정지 확인 다이얼로그 */}
      {confirm && (
        <>
          <div onClick={() => setConfirm(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998,
          }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
            background: COLORS.bg, borderRadius: "20px 20px 0 0",
            padding: "24px 20px calc(24px + env(safe-area-inset-bottom))",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.line, margin: "0 auto 20px" }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>엔진을 정지할까요?</div>
            <div style={{ fontSize: 13, color: COLORS.mid, marginBottom: 24 }}>
              정지하면 다음 크론 실행 시 매매가 건너뜁니다. 재시작은 언제든 가능합니다.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(false)} style={{
                flex: 1, padding: "14px 0", borderRadius: 12,
                border: `1.5px solid ${COLORS.line}`, background: "transparent",
                color: COLORS.mid, fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>취소</button>
              <button onClick={() => toggle(false)} style={{
                flex: 2, padding: "14px 0", borderRadius: 12, border: "none",
                background: "#DC2626", color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>정지</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
