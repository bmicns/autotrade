"use client";

import { useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/ui/icons";

type Tab = "home" | "signal" | "portfolio" | "stats" | "strategy" | "settings";

const titles: Record<string, string> = {
  home: "", signal: "신호 승인", portfolio: "포트폴리오",
  stats: "통계", strategy: "전략", settings: "설정",
};

const MENU_ITEMS: { id: Tab; icon: "home" | "signal" | "pie" | "bar" | "star" | "gear"; label: string }[] = [
  { id: "home", icon: "home", label: "홈" },
  { id: "signal", icon: "signal", label: "신호 승인" },
  { id: "portfolio", icon: "pie", label: "포트폴리오" },
  { id: "stats", icon: "bar", label: "통계" },
  { id: "strategy", icon: "star", label: "전략" },
  { id: "settings", icon: "gear", label: "설정" },
];

export function TopBar() {
  const { tab, setTab, autoTrade, toggleAutoTrade } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = tab === "home";

  // 탭 히스토리 기반 뒤로가기 (이전 탭 = 홈)
  const handleBack = () => setTab("home");
  const handleHome = () => setTab("home");
  const handleMenuNav = (id: Tab) => { setTab(id); setMenuOpen(false); };

  return (
    <>
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
            {/* 왼쪽: 뒤로가기 + 홈 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={handleBack}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
                aria-label="뒤로가기"
              >
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
                  <polyline points="15 18 9 12 15 6" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={handleHome}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
                aria-label="홈으로"
              >
                <Icon name="home" size={18} color="#fff" strokeWidth={1.8} />
              </button>
            </div>

            {/* 중앙: 타이틀 */}
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>
              {titles[tab]}
            </span>

            {/* 오른쪽: 햄버거 메뉴 */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              aria-label="전체 메뉴"
            >
              <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
                <line x1="3" y1="6" x2="21" y2="6" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
                <line x1="3" y1="12" x2="21" y2="12" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
                <line x1="3" y1="18" x2="21" y2="18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* 전체 메뉴 오버레이 */}
      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 998, animation: "fadeIn .2s ease" }}
          />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: 260, zIndex: 999,
            background: COLORS.hero, padding: "20px 0",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
            animation: "slideRight .25s ease",
          }}>
            {/* 메뉴 헤더 */}
            <div style={{ padding: "8px 20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: "0.15em" }}>
                NEXIO<span style={{ color: COLORS.rise }}>.</span>
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                <Icon name="xx" size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
              </button>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 8 }} />

            {/* 메뉴 항목 */}
            {MENU_ITEMS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleMenuNav(item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    width: "100%", padding: "14px 24px",
                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                    border: "none", borderLeft: active ? `3px solid ${COLORS.rise}` : "3px solid transparent",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <Icon name={item.icon} size={18} color={active ? "#fff" : "rgba(255,255,255,0.5)"} strokeWidth={active ? 2 : 1.5} />
                  <span style={{
                    fontSize: 14, fontWeight: active ? 700 : 500,
                    color: active ? "#fff" : "rgba(255,255,255,0.6)",
                  }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          <style>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes slideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
          `}</style>
        </>
      )}
    </>
  );
}
