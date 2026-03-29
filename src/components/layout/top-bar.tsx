"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/ui/icons";

const titles: Record<string, string> = {
  home: "", signal: "신호 승인", portfolio: "포트폴리오",
  stats: "통계", strategy: "전략", settings: "설정",
};

export function TopBar() {
  const { tab, setTab, autoTrade, toggleAutoTrade } = useAppStore();
  const isHome = tab === "home";

  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-between backdrop-blur-xl"
      style={{
        background: "rgba(15,15,46,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "12px 16px",
      }}
    >
      {isHome ? (
        <>
          <div className="text-[20px] font-black tracking-[0.15em] text-white">
            NEXIO<span style={{ color: COLORS.rise }}>.</span>
          </div>
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
        </>
      ) : (
        <>
          {/* 왼쪽: 뒤로가기 */}
          <button
            onClick={() => setTab("home")}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
            aria-label="뒤로가기"
          >
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
              <polyline points="15 18 9 12 15 6" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* 중앙: 타이틀 */}
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>
            {titles[tab]}
          </span>

          {/* 오른쪽: 홈 */}
          <button
            onClick={() => setTab("home")}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
            aria-label="홈으로"
          >
            <Icon name="home" size={20} color="#fff" strokeWidth={1.8} />
          </button>
        </>
      )}
    </div>
  );
}
