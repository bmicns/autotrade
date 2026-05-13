"use client";

import { COLORS } from "@/lib/constants";

interface ActionLinkChipProps {
  label: string;
  onClick: () => void;
  tone?: "default" | "accent" | "warn";
}

export function ActionLinkChip({ label, onClick, tone = "default" }: ActionLinkChipProps) {
  const color =
    tone === "accent" ? "#0F766E" :
    tone === "warn" ? "#92400E" :
    COLORS.mid;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        border: `1px solid ${COLORS.line}`,
        background: "#FFFFFF",
        color,
        fontSize: 10,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
