"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

interface Props {
  compact?: boolean;
  dark?: boolean;
}

export function MarketScopeBar({ compact = false, dark = false }: Props) {
  const marketScope = useAppStore((s) => s.marketScope);
  const setMarketScope = useAppStore((s) => s.setMarketScope);
  const wrapperBackground = dark ? "rgba(255,255,255,0.08)" : COLORS.sub;
  const idleBackground = dark ? "transparent" : COLORS.bg;
  const idleColor = dark ? "rgba(255,255,255,0.72)" : COLORS.ink;

  return (
    <div style={{ padding: compact ? 0 : "16px 20px 0" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: compact ? 4 : 6,
          padding: compact ? 2 : 4,
          borderRadius: compact ? 10 : 12,
          background: wrapperBackground,
          border: dark ? "1px solid rgba(255,255,255,0.08)" : `1px solid ${COLORS.line}`,
        }}
      >
        {[
          { key: "kr" as const, label: "국내" },
          { key: "us" as const, label: "해외" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMarketScope(item.key)}
            style={{
              padding: compact ? "6px 0" : "10px 0",
              borderRadius: compact ? 8 : 10,
              border: "none",
              background: marketScope === item.key ? COLORS.hero : idleBackground,
              color: marketScope === item.key ? "#fff" : idleColor,
              fontSize: compact ? 11 : 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
