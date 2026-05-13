"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/constants";

interface Snapshot {
  date: string;
  total_eval: number;
  total_pnl: number;
}

export function PortfolioChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio-snapshot")
      .then((r) => (r.ok ? r.json() : { snapshots: [] }))
      .then((d) => { if (Array.isArray(d.snapshots)) setSnapshots(d.snapshots); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || snapshots.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const vals = snapshots.map((s) => s.total_eval);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const range  = maxVal - minVal || 1;

    const PAD = { top: 20, right: 16, bottom: 28, left: 16 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const toX = (i: number) => PAD.left + (i / (snapshots.length - 1)) * chartW;
    const toY = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH;

    // 그라디언트 채우기
    const isUp = vals[vals.length - 1] >= vals[0];
    const fillColor = isUp ? COLORS.rise : COLORS.fall;
    const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    grad.addColorStop(0, fillColor + "33");
    grad.addColorStop(1, fillColor + "00");

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(vals[0]));
    for (let i = 1; i < snapshots.length; i++) {
      ctx.lineTo(toX(i), toY(vals[i]));
    }
    ctx.lineTo(toX(snapshots.length - 1), H - PAD.bottom);
    ctx.lineTo(toX(0), H - PAD.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 라인
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(vals[0]));
    for (let i = 1; i < snapshots.length; i++) ctx.lineTo(toX(i), toY(vals[i]));
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // X축 날짜 레이블 (최대 4개)
    ctx.fillStyle = COLORS.dim;
    ctx.font = `10px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor((snapshots.length - 1) / 3));
    for (let i = 0; i < snapshots.length; i += step) {
      const d = snapshots[i].date.slice(5); // MM-DD
      ctx.fillText(d, toX(i), H - 6);
    }
    // 마지막 날짜 항상 표시
    const lastD = snapshots[snapshots.length - 1].date.slice(5);
    ctx.fillText(lastD, toX(snapshots.length - 1), H - 6);
  }, [snapshots]);

  if (loading) return (
    <div style={{ padding: "12px 0", textAlign: "center", fontSize: 12, color: COLORS.dim }}>차트 로딩 중...</div>
  );

  if (snapshots.length < 2) return (
    <div style={{ padding: "12px 0", textAlign: "center", fontSize: 12, color: COLORS.dim }}>
      자산 추이 데이터가 부족합니다 (2일 이상 필요)
    </div>
  );

  const first = snapshots[0].total_eval;
  const last  = snapshots[snapshots.length - 1].total_eval;
  const returnPct = first > 0 ? ((last - first) / first) * 100 : 0;
  const isUp = returnPct >= 0;

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          자산 추이 ({snapshots.length}일)
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: isUp ? COLORS.rise : COLORS.fall }}>
          {isUp ? "+" : ""}{returnPct.toFixed(2)}%
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 120, display: "block" }}
      />
    </div>
  );
}
