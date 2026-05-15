"use client";

import { COLORS } from "@/lib/constants";
import type { EngineStateResponse } from "@/hooks/useEngineState";

interface HomeAlertStripProps {
  runtime: EngineStateResponse["runtime"];
  kisConnected: boolean;
  holdingRiskCount: number;
  marketMode: "kr" | "us";
}

interface AlertItem {
  label: string;
  tone: "danger" | "warn" | "ok" | "neutral";
}

const TONE_STYLE = {
  danger: { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" },
  warn: { bg: "#FFFBEB", border: "#FDE68A", text: "#B45309" },
  ok: { bg: "#F0FDF4", border: "#BBF7D0", text: "#15803D" },
  neutral: { bg: "#F8FAFC", border: COLORS.line, text: COLORS.mid },
} as const;

export function HomeAlertStrip({ runtime, kisConnected, holdingRiskCount, marketMode }: HomeAlertStripProps) {
  const alerts: AlertItem[] = [];

  if (!runtime.engineEnabled) {
    alerts.push({ label: "엔진 정지 상태", tone: "danger" });
  }
  if (runtime.engineLocked) {
    alerts.push({ label: "엔진 실행 락 유지 중", tone: "warn" });
  }
  if (runtime.healthStatus.status === "error") {
    alerts.push({ label: "엔진 상태 오류 감지", tone: "danger" });
  } else if (runtime.healthStatus.status === "stale") {
    alerts.push({ label: "엔진 실행 지연", tone: "warn" });
  }
  if (!kisConnected) {
    alerts.push({ label: `${runtime.kisRuntime.brokerLabel} 연결 미확인`, tone: "warn" });
  }
  if (holdingRiskCount > 0) {
    alerts.push({ label: `${marketMode === "us" ? "해외" : "국내"} 보유 뉴스 경고 ${holdingRiskCount}건`, tone: "danger" });
  }
  if (alerts.length === 0) {
    alerts.push({ label: "즉시 대응 경고 없음", tone: "ok" });
  }

  return (
    <div style={{ margin: "12px 20px 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
      {alerts.map((item) => {
        const tone = TONE_STYLE[item.tone];
        return (
          <div
            key={item.label}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: `1px solid ${tone.border}`,
              background: tone.bg,
              color: tone.text,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.01em",
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
