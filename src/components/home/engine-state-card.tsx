"use client";

import { useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useEngineState } from "@/hooks/useEngineState";

function fmtKst(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EngineStateCard() {
  const { state, loading, fetchEngineState } = useEngineState();

  useEffect(() => {
    fetchEngineState();
  }, [fetchEngineState]);

  if (loading && !state) return null;
  if (!state) return null;

  return (
    <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>엔진 상태</span>
        <span style={{ fontSize: 11, color: COLORS.dim }}>최근 이벤트 {state.recentEvents.length}건</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "오픈 포지션", value: state.summary.openPositionCount, tone: COLORS.ink },
          { label: "대기 주문", value: state.summary.pendingOrderCount, tone: "#B45309" },
          { label: "대기 신호", value: state.summary.pendingSignalCount, tone: COLORS.rise },
        ].map((item) => (
          <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
            <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: item.tone }}>{item.value}</div>
          </div>
        ))}
      </div>

      {state.recentEvents.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {state.recentEvents.slice(0, 3).map((event) => (
            <div key={event.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 11, color: COLORS.mid }}>{event.eventType}{event.stockCode ? ` · ${event.stockCode}` : ""}</span>
              <span style={{ fontSize: 10, color: COLORS.dim, whiteSpace: "nowrap" }}>{fmtKst(event.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
