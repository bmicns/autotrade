"use client";

import { useState } from "react";
import { COLORS } from "@/lib/constants";

export interface StockStat {
  stock_code: string;
  stock_name: string;
  trade_count: number;
  win_count: number;
  win_rate: number;
  avg_pnl: number;
  total_pnl: number;
  fitness_score: number;
  fitness_label: "good" | "neutral" | "poor";
  last_trade: string;
}

type SortKey = "fitness" | "pnl" | "trades";

const FITNESS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  good:    { color: "#15803D", bg: "#DCFCE7", border: "#BBF7D0" },
  neutral: { color: "#92400E", bg: "#FEF3C7", border: "#FDE68A" },
  poor:    { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

export function StockStatsSection({ stats }: { stats: StockStat[] }) {
  const [sort, setSort] = useState<SortKey>("fitness");

  const sorted = [...stats].sort((a, b) => {
    if (sort === "fitness") return b.fitness_score - a.fitness_score;
    if (sort === "pnl") return b.total_pnl - a.total_pnl;
    return b.trade_count - a.trade_count;
  });

  const SORT_LABELS: { id: SortKey; label: string }[] = [
    { id: "fitness", label: "적합도순" },
    { id: "pnl", label: "수익순" },
    { id: "trades", label: "거래수순" },
  ];

  return (
    <div>
      {/* ── 헤더 ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          종목별 성과
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {SORT_LABELS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              style={{
                padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: sort === s.id ? 700 : 500, fontFamily: "inherit",
                background: sort === s.id ? COLORS.hero : COLORS.sub,
                color: sort === s.id ? "#fff" : COLORS.dim,
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>종목별 성과 데이터 없음</span>
        </div>
      ) : sorted.map((s) => {
        const fs = FITNESS_STYLE[s.fitness_label] ?? FITNESS_STYLE.neutral;
        const lastDate = s.last_trade
          ? new Date(s.last_trade).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
          : "—";

        return (
          <div key={s.stock_code}>
            <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
              {/* 좌: 종목명 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.stock_name}
                  </span>
                  {s.fitness_label === "poor" && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: fs.bg, color: fs.color, border: `1px solid ${fs.border}`, whiteSpace: "nowrap" }}>
                      성과미흡 ⚠
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{s.stock_code} · {lastDate}</span>
                </div>
              </div>

              {/* 중: 통계 3열 */}
              <div style={{ display: "grid", gridTemplateColumns: "40px 40px 56px", gap: 4, textAlign: "center" }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{s.trade_count}</span>
                  <div><span style={{ fontSize: 9, color: COLORS.dim }}>거래</span></div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.win_rate >= 50 ? "#16A34A" : COLORS.rise }}>{s.win_rate}%</span>
                  <div><span style={{ fontSize: 9, color: COLORS.dim }}>승률</span></div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.avg_pnl >= 0 ? "#16A34A" : COLORS.rise }}>
                    {s.avg_pnl >= 0 ? "+" : ""}{s.avg_pnl.toFixed(1)}%
                  </span>
                  <div><span style={{ fontSize: 9, color: COLORS.dim }}>평균손익</span></div>
                </div>
              </div>

              {/* 우: fitness 바 */}
              <div style={{ width: 48, textAlign: "right" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: fs.color }}>{s.fitness_score}</span>
                <div style={{ marginTop: 3, height: 4, borderRadius: 2, background: COLORS.line, overflow: "hidden" }}>
                  <div style={{
                    width: `${s.fitness_score}%`, height: "100%", borderRadius: 2,
                    background: s.fitness_label === "good" ? "#22C55E" : s.fitness_label === "neutral" ? "#F59E0B" : COLORS.rise,
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: COLORS.line }} />
          </div>
        );
      })}
    </div>
  );
}
