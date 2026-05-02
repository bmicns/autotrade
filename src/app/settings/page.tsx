"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { COLORS } from "@/lib/constants";
import { TopBar } from "@/components/layout/top-bar";
import { BottomBar } from "@/components/layout/bottom-bar";
import { SideBar } from "@/components/layout/side-bar";
import { SettingsTab } from "@/components/settings/settings-tab";

/**
 * /settings 전용 페이지 라우트.
 * E2E TC-03: `page.goto("/settings")` 후 KIS 설정 폼 존재 확인.
 */
export default function SettingsPage() {
  const hydrate = useAppStore((s) => s.hydrate);
  const setTab = useAppStore((s) => s.setTab);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    hydrate();
    setTab("settings");
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
        <div style={{ paddingBottom: isMobile ? 90 : 40 }}>
          <SettingsTab />
        </div>
      </div>
      {isMobile && <BottomBar />}
    </div>
  );
}
