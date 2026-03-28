"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/ui/icons";

const TABS = [
  { id: "home" as const, icon: "home" as const, label: "홈" },
  { id: "signal" as const, icon: "signal" as const, label: "신호승인", badge: 2 },
  { id: "portfolio" as const, icon: "pie" as const, label: "포트폴리오" },
  { id: "stats" as const, icon: "bar" as const, label: "통계" },
  { id: "strategy" as const, icon: "star" as const, label: "전략" },
  { id: "settings" as const, icon: "gear" as const, label: "설정" },
];

export function SideBar() {
  const { tab, setTab } = useAppStore();

  return (
    <div
      className="fixed left-0 top-0 hidden h-screen w-[200px] flex-col md:flex"
      style={{ background: COLORS.bg, borderRight: `1px solid ${COLORS.line}` }}
    >
      <div className="border-b px-5 pb-5 pt-6" style={{ borderColor: COLORS.line }}>
        <div className="text-[15px] font-black tracking-[0.15em]" style={{ color: COLORS.ink }}>
          NEXIO<span style={{ color: COLORS.rise }}>.</span>
        </div>
        <span className="text-xs" style={{ color: COLORS.dim }}>자동매매 시스템</span>
      </div>
      <div className="flex-1 p-3">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative mb-[2px] flex w-full items-center gap-2.5 rounded-xl border-none px-3 py-2.5"
              style={{ background: on ? `${COLORS.rise}12` : "transparent" }}
            >
              <Icon name={t.icon} size={18} color={on ? COLORS.rise : COLORS.mid} strokeWidth={on ? 2 : 1.5} />
              <span className="text-sm" style={{ fontWeight: on ? 700 : 500, color: on ? COLORS.rise : COLORS.mid }}>
                {t.label}
              </span>
              {t.badge && (
                <span className="absolute right-3 flex h-[17px] w-[17px] items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: COLORS.rise }}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="border-t px-5 py-4" style={{ borderColor: COLORS.line }}>
        <span className="text-xs" style={{ color: COLORS.dim }}>v2.0 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
