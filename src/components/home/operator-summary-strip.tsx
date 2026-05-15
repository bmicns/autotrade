"use client";

import { COLORS } from "@/lib/constants";
import { formatRuntimeContextLine, formatRuntimeModeLabel } from "@/lib/nexio-display";
import type { EngineStateResponse } from "@/hooks/useEngineState";

interface SummaryCardItem {
  label: string;
  value: string;
  tone: string;
}

interface OperatorSummaryStripProps {
  state: EngineStateResponse["runtime"];
  summaryCards: SummaryCardItem[];
}

export function OperatorSummaryStrip({ state, summaryCards }: OperatorSummaryStripProps) {
  if (summaryCards.length === 0) return null;

  const switchTone = state.engineEnabled
    ? { bg: "#F0FDF4", border: "#BBF7D0", text: "#15803D", value: "활성" }
    : { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626", value: "정지" };
  const lockTone = state.engineLocked
    ? { bg: "#FFFBEB", border: "#FDE68A", text: "#B45309", value: "실행 중" }
    : { bg: COLORS.sub, border: COLORS.line, text: COLORS.ink, value: "대기 중" };

  return (
    <div style={{ margin: "12px 20px 0", padding: 14, borderRadius: 16, background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)", border: `1px solid ${COLORS.line}`, boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Operator Summary</div>
          <div style={{ marginTop: 5, fontSize: 18, fontWeight: 800, color: COLORS.ink }}>
            {formatRuntimeContextLine({
              brokerLabel: state.kisRuntime.brokerLabel,
              environment: state.environment,
              runtimeMode: state.kisRuntime.mode,
              profileLabel: state.kisRuntime.profileLabel,
              profileId: state.kisRuntime.profileId,
              accountMask: state.kisRuntime.accountMask,
              source: state.kisRuntime.source,
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: COLORS.mid }}>
            {state.healthStatus.status === "healthy" ? "엔진 정상" : state.healthStatus.status === "stale" ? "실행 지연" : state.healthStatus.status === "error" ? "상태 경고" : "상태 미확인"}
            {" · "}
            {formatRuntimeModeLabel(state.kisRuntime.mode)} 기준 운용 중
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ minWidth: 104, padding: "9px 11px", borderRadius: 12, background: switchTone.bg, border: `1px solid ${switchTone.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.dim }}>엔진 스위치</div>
            <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: switchTone.text }}>{switchTone.value}</div>
          </div>
          <div style={{ minWidth: 104, padding: "9px 11px", borderRadius: 12, background: lockTone.bg, border: `1px solid ${lockTone.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.dim }}>실행 상태</div>
            <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: lockTone.text }}>{lockTone.value}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        {summaryCards.map((item) => (
          <div key={item.label} style={{ padding: "12px 14px", borderRadius: 12, background: "#FFF", border: `1px solid ${COLORS.line}`, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>{item.label}</div>
            <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, color: item.tone, fontVariantNumeric: "tabular-nums" }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
