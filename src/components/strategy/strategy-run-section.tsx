"use client";

import { COLORS } from "@/lib/constants";

interface EngineRun {
  run_at: string;
  trade_count: number;
  scanned_count: number;
  duration_ms: number;
  error: string | null;
  actions: { type: string; code: string; name?: string; detail: string }[];
}

interface LearningSnapshot {
  confidence: string;
  sample_size: number;
  win_rate: number;
  expires_at: string;
  is_active: boolean;
}

interface Props {
  runs: EngineRun[];
  loadingRuns: boolean;
  learning: { snapshot: LearningSnapshot | null; isExpired: boolean } | null;
  loadingLearn: boolean;
  kisConnected: boolean;
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

export function StrategyRunSection({ runs, loadingRuns, learning, loadingLearn, kisConnected }: Props) {
  return (
    <>
      <div style={{ height: 1, background: COLORS.line }} />

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
                { label: "승률", value: `${(learning.snapshot.win_rate * 100).toFixed(1)}%` },
                { label: "만료", value: learning.isExpired ? "만료됨" : fmtKST(learning.snapshot.expires_at), color: learning.isExpired ? "#DC2626" : COLORS.mid },
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
    </>
  );
}
