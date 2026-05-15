"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useEngineState } from "@/hooks/useEngineState";
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
  const { state: engineState, fetchEngineState } = useEngineState();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);
  const [operatorDisplayName, setOperatorDisplayName] = useState("");
  const [operatorSaved, setOperatorSaved] = useState(false);
  const [maxPositions, setMaxPositions] = useState(5);
  const [posInput, setPosInput] = useState("5");
  const [posSaved, setPosSaved] = useState(false);
  const [maxPerSector, setMaxPerSector] = useState(2);
  const [secInput, setSecInput] = useState("2");
  const [secSaved, setSecSaved] = useState(false);

  useEffect(() => {
    fetchEngineState();
    fetch("/api/engine-control")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(d.engine_enabled ?? true);
        setOperatorDisplayName(d.operator_display_name ?? "");
        setMaxPositions(d.max_positions ?? 5);
        setPosInput(String(d.max_positions ?? 5));
        setMaxPerSector(d.max_per_sector ?? 2);
        setSecInput(String(d.max_per_sector ?? 2));
      })
      .finally(() => setLoading(false));
  }, [fetchEngineState]);

  const healthStatus = engineState?.runtime.healthStatus.status ?? "unknown";
  const canRestartStaleEngine =
    enabled
    && healthStatus === "stale"
    && !engineState?.runtime.engineLocked;
  const hasStaleLock =
    engineState?.runtime.engineLockStale
    && !engineState?.runtime.engineLocked;

  const formatAgo = (minutes: number | null | undefined) => {
    if (minutes === null || minutes === undefined) return "미확인";
    if (minutes < 60) return `${minutes}분 전`;
    return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 전`;
  };

  const restartEngine = async () => {
    setRestarting(true);
    setRestartMessage(null);
    try {
      const res = await fetch("/api/engine-restart", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRestartMessage(data.error ?? "엔진 재가동 실패");
        return;
      }
      if (data.skipped) {
        setRestartMessage(data.reason ? `재가동 보류 · ${data.reason}` : "재가동 보류");
      } else {
        setRestartMessage("재가동 요청 완료");
      }
      await fetchEngineState();
    } catch {
      setRestartMessage("엔진 재가동 네트워크 오류");
    } finally {
      setRestarting(false);
    }
  };

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

  const saveOperatorDisplayName = async () => {
    const value = operatorDisplayName.trim();
    if (!value) return;
    setSaving(true);
    try {
      const res = await fetch("/api/engine-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorDisplayName: value }),
      });
      if (!res.ok) return;
      setOperatorDisplayName(value);
      setOperatorSaved(true);
      setTimeout(() => setOperatorSaved(false), 2000);
      await fetchEngineState();
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
      <div id="engine-control-section" style={{ padding: "20px 20px 10px", scrollMarginTop: 16 }}>
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

      {canRestartStaleEngine && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{
            padding: "14px 16px",
            borderRadius: 14,
            background: "#FFF7ED",
            border: "1.5px solid #FED7AA",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#C2410C" }}>
              엔진 지연 감지 · 마지막 실행 {formatAgo(engineState?.runtime.healthStatus.minutesSinceLastRun)}
            </div>
            <div style={{ fontSize: 11, color: "#9A3412", marginTop: 4, lineHeight: 1.5 }}>
              장중 실행 기록이 오래되어 수동 재가동이 필요합니다.
            </div>
            <button
              type="button"
              disabled={restarting || saving}
              onClick={restartEngine}
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#C2410C",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: restarting || saving ? "not-allowed" : "pointer",
                opacity: restarting || saving ? 0.6 : 1,
                fontFamily: "inherit",
              }}
            >
              {restarting ? "재가동 중..." : "엔진 재가동"}
            </button>
            {restartMessage && (
              <div style={{ fontSize: 11, color: restartMessage.includes("완료") ? "#15803D" : "#9A3412", marginTop: 8 }}>
                {restartMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {hasStaleLock && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{
            padding: "14px 16px",
            borderRadius: 14,
            background: "#FEF2F2",
            border: "1.5px solid #FECACA",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#B91C1C" }}>
              stale engine lock 감지
            </div>
            <div style={{ fontSize: 11, color: "#991B1B", marginTop: 4, lineHeight: 1.5 }}>
              마지막 lock {formatAgo(engineState?.runtime.engineLockAgeMinutes)} · 다음 엔진 실행 시 자동 회복 대상입니다.
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 8 }}>운영자 이름</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={operatorDisplayName}
            onChange={(e) => setOperatorDisplayName(e.target.value.slice(0, 24))}
            placeholder="홈 인사말에 표시할 이름"
            style={{ ...controlInputStyle, textAlign: "left" }}
          />
          <button
            disabled={saving || !operatorDisplayName.trim()}
            onClick={saveOperatorDisplayName}
            style={{
              ...saveButtonStyle,
              background: operatorSaved ? "#22C55E" : COLORS.ink,
              color: "#fff",
              opacity: (saving || !operatorDisplayName.trim()) ? 0.5 : 1,
            }}
          >
            {operatorSaved ? "✓" : "저장"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 6 }}>
          홈 상단 인사말에 사용하는 표시명입니다.
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
