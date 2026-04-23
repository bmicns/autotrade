"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import type { PortfolioSnapshot } from "@/app/api/portfolio-snapshot/route";

function calcMdd(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 2) return 0;
  let peak = snapshots[0].total_eval;
  let mdd  = 0;
  for (const s of snapshots) {
    if (s.total_eval > peak) peak = s.total_eval;
    const drawdown = peak > 0 ? (s.total_eval - peak) / peak * 100 : 0;
    if (drawdown < mdd) mdd = drawdown;
  }
  return mdd;
}

function calcReturn(snapshots: PortfolioSnapshot[], days: number): number | null {
  if (snapshots.length < 2) return null;
  const last  = snapshots[snapshots.length - 1];
  const cutoff = new Date(Date.now() + 9 * 3600000 - days * 86400000).toISOString().slice(0, 10);
  const base  = snapshots.find((s) => s.date >= cutoff);
  if (!base || base.total_eval === 0) return null;
  return (last.total_eval - base.total_eval) / base.total_eval * 100;
}

interface SvgLineProps {
  snapshots: PortfolioSnapshot[];
  width: number;
  height: number;
}

function SvgLine({ snapshots, width, height }: SvgLineProps) {
  if (snapshots.length < 2) return null;
  const vals  = snapshots.map((s) => s.total_eval);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 1;
  const pad   = 8;
  const W     = width  - pad * 2;
  const H     = height - pad * 2;

  const points = snapshots.map((s, i) => {
    const x = pad + (i / (snapshots.length - 1)) * W;
    const y = pad + (1 - (s.total_eval - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const maxIdx = vals.indexOf(max);
  const minIdx = vals.indexOf(min);
  const mx = pad + (maxIdx / (snapshots.length - 1)) * W;
  const my = pad;
  const lx = pad + (minIdx / (snapshots.length - 1)) * W;
  const ly = pad + H;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={COLORS.hero}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={mx} cy={my} r={4} fill={COLORS.rise} />
      <circle cx={lx} cy={ly} r={4} fill={COLORS.fall} />
    </svg>
  );
}

export function PortfolioSnapshot() {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/portfolio-snapshot")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.snapshots)) setSnapshots(d.snapshots);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>추이 로딩 중...</span>
      </div>
    );
  }

  if (snapshots.length < 2) {
    return (
      <div style={{ padding: "12px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>스냅샷 데이터가 쌓이면 차트가 표시됩니다</span>
      </div>
    );
  }

  const mdd  = calcMdd(snapshots);
  const ret7 = calcReturn(snapshots, 7);
  const ret30 = calcReturn(snapshots, 30);
  const fmt  = (v: number | null) => v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <div style={{ padding: "16px 20px 20px" }}>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
          포트폴리오 추이
        </span>
      </div>
      <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden", background: COLORS.sub }}>
        <div style={{ padding: "12px 12px 4px" }}>
          <SvgLine snapshots={snapshots} width={300} height={80} />
        </div>
        <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${COLORS.line}` }}>
          {[
            { label: "MDD",    value: fmt(mdd),  color: mdd < 0 ? COLORS.fall : COLORS.dim },
            { label: "7일",    value: fmt(ret7),  color: ret7 !== null && ret7 >= 0 ? COLORS.rise : COLORS.fall },
            { label: "30일",   value: fmt(ret30), color: ret30 !== null && ret30 >= 0 ? COLORS.rise : COLORS.fall },
          ].map((item, i, arr) => (
            <div key={item.label} style={{
              flex: 1, padding: "10px 12px", textAlign: "center",
              borderRight: i < arr.length - 1 ? `1px solid ${COLORS.line}` : "none",
            }}>
              <div style={{ fontSize: 10, color: COLORS.dim, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontVariantNumeric: "tabular-nums" }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
