"use client";

import { COLORS } from "@/lib/constants";

export function Donut({ ratio = 62, size = 96 }: { ratio?: number; size?: number }) {
  const r = 36, cx = 48, cy = 48, sw = 10;
  const circ = 2 * Math.PI * r;
  const main = (ratio / 100) * circ;

  return (
    <svg width={size} height={size} viewBox="0 0 96 96">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.line} strokeWidth={sw} />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.rise} strokeWidth={sw}
        strokeDasharray={`${main} ${circ - main}`}
        style={{ transform: "rotate(-90deg)", transformOrigin: "48px 48px" }}
      />
    </svg>
  );
}
