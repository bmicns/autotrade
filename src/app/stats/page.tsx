"use client";

import { useEffect, useState } from "react";

import { BottomBar } from "@/components/layout/bottom-bar";
import { SideBar } from "@/components/layout/side-bar";
import { TopBar } from "@/components/layout/top-bar";
import { StatsTab } from "@/components/stats/stats-tab";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

export default function StatsPage() {
  const hydrate = useAppStore((s) => s.hydrate);
  const setTab = useAppStore((s) => s.setTab);
  const marketScope = useAppStore((s) => s.marketScope);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    hydrate();
    setTab("stats");
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [hydrate, setTab]);

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg, color: COLORS.ink }}>
      {!isMobile && <SideBar />}
      <div style={{ marginLeft: isMobile ? 0 : 182 }}>
        <TopBar />
        <div style={{ paddingBottom: isMobile ? 120 : 40 }}>
          <StatsTab marketMode={marketScope} />
        </div>
      </div>
      {isMobile && <BottomBar />}
    </div>
  );
}
