"use client";

import { useEffect, useState, type ReactNode } from "react";
import { COLORS } from "@/lib/constants";

interface HealthStatus {
  status: "healthy" | "stale" | "error" | "unknown";
  lastRunAt: string | null;
  minutesSinceLastRun: number | null;
}

function fmtKST(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  const mm  = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd  = String(kst.getUTCDate()).padStart(2, "0");
  const hh  = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

const STATUS_META: Record<HealthStatus["status"], { label: string; dotColor: string; bg: string; border: string; textColor: string }> = {
  healthy: { label: "정상",  dotColor: "#22C55E", bg: "#F0FDF4", border: "#BBF7D0", textColor: "#15803D" },
  stale:   { label: "지연",  dotColor: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", textColor: "#B45309" },
  error:   { label: "오류",  dotColor: "#EF4444", bg: "#FEF2F2", border: "#FECACA", textColor: "#DC2626" },
  unknown: { label: "확인 중", dotColor: COLORS.dim, bg: COLORS.sub, border: COLORS.line, textColor: COLORS.dim },
};

export function EngineHealthCard({ actionSlot }: { actionSlot?: ReactNode }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    fetch("/api/engine-log?limit=1")
      .then((r) => r.json())
      .then((d) => { if (d.healthStatus) setHealth(d.healthStatus); })
      .catch(() => {});
  }, []);

  if (!health) return null;

  const meta = STATUS_META[health.status];

  return (
    <div style={{
      margin: "10px 20px 0",
      padding: "10px 14px",
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: meta.textColor }}>엔진 {meta.label}</span>
        {health.lastRunAt && (
          <span style={{ fontSize: 11, color: COLORS.dim }}>
            마지막 실행 {fmtKST(health.lastRunAt)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {actionSlot}
        {health.minutesSinceLastRun !== null && (
          <span style={{ fontSize: 11, fontWeight: 600, color: meta.textColor }}>
            {health.minutesSinceLastRun < 60
              ? `${health.minutesSinceLastRun}분 전`
              : `${Math.floor(health.minutesSinceLastRun / 60)}시간 ${health.minutesSinceLastRun % 60}분 전`}
          </span>
        )}
      </div>
    </div>
  );
}
