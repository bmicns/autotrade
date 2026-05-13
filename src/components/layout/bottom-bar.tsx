"use client";

import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const { tab, setTab, pendingCount } = useAppStore();

  const navigate = (nextTab: typeof TABS[number]["id"]) => {
    setTab(nextTab);
    if (nextTab === "stats") {
      router.push("/stats");
      return;
    }
    if (nextTab === "settings") {
      router.push("/settings");
      return;
    }
    router.push("/");
  };

  return (
    <div
      className="md:hidden"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "space-around",
        paddingTop: 14,
        paddingBottom: "calc(22px + env(safe-area-inset-bottom))",
        background: "rgba(255,255,255,0.98)",
        borderTop: `1px solid ${COLORS.line}`,
        boxShadow: "0 -8px 24px rgba(15, 23, 42, 0.08)",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
      }}
    >
      {TABS.map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => navigate(t.id)}
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
