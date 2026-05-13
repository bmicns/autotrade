"use client";

import { useRouter } from "next/navigation";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/ui/icons";
import { MarketScopeBar } from "@/components/layout/market-scope-bar";

const titles: Record<string, string> = {
  home: "", signal: "신호 승인", portfolio: "포트폴리오",
  stats: "통계", strategy: "전략", settings: "설정",
};

export function TopBar() {
  const router = useRouter();
  const { tab, setTab } = useAppStore();
  const isHome = tab === "home";
  const showMarketScope = tab === "home" || tab === "signal" || tab === "portfolio" || tab === "stats";
  const goHome = () => {
    setTab("home");
    router.push("/");
  };

  return (
    <div
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: "rgba(15,15,46,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "9px 16px",
      }}
    >
      {isHome ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div className="text-[20px] font-black tracking-[0.15em] text-white">
            NEXIO<span style={{ color: COLORS.rise }}>.</span>
          </div>
          {showMarketScope && (
            <div style={{ minWidth: 98 }}>
              <MarketScopeBar compact dark />
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* 왼쪽: 뒤로가기 */}
          <button
            onClick={goHome}
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

          {/* 오른쪽: 시장 + 홈 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showMarketScope && (
              <div style={{ minWidth: 98 }}>
                <MarketScopeBar compact dark />
              </div>
            )}
            <button
              onClick={goHome}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              aria-label="홈으로"
            >
              <Icon name="home" size={20} color="#fff" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
