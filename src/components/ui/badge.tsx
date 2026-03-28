"use client";

import { COLORS } from "@/lib/constants";

type Tone = "rise" | "fall" | "gold" | "ink" | "dim";

const toneMap: Record<Tone, { bg: string; border: string; color: string }> = {
  rise: { bg: COLORS.riseL, border: COLORS.riseB, color: COLORS.rise },
  fall: { bg: COLORS.fallL, border: COLORS.fallB, color: COLORS.fall },
  gold: { bg: "#FFF7E8", border: "#DDB84A", color: "#7A5200" },
  ink: { bg: COLORS.sub, border: COLORS.lineD, color: COLORS.ink },
  dim: { bg: COLORS.card, border: COLORS.line, color: COLORS.dim },
};

export function Badge({ label, tone = "dim" }: { label: string; tone?: Tone }) {
  const t = toneMap[tone];
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-[7px] py-[2px] text-[9px] font-semibold tracking-tight"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color }}
    >
      {label}
    </span>
  );
}
