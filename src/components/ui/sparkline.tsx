"use client";

export function Sparkline({ data, color, w = 56, h = 24 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return <div style={{ width: w, height: h }} />;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const xs = data.map((_, i) => (i / (data.length - 1)) * w);
  const ys = data.map((v) => h - ((v - mn) / (mx - mn || 1)) * (h - 2) - 1);
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  const id = `g${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
