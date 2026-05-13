"use client";

import { useEffect, useState } from "react";

import { BottomBar } from "@/components/layout/bottom-bar";
import { SideBar } from "@/components/layout/side-bar";
import { TopBar } from "@/components/layout/top-bar";
import { EngineV2ScenarioPage } from "@/components/engine-v2/scenario-page";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

export default function EngineV2Page() {
  const hydrate = useAppStore((s) => s.hydrate);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    hydrate();
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [hydrate]);

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg, color: COLORS.ink }}>
      {!isMobile && <SideBar />}
      <div style={{ marginLeft: isMobile ? 0 : 182 }}>
        <TopBar />
        <div style={{ paddingBottom: isMobile ? 120 : 40 }}>
          <EngineV2ScenarioPage />
        </div>
      </div>
      {isMobile && <BottomBar />}
    </div>
  );
}
