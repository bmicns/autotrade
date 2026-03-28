"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

const titles: Record<string, string> = {
  home: "", signal: "신호 승인", portfolio: "포트폴리오",
  stats: "통계", strategy: "전략", settings: "설정",
};

export function TopBar() {
  const { tab, autoTrade, toggleAutoTrade } = useAppStore();
  const isHome = tab === "home";

  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-between backdrop-blur-xl"
      style={{
        background: isHome ? "rgba(15,15,46,0.97)" : "rgba(255,255,255,0.96)",
        borderBottom: `1px solid ${isHome ? "rgba(255,255,255,0.08)" : COLORS.line}`,
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 15,
        paddingBottom: 15,
      }}
    >
      {isHome ? (
        <div className="text-[20px] font-black tracking-[0.15em] text-white">
          NEXIO<span style={{ color: COLORS.rise }}>.</span>
        </div>
      ) : (
        <span className="text-sm font-bold" style={{ color: COLORS.ink }}>{titles[tab]}</span>
      )}
      {isHome && (
        <button
          onClick={toggleAutoTrade}
          className="flex items-center gap-2 rounded-full transition-all"
          style={{
            padding: "5px 30px",
            background: autoTrade ? COLORS.rise : "rgba(255,255,255,0.1)",
            border: `1px solid ${autoTrade ? COLORS.rise : "rgba(255,255,255,0.15)"}`,
          }}
        >
          {autoTrade && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          )}
          <span className="text-[11px] font-bold text-white">{autoTrade ? "ON" : "OFF"}</span>
        </button>
      )}
    </div>
  );
}
