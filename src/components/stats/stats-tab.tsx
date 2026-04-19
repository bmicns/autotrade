"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/ui/icons";
import { BacktestSection } from "@/components/stats/backtest-section";
import { LearningSection } from "@/components/stats/learning-section";
import { StockStatsSection } from "@/components/stats/stock-stats-section";
import { EngineLogSection } from "@/components/stats/engine-log-section";
import { useStats, type Period } from "@/hooks/useStats";

const PERIODS: { id: Period; label: string }[] = [
  { id: "1w", label: "1주" },
  { id: "1m", label: "1개월" },
  { id: "3m", label: "3개월" },
  { id: "all", label: "전체" },
];

const EXIT_LABELS: Record<string, string> = {
  stop_loss: "손절",
  take_profit: "익절",
  trailing_stop: "트레일링",
  signal_sell: "신호 매도",
  unknown: "기타",
};

export function StatsTab() {
  const [period, setPeriod] = useState<Period>("all");
  const { stats, learningData, stockStats, loading, fetchStats } = useStats();

  useEffect(() => { fetchStats(period); }, [fetchStats, period]);

  if (loading) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 13, color: COLORS.dim }}>성과 데이터 로딩 중...</span>
      </div>
    );
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <Icon name="bar" size={48} color={COLORS.dim} strokeWidth={1} />
        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>매매 통계 없음</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 13, color: COLORS.dim, lineHeight: 1.6 }}>
            엔진이 매매를 실행하면 성과 데이터가 자동으로 집계됩니다.
          </span>
        </div>
      </div>
    );
  }

  const closed = stats.positions?.filter((p) => p.status === "closed") || [];
  const open = stats.positions?.filter((p) => p.status === "open") || [];

  return (
    <div>
      {/* ── 기간 선택 ── */}
      <div style={{ padding: "16px 20px 12px", display: "flex", gap: 6 }}>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: period === p.id ? 700 : 500, fontFamily: "inherit",
              background: period === p.id ? COLORS.hero : COLORS.sub,
              color: period === p.id ? "#fff" : COLORS.dim,
            }}
          >{p.label}</button>
        ))}
      </div>

      {/* ── 요약 카드 4개 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 16px 16px" }}>
        {[
          { label: "승률", value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.winCount}승 ${stats.lossCount}패`, color: stats.winRate >= 50 ? "#22C55E" : COLORS.rise },
          { label: "평균 수익률", value: `${stats.avgReturn >= 0 ? "+" : ""}${stats.avgReturn.toFixed(2)}%`, sub: `${stats.closedTrades}건 청산`, color: stats.avgReturn >= 0 ? "#22C55E" : COLORS.rise },
          { label: "총 손익", value: `${stats.totalPnl >= 0 ? "+" : ""}${Math.round(stats.totalPnl).toLocaleString("ko-KR")}원`, sub: `PF ${stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}`, color: stats.totalPnl >= 0 ? "#22C55E" : COLORS.rise },
          { label: "최대 낙폭", value: `${stats.maxDrawdown.toFixed(1)}%`, sub: `평균 ${stats.avgHoldDays.toFixed(0)}일 보유`, color: stats.maxDrawdown > 10 ? COLORS.rise : COLORS.dim },
        ].map((card, i) => (
          <div key={i} style={{
            background: COLORS.sub, borderRadius: 12, padding: "14px 16px",
            border: `1px solid ${COLORS.line}`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.03em" }}>{card.label}</span>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: card.color, fontVariantNumeric: "tabular-nums" }}>{card.value}</span>
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* ── 지표 적중률 ── */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>지표별 적중률</span>
      </div>
      <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {stats.indicatorAccuracy.map((ind) => (
          <div key={ind.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid, width: 52, flexShrink: 0 }}>{ind.name}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLORS.sub, overflow: "hidden" }}>
              <div style={{
                width: `${Math.min(ind.accuracy, 100)}%`, height: "100%", borderRadius: 4,
                background: ind.accuracy >= 60 ? "#22C55E" : ind.accuracy >= 40 ? "#F59E0B" : COLORS.rise,
                transition: "width 0.5s ease",
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.mid, width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {ind.totalUsed > 0 ? `${ind.accuracy.toFixed(0)}%` : "—"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* ── 청산 사유별 분석 ── */}
      {stats.exitReasonBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>청산 사유</span>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 16px", flexWrap: "wrap" }}>
            {stats.exitReasonBreakdown.map((er) => (
              <div key={er.reason} style={{
                padding: "10px 14px", borderRadius: 10,
                background: COLORS.sub, border: `1px solid ${COLORS.line}`,
                flex: "1 1 auto", minWidth: 100,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim }}>{EXIT_LABELS[er.reason] || er.reason}</span>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.ink }}>{er.count}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: er.avgPnl >= 0 ? "#22C55E" : COLORS.rise }}>
                    평균 {er.avgPnl >= 0 ? "+" : ""}{Math.round(er.avgPnl).toLocaleString("ko-KR")}원
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {/* ── 월별 손익 ── */}
      {stats.monthlyBreakdown.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>월별 손익</span>
          </div>
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: COLORS.sub, padding: "10px 14px" }}>
                {["월", "손익", "거래수", "승률"].map((h) => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                ))}
              </div>
              {stats.monthlyBreakdown.map((m) => (
                <div key={m.month} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "10px 14px", borderTop: `1px solid ${COLORS.line}` }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.ink }}>{m.month.slice(5)}월</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: m.pnl >= 0 ? "#22C55E" : COLORS.rise, fontVariantNumeric: "tabular-nums" }}>
                    {m.pnl >= 0 ? "+" : ""}{(m.pnl / 10000).toFixed(0)}만
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.mid }}>{m.trades}건</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: m.winRate >= 50 ? "#22C55E" : COLORS.rise }}>{m.winRate.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: COLORS.line }} />
        </>
      )}

      {/* ── 오픈 포지션 ── */}
      {open.length > 0 && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>보유 포지션 ({open.length})</span>
          </div>
          {open.map((p) => (
            <div key={p.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{p.stock_name || p.stock_code}</span>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{p.stock_code} · {p.signal_strength === "strong" ? "강한 신호" : "약한 신호"}</span>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                  {p.entry_price.toLocaleString("ko-KR")}원
                </span>
              </div>
              <div style={{ height: 1, background: COLORS.line }} />
            </div>
          ))}
        </>
      )}

      {/* ── 최근 청산 ── */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>최근 청산</span>
      </div>
      {closed.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>청산된 포지션이 없습니다</span>
        </div>
      ) : closed.slice(0, 15).map((p) => {
        const isWin = (p.pnl_amount ?? 0) > 0;
        return (
          <div key={p.id}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{p.stock_name || p.stock_code}</span>
                  {p.exit_reason && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      background: p.exit_reason === "take_profit" || p.exit_reason === "trailing_stop" ? "#F0FDF4" : "#FEF2F2",
                      color: p.exit_reason === "take_profit" || p.exit_reason === "trailing_stop" ? "#16A34A" : "#DC2626",
                      border: `1px solid ${p.exit_reason === "take_profit" || p.exit_reason === "trailing_stop" ? "#BBF7D0" : "#FECACA"}`,
                    }}>
                      {EXIT_LABELS[p.exit_reason] || p.exit_reason}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 3 }}>
                  <span style={{ fontSize: 11, color: COLORS.dim }}>
                    {p.hold_days}일 보유 · {p.exit_date ? new Date(p.exit_date).toLocaleDateString("ko-KR") : ""}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: isWin ? "#22C55E" : COLORS.rise, fontVariantNumeric: "tabular-nums" }}>
                  {isWin ? "+" : ""}{Math.round(p.pnl_amount ?? 0).toLocaleString("ko-KR")}원
                </span>
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isWin ? "#22C55E" : COLORS.rise }}>
                    {(p.pnl_percent ?? 0) >= 0 ? "+" : ""}{(p.pnl_percent ?? 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: COLORS.line }} />
          </div>
        );
      })}

      {/* ── Best / Worst ── */}
      {(stats.bestTrade || stats.worstTrade) && (
        <div style={{ display: "flex", gap: 8, padding: "16px" }}>
          {stats.bestTrade && (
            <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A" }}>BEST</span>
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>{stats.bestTrade.name}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#16A34A" }}>+{Math.round(stats.bestTrade.pnl).toLocaleString("ko-KR")}원</span>
            </div>
          )}
          {stats.worstTrade && (
            <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }}>WORST</span>
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>{stats.worstTrade.name}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#DC2626" }}>{Math.round(stats.worstTrade.pnl).toLocaleString("ko-KR")}원</span>
            </div>
          )}
        </div>
      )}
      <BacktestSection />

      {/* ── 자가학습 현황 ── */}
      <div style={{ height: 1, background: COLORS.line }} />
      <LearningSection
        snapshot={learningData?.snapshot ?? null}
        isExpired={learningData?.isExpired ?? true}
        history={learningData?.history ?? []}
        abStats={learningData?.abStats}
      />

      {/* ── 종목별 성과 ── */}
      {stockStats.length > 0 && (
        <>
          <div style={{ height: 1, background: COLORS.line }} />
          <StockStatsSection stats={stockStats} />
        </>
      )}

      {/* ── 엔진 실행 로그 ── */}
      <div style={{ height: 1, background: COLORS.line }} />
      <EngineLogSection />
    </div>
  );
}
