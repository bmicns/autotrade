"use client";

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore, TradeSettings } from "@/lib/store";
import { Icon } from "@/components/ui/icons";
import { saveTradeSettings, setSignalThresholds } from "@/actions/engine-control";
import { TradeEditSheet, SettingKey, SettingMeta } from "./trade-edit-sheet";
import { SignalEditSheet, SignalThresholds } from "./signal-edit-sheet";
import { SignalOptimizeSheet, OptimizeResult } from "./signal-optimize-sheet";

// ─── 타입 ────────────────────────────────────────
interface EngineRun {
  run_at: string; trade_count: number; scanned_count: number;
  duration_ms: number; error: string | null;
  actions: { type: string; code: string; name?: string; detail: string }[];
}

interface LearningSnapshot {
  confidence: string; sample_size: number; win_rate: number;
  expires_at: string; is_active: boolean;
}

// ─── 크론 스케줄 상수 ────────────────────────────
const CRON_TIMES = [
  { h: 9,  m: 30, label: "09:30" },
  { h: 11, m: 0,  label: "11:00" },
  { h: 13, m: 0,  label: "13:00" },
  { h: 14, m: 30, label: "14:30" },
];

function timeToMinutes(t: string): number {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

function calcUncoveredCrons(ts: TradeSettings): string[] {
  const morningS  = timeToMinutes(ts.morningStart);
  const morningE  = timeToMinutes(ts.morningEnd);
  const afternoonS = timeToMinutes(ts.afternoonStart);
  const afternoonE = timeToMinutes(ts.afternoonEnd);

  return CRON_TIMES
    .filter(({ h, m, }) => {
      const t = h * 60 + m;
      const inMorning   = t >= morningS   && t <= morningE;
      const inAfternoon = t >= afternoonS && t <= afternoonE;
      return !inMorning && !inAfternoon;
    })
    .map(({ label }) => label);
}

// ─── 상수 ────────────────────────────────────────
const SETTING_METAS: SettingMeta[] = [
  { key: "stopLoss",          label: "손절 라인",       icon: "dn",    unit: "%",   type: "number",     min: 1,  max: 20,   step: 0.5, description: "손실 시 자동 매도 기준" },
  { key: "takeProfit",        label: "1차 익절",        icon: "up",    unit: "%",   type: "number",     min: 1,  max: 50,   step: 0.5, description: "수익 실현 기준 (비율 50%)" },
  { key: "trailingStop",      label: "트레일링 스탑",   icon: "trend", unit: "%",   type: "number",     min: 1,  max: 10,   step: 0.5, description: "고점 대비 하락 시 매도" },
  { key: "dailyLossLimit",    label: "일일 손실 한도",  icon: "dn",    unit: "%",   type: "number",     min: 1,  max: 10,   step: 0.5, description: "당일 손실이 이 비율 초과 시 매매 정지" },
  { key: "maxHoldDays",       label: "최대 보유 기간",  icon: "clock", unit: "일",  type: "number",     min: 1,  max: 30,   step: 1,   description: "보유 기간 초과 시 강제 청산" },
  { key: "maxAmountPerTrade", label: "1회 매매 한도",   icon: "trend", unit: "만원",type: "number",     min: 10, max: 1000, step: 10,  description: "1회 최대 투자금" },
  { key: "maxTradesPerDay",   label: "1일 최대 횟수",   icon: "clock", unit: "회",  type: "number",     min: 1,  max: 20,   step: 1,   description: "하루 최대 매매 횟수" },
  { key: "morningSession",    label: "오전 세션",       icon: "clock", unit: "",    type: "time-range",            description: "오전 매매 허용 시간대" },
  { key: "afternoonSession",  label: "오후 세션",       icon: "clock", unit: "",    type: "time-range",            description: "오후 매매 허용 시간대" },
];

const GROUPS = [
  { title: "손익 관리",  keys: ["stopLoss", "takeProfit", "trailingStop", "dailyLossLimit", "maxHoldDays"] },
  { title: "매매 한도",  keys: ["maxAmountPerTrade", "maxTradesPerDay"] },
  { title: "시간대 필터", keys: ["morningSession", "afternoonSession"] },
];

const INDICATORS = [
  "RSI — 과매수·과매도 (기준 30/70)",
  "MACD — 골든/데드크로스",
  "이동평균 — MA5/MA20 크로스",
  "볼린저밴드 — 밴드 이탈 감지",
  "거래량 — 20일 평균 대비 급증",
  "ADX — 추세장/횡보장 판단 (25 기준)",
  "캔들패턴 — 반전/지속 패턴 (15점)",
];

// ─── 유틸 ─────────────────────────────────────────
function getDisplayValue(key: SettingKey, ts: TradeSettings): string {
  switch (key) {
    case "maxAmountPerTrade":  return `${ts.maxAmountPerTrade}만원`;
    case "maxTradesPerDay":    return `${ts.maxTradesPerDay}회`;
    case "stopLoss":           return `-${ts.stopLoss}%`;
    case "takeProfit":         return `+${ts.takeProfit}% · ${ts.takeProfitRatio}%`;
    case "trailingStop":       return `고점 -${ts.trailingStop}%`;
    case "dailyLossLimit":     return `-${ts.dailyLossLimit}%`;
    case "maxHoldDays":        return `${ts.maxHoldDays}일`;
    case "morningSession":     return `${ts.morningStart}~${ts.morningEnd}`;
    case "afternoonSession":   return `${ts.afternoonStart}~${ts.afternoonEnd}`;
  }
}

function runStatus(run: EngineRun): { label: string; color: string } {
  if (run.actions.some((a) => a.type === "skipped")) return { label: "스킵", color: COLORS.dim };
  if (run.error)           return { label: "오류",           color: "#DC2626" };
  if (run.trade_count > 0) return { label: `매매 ${run.trade_count}건`, color: "#16A34A" };
  return { label: "정상 실행", color: COLORS.mid };
}

function fmtKST(iso: string) {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  const mm  = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd  = String(kst.getUTCDate()).padStart(2, "0");
  const hh  = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

const DEFAULT_THRESHOLDS: SignalThresholds = {
  rsiBuy: 30, rsiSell: 70, strongScore: 70, weakScore: 40,
};

// ─── 메인 전략 탭 ─────────────────────────────────
export function StrategyTab() {
  const kisConnected    = useAppStore((s) => s.kisConnected);
  const tradeSettings   = useAppStore((s) => s.tradeSettings);
  const setTradeSettings = useAppStore((s) => s.setTradeSettings);
  const [editKey, setEditKey] = useState<SettingKey | null>(null);
  const [runs, setRuns]       = useState<EngineRun[]>([]);
  const [learning, setLearning] = useState<{ snapshot: LearningSnapshot | null; isExpired: boolean } | null>(null);
  const [loadingRuns, setLoadingRuns]   = useState(true);
  const [loadingLearn, setLoadingLearn] = useState(true);

  // 세션 커버리지 경고
  const [uncoveredCrons, setUncoveredCrons] = useState<string[]>([]);

  // 신호 임계값 상태
  const [thresholds, setThresholds] = useState<SignalThresholds>(DEFAULT_THRESHOLDS);
  const [signalEditKey, setSignalEditKey] = useState<keyof SignalThresholds | null>(null);
  const [optimizing, setOptimizing]   = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [optimizeError, setOptimizeError]   = useState<string | null>(null);

  // 마운트 시 현재 설정 기준으로 세션 커버리지 즉시 검증
  useEffect(() => {
    setUncoveredCrons(calcUncoveredCrons(tradeSettings));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/engine-log?limit=5")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .finally(() => setLoadingRuns(false));
    fetch("/api/learn")
      .then((r) => r.json())
      .then((d) => setLearning(d))
      .finally(() => setLoadingLearn(false));
    // 신호 임계값 로드
    fetch("/api/engine-control")
      .then((r) => r.json())
      .then((d) => {
        setThresholds({
          rsiBuy:      d.rsi_buy      ?? DEFAULT_THRESHOLDS.rsiBuy,
          rsiSell:     d.rsi_sell     ?? DEFAULT_THRESHOLDS.rsiSell,
          strongScore: d.strong_score ?? DEFAULT_THRESHOLDS.strongScore,
          weakScore:   d.weak_score   ?? DEFAULT_THRESHOLDS.weakScore,
        });
      })
      .catch(() => {});
  }, []);

  const handleSave = useCallback((partial: Partial<TradeSettings>) => {
    const next = { ...tradeSettings, ...partial };
    setTradeSettings(next);
    setEditKey(null);
    saveTradeSettings(partial).catch(() => {});
    // 세션 시간 변경 시 커버리지 재검증
    setUncoveredCrons(calcUncoveredCrons(next));
  }, [tradeSettings, setTradeSettings]);

  const handleSignalSave = useCallback((partial: Partial<SignalThresholds>) => {
    const next = { ...thresholds, ...partial };
    setThresholds(next);
    setSignalEditKey(null);
    setSignalThresholds(partial).catch(() => {});
  }, [thresholds]);

  const handleOptimize = useCallback(async () => {
    setOptimizing(true);
    setOptimizeError(null);
    setOptimizeResult(null);
    try {
      const res = await fetch("/api/optimize-thresholds");
      const data = await res.json();
      if (!res.ok) {
        setOptimizeError(data.error ?? "최적화 실패");
        return;
      }
      if (data.sampleSize < 5) {
        setOptimizeError(`매매 데이터가 부족합니다 (${data.sampleSize}건 / 최소 5건)`);
        return;
      }
      setOptimizeResult(data as OptimizeResult);
    } catch {
      setOptimizeError("네트워크 오류가 발생했습니다");
    } finally {
      setOptimizing(false);
    }
  }, []);

  const handleApplyOptimized = useCallback((recommended: SignalThresholds) => {
    setThresholds(recommended);
    setOptimizeResult(null);
    setSignalThresholds(recommended).catch(() => {});
  }, []);

  const editMeta = editKey ? SETTING_METAS.find((m) => m.key === editKey) : null;

  return (
    <div>
      {/* 신호 기준 (편집 가능) */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>신호 기준</span>
      </div>
      {([
        { key: "rsiBuy"      as const, label: "RSI 매수 기준",  display: `< ${thresholds.rsiBuy} (과매도)` },
        { key: "rsiSell"     as const, label: "RSI 매도 기준",  display: `> ${thresholds.rsiSell} (과매수)` },
        { key: "strongScore" as const, label: "강한 신호",      display: `${thresholds.strongScore}점 이상 → 즉시 매수` },
        { key: "weakScore"   as const, label: "약한 신호",      display: `${thresholds.weakScore}점 이상 → 승인 대기` },
      ]).map((row) => (
        <div key={row.key}>
          <div
            onClick={() => setSignalEditKey(row.key)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer" }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{row.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: COLORS.mid }}>{row.display}</span>
              <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </div>
      ))}

      {/* 자동 최적화 버튼 */}
      <div style={{ padding: "14px 20px" }}>
        {optimizeError && (
          <div style={{ fontSize: 12, color: COLORS.dim, marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
            {optimizeError}
          </div>
        )}
        <button
          onClick={handleOptimize}
          disabled={optimizing}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 12,
            border: `1.5px solid ${COLORS.line}`, background: optimizing ? COLORS.sub : COLORS.bg,
            color: optimizing ? COLORS.dim : COLORS.ink, fontSize: 14, fontWeight: 600,
            cursor: optimizing ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {optimizing ? "분석 중..." : "자동 최적화"}
        </button>
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 매매 전략 설정 (편집 가능) */}
      {GROUPS.map((sec, si) => (
        <div key={si}>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>{sec.title}</span>
          </div>
          {sec.keys.map((key) => {
            const meta = SETTING_METAS.find((m) => m.key === key)!;
            return (
              <div key={key}>
                <div onClick={() => setEditKey(key as SettingKey)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={meta.icon} size={16} color={COLORS.mid} strokeWidth={1.5} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{meta.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: COLORS.mid }}>{getDisplayValue(key as SettingKey, tradeSettings)}</span>
                    <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
                  </div>
                </div>
                <div style={{ height: 1, background: COLORS.line }} />
              </div>
            );
          })}
          {/* 시간대 필터 섹션 아래 — 커버되지 않는 크론 경고 */}
          {sec.title === "시간대 필터" && uncoveredCrons.length > 0 && (
            <div style={{ padding: "10px 20px 14px" }}>
              <div style={{
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(251,146,60,0.08)",
                border: "1px solid rgba(251,146,60,0.35)",
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>⚠</span>
                <span style={{ fontSize: 12, color: "#EA580C", lineHeight: 1.5 }}>
                  {uncoveredCrons.join(", ")} 크론이 세션 시간 밖입니다. 해당 시간 엔진이 스킵됩니다.
                </span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 분석 지표 7종 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>분석 지표 (7종)</span>
      </div>
      <div style={{ padding: "0 20px 16px" }}>
        {INDICATORS.map((ind, i) => (
          <div key={i} style={{ padding: "9px 0", borderTop: i > 0 ? `1px solid ${COLORS.line}` : "none" }}>
            <span style={{ fontSize: 13, color: COLORS.mid }}>{ind}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 최근 실행 이력 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>최근 실행 이력</span>
      </div>
      <div style={{ padding: "0 20px 16px" }}>
        {loadingRuns ? (
          <div style={{ fontSize: 13, color: COLORS.dim, padding: "8px 0" }}>불러오는 중...</div>
        ) : runs.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.dim, padding: "8px 0" }}>실행 이력 없음</div>
        ) : runs.map((run, i) => {
          const status = runStatus(run);
          const skipDetail = run.actions.find((a) => a.type === "skipped")?.detail ?? "";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: i > 0 ? `1px solid ${COLORS.line}` : "none" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{fmtKST(run.run_at)}</div>
                {skipDetail
                  ? <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 2 }}>{skipDetail}</div>
                  : run.scanned_count > 0
                    ? <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 2 }}>스캔 {run.scanned_count}종목 · {(run.duration_ms / 1000).toFixed(1)}초</div>
                    : null}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: status.color }}>{status.label}</span>
            </div>
          );
        })}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 자가학습 현황 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>자가학습 현황</span>
      </div>
      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          {loadingLearn ? (
            <div style={{ fontSize: 13, color: COLORS.dim }}>불러오는 중...</div>
          ) : !learning?.snapshot ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.mid }}>학습 데이터 없음</div>
              <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 4 }}>매매 50건 이상 누적 후 자동 학습 시작</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              {[
                { label: "신뢰도", value: learning.snapshot.confidence },
                { label: "샘플 수", value: `${learning.snapshot.sample_size}건` },
                { label: "승률",   value: `${(learning.snapshot.win_rate * 100).toFixed(1)}%` },
                { label: "만료",   value: learning.isExpired ? "만료됨" : fmtKST(learning.snapshot.expires_at), color: learning.isExpired ? "#DC2626" : COLORS.mid },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: COLORS.mid }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: row.color ?? COLORS.ink }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 엔진 상태 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>엔진 상태</span>
      </div>
      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: kisConnected ? "#22C55E" : COLORS.dim, marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                {kisConnected ? "GitHub Actions — 자동 실행" : "KIS 미연결 — 엔진 비활성"}
              </div>
              {kisConnected && (
                <div style={{ fontSize: 12, color: COLORS.mid, marginTop: 2 }}>평일 09:30 / 11:00 / 13:00 / 14:30</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editMeta && (
        <TradeEditSheet meta={editMeta} ts={tradeSettings} onSave={handleSave} onClose={() => setEditKey(null)} />
      )}
      {signalEditKey && (
        <SignalEditSheet
          editKey={signalEditKey}
          thresholds={thresholds}
          onSave={handleSignalSave}
          onClose={() => setSignalEditKey(null)}
        />
      )}
      {optimizeResult && (
        <SignalOptimizeSheet
          result={optimizeResult}
          onApply={handleApplyOptimized}
          onClose={() => setOptimizeResult(null)}
        />
      )}
    </div>
  );
}
