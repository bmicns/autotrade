"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/ui/icons";

const TABS = [
  { id: "home" as const, icon: "home" as const, label: "홈" },
  { id: "signal" as const, icon: "signal" as const, label: "신호승인" },
  { id: "portfolio" as const, icon: "pie" as const, label: "포트폴리오" },
  { id: "stats" as const, icon: "bar" as const, label: "통계" },
  { id: "strategy" as const, icon: "star" as const, label: "전략" },
  { id: "settings" as const, icon: "gear" as const, label: "설정" },
];

export function BottomBar() {
  const { tab, setTab, pendingCount } = useAppStore();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] flex justify-around pb-[22px] backdrop-blur-xl md:hidden"
      style={{ background: "rgba(255,255,255,0.96)", borderTop: `1px solid ${COLORS.line}`, paddingTop: 14 }}
    >
      {TABS.map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="relative flex min-w-0 flex-col items-center gap-[3px] border-none bg-transparent px-2 py-[2px]"
          >
            <Icon name={t.icon} size={20} color={on ? COLORS.rise : COLORS.dim} strokeWidth={on ? 2 : 1.5} />
            <span
              className="text-[10px]"
              style={{ fontWeight: on ? 700 : 400, color: on ? COLORS.rise : COLORS.dim }}
            >
              {t.label}
            </span>
            {t.id === "signal" && pendingCount > 0 && (
              <span className="absolute right-1 top-0 flex h-[15px] w-[15px] items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: COLORS.rise }}>
                {pendingCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
