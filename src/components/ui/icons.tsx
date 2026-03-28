"use client";

import { COLORS } from "@/lib/constants";

type IconName = "home" | "signal" | "pie" | "bar" | "star" | "gear" | "up" | "dn" | "ok" | "xx" | "cr" | "trend" | "clock" | "trash" | "key" | "wifi";

export function Icon({ name, size = 20, color = COLORS.ink, strokeWidth = 1.5 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const s = { width: size, height: size, display: "block" as const, flexShrink: 0 };
  const p = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  const paths: Record<IconName, React.ReactNode> = {
    home: <><path {...p} d="M3 10L12 3l9 7v10a1 1 0 01-1 1H4a1 1 0 01-1-1V10z" /><path {...p} d="M9 21V13h6v8" /></>,
    signal: <><circle {...p} cx="12" cy="12" r="9" /><polyline {...p} points="12 7 12 12 15 14" /></>,
    pie: <><path {...p} d="M21.21 15.89A10 10 0 118 2.83" /><path {...p} d="M22 12A10 10 0 0012 2v10z" /></>,
    bar: <><line {...p} x1="18" y1="20" x2="18" y2="10" /><line {...p} x1="12" y1="20" x2="12" y2="4" /><line {...p} x1="6" y1="20" x2="6" y2="14" /></>,
    star: <polygon {...p} points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
    gear: <><circle {...p} cx="12" cy="12" r="3" /><circle {...p} cx="12" cy="12" r="8" strokeDasharray="2.5 2" /></>,
    up: <><line {...p} x1="12" y1="19" x2="12" y2="5" /><polyline {...p} points="5 12 12 5 19 12" /></>,
    dn: <><line {...p} x1="12" y1="5" x2="12" y2="19" /><polyline {...p} points="19 12 12 19 5 12" /></>,
    ok: <polyline {...p} points="20 6 9 17 4 12" />,
    xx: <><line {...p} x1="18" y1="6" x2="6" y2="18" /><line {...p} x1="6" y1="6" x2="18" y2="18" /></>,
    cr: <polyline {...p} points="9 18 15 12 9 6" />,
    trend: <><polyline {...p} points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline {...p} points="17 6 23 6 23 12" /></>,
    clock: <><circle {...p} cx="12" cy="12" r="9" /><polyline {...p} points="12 7 12 12 15.5 13.5" /></>,
    trash: <><polyline {...p} points="3 6 5 6 21 6" /><path {...p} d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></>,
    key: <><circle {...p} cx="7" cy="17" r="4" /><line {...p} x1="10.5" y1="13.5" x2="21" y2="3" /></>,
    wifi: <><path {...p} d="M5 12.55a11 11 0 0114.08 0" /><path {...p} d="M8.53 16.11a6 6 0 016.95 0" /><circle {...p} cx="12" cy="20" r="1" fill={color} /></>,
  };

  return <svg viewBox="0 0 24 24" style={s}>{paths[name] ?? null}</svg>;
}
