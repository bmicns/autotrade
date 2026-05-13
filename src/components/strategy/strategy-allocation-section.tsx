"use client";

import { useState, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { saveSurgeSettings, setStrategyAllocations, setMarketHolidays } from "@/actions/engine-control";

interface StrategyAllocations {
  watchlist_pullback: number;
  surge_momentum: number;
  institutional_follow: number;
}

interface Props {
  initialAllocations: StrategyAllocations;
  initialSurgeSettings: {
    maxDailyEntriesPerStock: number;
    reentryBuyRatio: number;
    trailingPartialExitRatio: number;
    tightStopLoss: number;
    tightTrailingStop: number;
    openBonus: number;
    morningBonus: number;
    latePenalty: number;
    reentryCooldownMinutes: number;
    newsPositiveBonus: number;
    newsNegativePenalty: number;
    newsRiskCooldownMinutes: number;
    learningRiskAdjustmentsEnabled: boolean;
    manualUsBuyNoteTemplates: string[];
    manualUsSellNoteTemplates: string[];
  };
  initialHolidays: string;
}

export function StrategyAllocationSection({ initialAllocations, initialSurgeSettings, initialHolidays }: Props) {
  const [strategyAllocations, setStrategyAllocationState] = useState<StrategyAllocations>(initialAllocations);
  const [surgeSettings, setSurgeSettingsState] = useState(initialSurgeSettings);
  const [allocationsSaving, setAllocationsSaving] = useState(false);
  const [allocationMessage, setAllocationMessage] = useState<string | null>(null);
  const [surgeSaving, setSurgeSaving] = useState(false);
  const [surgeMessage, setSurgeMessage] = useState<string | null>(null);
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

  const handleSurgeChange = useCallback((key: keyof typeof initialSurgeSettings, value: string) => {
    const parsed = Number(value);
    setSurgeMessage(null);
    setSurgeSettingsState((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }));
  }, []);

  const handleSurgeSave = useCallback(async () => {
    setSurgeSaving(true);
    setSurgeMessage(null);
    try {
      await saveSurgeSettings({
        surgeMaxDailyEntriesPerStock: Math.max(2, Math.min(10, Math.round(surgeSettings.maxDailyEntriesPerStock))),
        surgeReentryBuyRatio: Math.max(0.1, Math.min(1, Math.round(surgeSettings.reentryBuyRatio * 100) / 100)),
        surgeTrailingPartialExitRatio: Math.max(10, Math.min(90, Math.round(surgeSettings.trailingPartialExitRatio))),
        surgeTightStopLoss: Math.max(0.5, Math.min(10, Math.round(surgeSettings.tightStopLoss * 10) / 10)),
        surgeTightTrailingStop: Math.max(0.5, Math.min(10, Math.round(surgeSettings.tightTrailingStop * 10) / 10)),
        surgeOpenBonus: Math.max(0, Math.min(20, Math.round(surgeSettings.openBonus))),
        surgeMorningBonus: Math.max(0, Math.min(20, Math.round(surgeSettings.morningBonus))),
        surgeLatePenalty: Math.max(0, Math.min(20, Math.round(surgeSettings.latePenalty))),
        surgeReentryCooldownMinutes: Math.max(0, Math.min(120, Math.round(surgeSettings.reentryCooldownMinutes))),
        surgeNewsPositiveBonus: Math.max(0, Math.min(20, Math.round(surgeSettings.newsPositiveBonus))),
        surgeNewsNegativePenalty: Math.max(0, Math.min(20, Math.round(surgeSettings.newsNegativePenalty))),
        surgeNewsRiskCooldownMinutes: Math.max(0, Math.min(240, Math.round(surgeSettings.newsRiskCooldownMinutes))),
        learningRiskAdjustmentsEnabled: surgeSettings.learningRiskAdjustmentsEnabled,
        manualUsBuyNoteTemplates: surgeSettings.manualUsBuyNoteTemplates,
        manualUsSellNoteTemplates: surgeSettings.manualUsSellNoteTemplates,
      });
      setSurgeMessage("저장됨");
    } catch {
      setSurgeMessage("저장 실패");
    } finally {
      setSurgeSaving(false);
    }
  }, [surgeSettings]);

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

      <div style={{ padding: "0 20px 18px" }}>
        <div style={{ padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: 12 }}>급등주 전용 운영값</div>
          {([
            ["maxDailyEntriesPerStock", "종목당 일일 진입 횟수", 2, 10, 1],
            ["reentryBuyRatio", "재진입 비중", 0.1, 1, 0.05],
            ["trailingPartialExitRatio", "1차 부분청산 비율", 10, 90, 1],
            ["tightStopLoss", "급등주 손절 라인", 0.5, 10, 0.1],
            ["tightTrailingStop", "급등주 트레일링 라인", 0.5, 10, 0.1],
            ["openBonus", "장초반 보너스", 0, 20, 1],
            ["morningBonus", "오전 보너스", 0, 20, 1],
            ["latePenalty", "장마감 패널티", 0, 20, 1],
            ["reentryCooldownMinutes", "재진입 쿨다운", 0, 120, 1],
            ["newsPositiveBonus", "긍정 뉴스 보너스", 0, 20, 1],
            ["newsNegativePenalty", "악재 뉴스 패널티", 0, 20, 1],
            ["newsRiskCooldownMinutes", "악재 뉴스 쿨다운", 0, 240, 5],
          ] as const).map(([key, label, min, max, step], index) => (
            <div key={key} style={{ paddingTop: index === 0 ? 0 : 14, borderTop: index === 0 ? "none" : `1px solid ${COLORS.line}`, marginTop: index === 0 ? 0 : 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.rise }}>
                  {key === "reentryBuyRatio"
                    ? `${Math.round(surgeSettings[key] * 100)}%`
                    : key.includes("Loss") || key.includes("Trailing") || key.includes("Bonus") || key.includes("Penalty")
                      ? `${surgeSettings[key]}${key.includes("Cooldown") ? "분" : "%"}` 
                      : key.includes("Cooldown")
                        ? `${surgeSettings[key]}분`
                        : key.includes("Ratio")
                          ? `${surgeSettings[key]}%`
                          : `${surgeSettings[key]}`}
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={surgeSettings[key]}
                onChange={(e) => handleSurgeChange(key, e.target.value)}
                style={{ width: "100%", accentColor: COLORS.rise }}
              />
            </div>
          ))}
          <div style={{ paddingTop: 14, borderTop: `1px solid ${COLORS.line}`, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>학습 리스크 보정</div>
                <div style={{ marginTop: 4, fontSize: 11, color: COLORS.dim }}>
                  시간대·진입타입·뉴스키워드 학습 패널티를 급등주 점수에 반영합니다.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSurgeMessage(null);
                  setSurgeSettingsState((prev) => ({ ...prev, learningRiskAdjustmentsEnabled: !prev.learningRiskAdjustmentsEnabled }));
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${surgeSettings.learningRiskAdjustmentsEnabled ? "#86EFAC" : COLORS.line}`,
                  background: surgeSettings.learningRiskAdjustmentsEnabled ? "#DCFCE7" : COLORS.bg,
                  color: surgeSettings.learningRiskAdjustmentsEnabled ? "#15803D" : COLORS.dim,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {surgeSettings.learningRiskAdjustmentsEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          <div style={{ paddingTop: 14, borderTop: `1px solid ${COLORS.line}`, marginTop: 14, display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>미국 매수 메모 템플릿</div>
              <textarea
                value={surgeSettings.manualUsBuyNoteTemplates.join("\n")}
                onChange={(e) => {
                  setSurgeMessage(null);
                  setSurgeSettingsState((prev) => ({
                    ...prev,
                    manualUsBuyNoteTemplates: e.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 12),
                  }));
                }}
                rows={3}
                placeholder="선캐치&#10;재진입&#10;뉴스반응"
                style={{ width: "100%", resize: "vertical", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.bg, color: COLORS.ink, fontSize: 12, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>미국 매도 메모 템플릿</div>
              <textarea
                value={surgeSettings.manualUsSellNoteTemplates.join("\n")}
                onChange={(e) => {
                  setSurgeMessage(null);
                  setSurgeSettingsState((prev) => ({
                    ...prev,
                    manualUsSellNoteTemplates: e.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 12),
                  }));
                }}
                rows={3}
                placeholder="익절&#10;리스크축소&#10;수동정리"
                style={{ width: "100%", resize: "vertical", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.bg, color: COLORS.ink, fontSize: 12, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
              />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: COLORS.mid }}>선캐치·재진입·타이트 트레일링은 `surge_momentum`에만 적용됩니다.</span>
            <button
              onClick={handleSurgeSave}
              disabled={surgeSaving}
              style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: surgeSaving ? COLORS.dim : COLORS.ink, color: "#fff", fontSize: 12, fontWeight: 700, cursor: surgeSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {surgeSaving ? "저장 중..." : "급등값 저장"}
            </button>
          </div>
          {surgeMessage && (
            <div style={{ marginTop: 10, fontSize: 11, color: surgeMessage === "저장됨" ? "#15803D" : "#DC2626" }}>
              {surgeMessage}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.dim }}>
            현재 뉴스 방어: 보너스 +{surgeSettings.newsPositiveBonus} / 패널티 -{surgeSettings.newsNegativePenalty} / 쿨다운 {surgeSettings.newsRiskCooldownMinutes}분 / 학습보정 {surgeSettings.learningRiskAdjustmentsEnabled ? "ON" : "OFF"} / 메모템플릿 매수 {surgeSettings.manualUsBuyNoteTemplates.length}개 · 매도 {surgeSettings.manualUsSellNoteTemplates.length}개
          </div>
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
