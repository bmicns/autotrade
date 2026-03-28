"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { COLORS } from "@/lib/constants";
import { TopBar } from "@/components/layout/top-bar";
import { BottomBar } from "@/components/layout/bottom-bar";
import { SideBar } from "@/components/layout/side-bar";
import { HomeTab } from "@/components/home/home-tab";
import { SignalTab } from "@/components/signal/signal-tab";
import { PortfolioTab } from "@/components/portfolio/portfolio-tab";
import { StatsTab } from "@/components/stats/stats-tab";
import { StrategyTab } from "@/components/strategy/strategy-tab";
import { SettingsTab } from "@/components/settings/settings-tab";

export default function App() {
  const { tab, hydrate } = useAppStore();
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    hydrate();
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [hydrate]);

  const page = () => {
    switch (tab) {
      case "home": return <HomeTab />;
      case "signal": return <SignalTab />;
      case "portfolio": return <PortfolioTab />;
      case "stats": return <StatsTab />;
      case "strategy": return <StrategyTab />;
      case "settings": return <SettingsTab />;
    }
  };

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg, color: COLORS.ink }}>
      {!isMobile && <SideBar />}
      <div style={{ marginLeft: isMobile ? 0 : 182 }}>
        <TopBar />
        <div style={{ paddingBottom: isMobile ? 90 : 40 }}>
          {page()}
        </div>
      </div>
      {isMobile && <BottomBar />}
    </div>
  );
}
