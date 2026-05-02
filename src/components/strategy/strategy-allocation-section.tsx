"use client";

import { useState, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { setStrategyAllocations, setMarketHolidays } from "@/actions/engine-control";

interface StrategyAllocations {
  watchlist_pullback: number;
  surge_momentum: number;
  institutional_follow: number;
}

interface Props {
  initialAllocations: StrategyAllocations;
  initialHolidays: string;
}

export function StrategyAllocationSection({ initialAllocations, initialHolidays }: Props) {
  const [strategyAllocations, setStrategyAllocationState] = useState<StrategyAllocations>(initialAllocations);
  const [allocationsSaving, setAllocationsSaving] = useState(false);
  const [allocationMessage, setAllocationMessage] = useState<string | null>(null);
  const [holidayInput, setHolidayInput] = useState(initialHolidays);
  const [savedHolidayInput, setSavedHolidayInput] = useState(initialHolidays);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidaySaved, setHolidaySaved] = useState(false);
  const [holidayError, setHolidayError] = useState<string | null>(null);

  const allocationTotal = Object.values(strategyAllocations).reduce((sum, v) => sum + v, 0);

  const handleAllocationChange = useCallback((key: keyof StrategyAllocations, value: string) => {
    const num = Math.max(0, Math.min(100, Number(value) || 0));
    setAllocationMessage(null);
    setStrategyAllocationState((prev) => ({ ...prev, [key]: num }));
  }, []);

  const handleAllocationSave = useCallback(async () => {
    setAllocationsSaving(true);
    setAllocationMessage(null);
    try {
      await setStrategyAllocations({
        watchlistPullback: strategyAllocations.watchlist_pullback,
        surgeMomentum: strategyAllocations.surge_momentum,
        institutionalFollow: strategyAllocations.institutional_follow,
      });
      setAllocationMessage("저장됨");
    } catch {
      setAllocationMessage("저장 실패");
    } finally {
      setAllocationsSaving(false);
    }
  }, [strategyAllocations]);

  const normalizedHolidayInput = holidayInput
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean)
    .join("\n");

  const handleHolidaySave = useCallback(async () => {
    const values = normalizedHolidayInput.split("\n").map((v) => v.trim()).filter(Boolean);
    for (const v of values) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        setHolidayError("휴장일은 YYYY-MM-DD 형식만 저장할 수 있습니다");
        return;
      }
    }
    setHolidaySaving(true);
    setHolidayError(null);
    try {
      await setMarketHolidays(values);
      const nextValue = values.join("\n");
      setHolidayInput(nextValue);
      setSavedHolidayInput(nextValue);
      setHolidaySaved(true);
      setTimeout(() => setHolidaySaved(false), 2000);
    } catch (error) {
      setHolidayError(error instanceof Error ? error.message : "휴장일 저장 실패");
    } finally {
      setHolidaySaving(false);
    }
  }, [normalizedHolidayInput]);

  return (
    <>
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>전략 배분</span>
      </div>
      <div style={{ padding: "0 20px 18px" }}>
        <div style={{ padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          {([
            ["watchlist_pullback", "관심종목 눌림목", COLORS.hero],
            ["surge_momentum", "급등 모멘텀", COLORS.rise],
            ["institutional_follow", "기관 추종", "#0F766E"],
          ] as const).map(([key, label, color], index) => (
            <div key={key} style={{ paddingTop: index === 0 ? 0 : 14, borderTop: index === 0 ? "none" : `1px solid ${COLORS.line}`, marginTop: index === 0 ? 0 : 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>{strategyAllocations[key].toFixed(1)}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={strategyAllocations[key]}
                onChange={(e) => handleAllocationChange(key, e.target.value)}
                style={{ width: "100%", accentColor: color }}
              />
            </div>
          ))}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: COLORS.mid }}>합계 {allocationTotal.toFixed(1)}% · 엔진에서 정규화해 사용</span>
            <button
              onClick={handleAllocationSave}
              disabled={allocationsSaving}
              style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: allocationsSaving ? COLORS.dim : COLORS.ink, color: "#fff", fontSize: 12, fontWeight: 700, cursor: allocationsSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {allocationsSaving ? "저장 중..." : "배분 저장"}
            </button>
          </div>
          {allocationMessage && (
            <div style={{ marginTop: 10, fontSize: 11, color: allocationMessage === "저장됨" ? "#15803D" : "#DC2626" }}>
              {allocationMessage}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: 10 }}>휴장일 오버라이드</div>
          <textarea
            value={holidayInput}
            onChange={(e) => { setHolidayInput(e.target.value); if (holidayError) setHolidayError(null); }}
            rows={5}
            placeholder={"2026-01-01\n2026-02-18"}
            style={{ width: "100%", resize: "vertical", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${holidayError ? "#FCA5A5" : COLORS.line}`, background: COLORS.bg, color: COLORS.ink, fontSize: 13, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: holidayError ? "#DC2626" : COLORS.dim }}>
              {holidayError || "한 줄에 하루씩 입력합니다. 주말, 5/1, 연말 최종 거래일은 자동 스킵됩니다."}
            </div>
            <button
              disabled={holidaySaving || normalizedHolidayInput === savedHolidayInput}
              onClick={handleHolidaySave}
              style={{ padding: "10px 14px", borderRadius: 10, border: "none", whiteSpace: "nowrap", background: holidaySaved ? "#22C55E" : COLORS.ink, color: "#fff", fontSize: 12, fontWeight: 700, cursor: holidaySaving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (holidaySaving || normalizedHolidayInput === savedHolidayInput) ? 0.5 : 1 }}
            >
              {holidaySaved ? "✓ 저장됨" : "휴장일 저장"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 6 }}>
            `app_config.market_holidays`로 저장되며, 엔진·observer·market-close가 공통으로 사용합니다.
          </div>
        </div>
      </div>
    </>
  );
}
