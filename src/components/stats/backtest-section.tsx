"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import type { BacktestResult } from "@/lib/backtest";

interface WatchItem { code: string; name: string | null }

interface LiveComparison {
  period: string;
  totalTrades: number;
  closedTrades: number;
  winRate: number;
  profitFactor: number | null;
  totalPnl: number;
  totalReturn: number;
}

type BacktestResultWithLive = BacktestResult & { liveComparison?: LiveComparison | null };

export function BacktestSection() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [stopLoss, setStopLoss] = useState(-5);
  const [trailingStop, setTrailingStop] = useState(-3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResultWithLive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/watchlist").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) {
        setWatchlist(data);
        if (data.length > 0) setSelectedCode(data[0].code);
      }
    }).catch(() => {});
  }, []);

  const runTest = async () => {
    if (!selectedCode) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const item = watchlist.find((w) => w.code === selectedCode);
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: selectedCode,
          stockName: item?.name ?? selectedCode,
          stopLoss, trailingStop,
          maxPerTrade: 1000000,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `실패 (${res.status})`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "백테스트 실패");
    } finally {
      setLoading(false);
    }
  };

  const S = { card: { background: "#FFF", border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "16px 18px" } as const };

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink, marginBottom: 16 }}>
        백테스트
      </h3>

      {/* 설정 */}
      <div style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {/* 1행: 종목 + 실행 */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.dim, display: "block", marginBottom: 4 }}>종목</label>
            <select
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink }}
            >
              {watchlist.map((w) => (
                <option key={w.code} value={w.code}>{w.name ?? w.code} ({w.code})</option>
              ))}
            </select>
          </div>
          <button
            onClick={runTest}
            disabled={loading || !selectedCode}
            style={{
              flexShrink: 0, padding: "9px 20px", fontSize: 14, fontWeight: 700,
              border: "none", borderRadius: 8, background: COLORS.hero, color: "#FFF",
              cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "분석 중..." : "실행"}
          </button>
        </div>
        {/* 2행: 손절 / 트레일링 */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.fall, display: "block", marginBottom: 4 }}>손절 %</label>
            <input type="number" value={stopLoss} onChange={(e) => setStopLoss(Number(e.target.value))}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${COLORS.fallB}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.fall, display: "block", marginBottom: 4 }}>트레일링 %</label>
            <input type="number" value={trailingStop} onChange={(e) => setTrailingStop(Number(e.target.value))}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${COLORS.fallB}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink, boxSizing: "border-box" }} />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#FEF2F2", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 요약 카드 */}
          <div style={{ ...S.card }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>
              {result.stockName} ({result.stockCode})
            </div>
            <div style={{ fontSize: 11, color: COLORS.dim, marginBottom: 12 }}>{result.period}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 12 }}>
              {[
                { label: "총 수익률", value: `${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn}%`, color: result.totalReturn >= 0 ? "#16A34A" : COLORS.rise },
                { label: "총 손익", value: `${result.totalPnl >= 0 ? "+" : ""}${result.totalPnl.toLocaleString()}원`, color: result.totalPnl >= 0 ? "#16A34A" : COLORS.rise },
                { label: "승률", value: `${result.winRate}%`, color: result.winRate >= 50 ? "#16A34A" : COLORS.rise },
                { label: "거래횟수", value: `${result.totalTrades}회`, color: COLORS.ink },
                { label: "Profit Factor", value: `${result.profitFactor}`, color: result.profitFactor >= 1 ? "#16A34A" : COLORS.rise },
                { label: "MDD", value: `-${result.maxDrawdown}%`, color: COLORS.rise },
                { label: "Sharpe", value: `${result.sharpeRatio}`, color: result.sharpeRatio >= 1 ? "#16A34A" : COLORS.dim },
                { label: "평균 보유", value: `${result.avgHoldDays}일`, color: COLORS.dim },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.dim }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 실전 성과 비교 */}
          {result.liveComparison ? (
            <div style={{ ...S.card, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#15803D", marginBottom: 10 }}>📊 실전 성과 비교 ({result.liveComparison.period})</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "수익률", bt: `${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn}%`, live: `${result.liveComparison.totalReturn >= 0 ? "+" : ""}${result.liveComparison.totalReturn}%`, btGood: result.totalReturn >= result.liveComparison.totalReturn },
                  { label: "승률", bt: `${result.winRate}%`, live: `${result.liveComparison.winRate}%`, btGood: result.winRate >= result.liveComparison.winRate },
                  { label: "거래수", bt: `${result.totalTrades}회`, live: `${result.liveComparison.closedTrades}회`, btGood: true },
                ].map((row) => (
                  <div key={row.label} style={{ background: "#fff", borderRadius: 8, padding: "8px 10px", border: "1px solid #BBF7D0" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#15803D", marginBottom: 6 }}>{row.label}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: COLORS.dim }}>백테 {row.bt}</span>
                      <span style={{ fontWeight: 700, color: "#15803D" }}>실전 {row.live}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ ...S.card, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 12, color: COLORS.dim, textAlign: "center" }}>
                📊 실전 성과 비교 — 해당 기간 {result.stockName} 실매매 데이터 없음
              </div>
            </div>
          )}

          {/* 캔들 패턴 적중률 */}
          {result.patternStats.length > 0 && (
            <div style={{ ...S.card }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>캔들 패턴 적중률</div>
              {result.patternStats.map((p) => (
                <div key={p.pattern} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${COLORS.line}` }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{p.pattern}</span>
                  <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                    <span style={{ color: COLORS.dim }}>{p.count}회</span>
                    <span style={{ fontWeight: 700, color: p.winRate >= 50 ? "#16A34A" : COLORS.rise }}>{p.winRate}%</span>
                    <span style={{ color: p.avgPnl >= 0 ? "#16A34A" : COLORS.rise }}>{p.avgPnl >= 0 ? "+" : ""}{p.avgPnl}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 월별 수익률 */}
          {result.monthlyReturns.length > 0 && (
            <div style={{ ...S.card }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>월별 수익률</div>
              {result.monthlyReturns.map((m) => (
                <div key={m.month} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${COLORS.line}` }}>
                  <span style={{ fontSize: 13, color: COLORS.ink }}>{m.month}</span>
                  <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                    <span style={{ color: COLORS.dim }}>{m.trades}건</span>
                    <span style={{ fontWeight: 700, color: m.returnPct >= 0 ? "#16A34A" : COLORS.rise }}>{m.returnPct >= 0 ? "+" : ""}{m.returnPct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 최근 거래 */}
          {result.trades.length > 0 && (
            <div style={{ ...S.card }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>거래 내역 ({result.trades.length}건)</div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {result.trades.map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${COLORS.line}`, fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: COLORS.ink }}>{t.entryDate} → {t.exitDate}</div>
                      <div style={{ color: COLORS.dim, marginTop: 2 }}>{t.exitReason} · {t.holdDays}일</div>
                      {t.patterns.length > 0 && <div style={{ color: "#6366F1", marginTop: 2 }}>{t.patterns.join(", ")}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: t.pnl >= 0 ? "#16A34A" : COLORS.rise }}>
                        {t.pnl >= 0 ? "+" : ""}{t.pnl.toLocaleString()}원
                      </div>
                      <div style={{ color: t.pnlPercent >= 0 ? "#16A34A" : COLORS.rise }}>
                        {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
