"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

export function SignalTab() {
  const kisConnected = useAppStore((s) => s.kisConnected);

  return (
    <div style={{ padding: "60px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COLORS.dim} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
        </svg>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>대기 중인 신호 없음</span>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 13, color: COLORS.dim, lineHeight: 1.6 }}>
          {kisConnected
            ? "자동매매 엔진이 신호를 분석 중입니다. 약한 신호 발생 시 여기에 승인 요청이 표시됩니다."
            : "설정에서 KIS API를 연결하면 매매 신호가 표시됩니다."}
        </span>
      </div>
    </div>
  );
}
