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
      className="fixed left-0 top-0 hidden h-screen w-[182px] flex-col md:flex"
      style={{ background: COLORS.bg, borderRight: `1px solid ${COLORS.line}` }}
    >
      {/* 로고 — CLIO 사이드바 높이/패딩 통일 */}
      <div className="flex items-center h-[56px] flex-shrink-0" style={{ paddingLeft: 20 }}>
        <div className="text-[15px] font-black tracking-[0.15em]" style={{ color: COLORS.ink }}>
          NEXIO<span style={{ color: COLORS.rise }}>.</span>
        </div>
      </div>

      {/* 네비게이션 — CLIO 간격 통일 */}
      <nav className="flex-1 flex flex-col overflow-y-auto" style={{ gap: 12, paddingLeft: 20, paddingRight: 12, paddingTop: 40, paddingBottom: 20 }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative flex w-full items-center gap-2.5 border-none py-2"
              style={{ background: "transparent" }}
            >
              <Icon name={t.icon} size={17} color={on ? COLORS.rise : COLORS.mid} strokeWidth={on ? 2 : 1.5} />
              <span className="text-[13px]" style={{ fontWeight: on ? 700 : 500, color: on ? COLORS.rise : COLORS.mid }}>
                {t.label}
              </span>
              {t.badge && (
                <span className="absolute right-0 flex h-[17px] w-[17px] items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: COLORS.rise }}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 하단 — CLIO 통일 */}
      <div className="flex-shrink-0" style={{ marginBottom: 30, paddingLeft: 20, paddingRight: 12 }}>
        <span className="text-[10px]" style={{ color: COLORS.dim }}>v3.1 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
