"use client";

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "@/lib/constants";

interface EngineAction {
  type: string;
  code?: string;
  name?: string;
  detail?: string;
}

interface EngineRun {
  id: string;
  created_at: string;
  trade_count: number;
  scanned_count: number;
  duration_ms: number;
  error: string | null;
  actions: EngineAction[];
}

interface LogResponse {
  runs: EngineRun[];
  total: number;
  page: number;
  hasMore: boolean;
}

const ACTION_META: Record<string, { label: string; emoji: string; color: string }> = {
  approved_buy:    { label: "매수", emoji: "🟢", color: "#16A34A" },
  split_buy_1:     { label: "분할매수1", emoji: "🟢", color: "#16A34A" },
  split_buy_2:     { label: "분할매수2", emoji: "🟢", color: "#16A34A" },
  surge_buy:       { label: "급등매수", emoji: "⚡", color: "#7C3AED" },
  stop_loss:       { label: "손절", emoji: "🔴", color: "#DC2626" },
  take_profit:     { label: "익절", emoji: "💰", color: "#2563EB" },
  trailing_stop:   { label: "트레일링", emoji: "📉", color: "#EA580C" },
  max_hold_sell:   { label: "기간청산", emoji: "⏰", color: "#D97706" },
  sell:            { label: "매도", emoji: "🔵", color: "#2563EB" },
  buy_failed:      { label: "매수실패", emoji: "❌", color: "#9CA3AF" },
  sell_failed:     { label: "매도실패", emoji: "❌", color: "#9CA3AF" },
  approved_buy_failed: { label: "매수실패", emoji: "❌", color: "#9CA3AF" },
  surge_buy_failed:    { label: "급등매수실패", emoji: "❌", color: "#9CA3AF" },
  skipped:         { label: "건너뜀", emoji: "⏭️", color: "#9CA3AF" },
  token_error:     { label: "토큰오류", emoji: "🔑", color: "#DC2626" },
};

function getActionMeta(type: string) {
  return ACTION_META[type] ?? { label: type, emoji: "•", color: COLORS.mid };
}

function formatKST(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function RunCard({ run }: { run: EngineRun }) {
  const [open, setOpen] = useState(false);
  const tradeActions = run.actions.filter((a) => ACTION_META[a.type]);
  const hasError = !!run.error;

  return (
    <div style={{ border: `1px solid ${hasError ? "#FECACA" : COLORS.line}`, borderRadius: 12, overflow: "hidden", background: hasError ? "#FFF5F5" : "#FFF" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: hasError ? "#DC2626" : COLORS.ink }}>
            {formatKST(run.created_at)}
          </span>
          <span style={{ fontSize: 11, color: COLORS.dim }}>
            거래 {run.trade_count}건 · 스캔 {run.scanned_count}종목 · {(run.duration_ms / 1000).toFixed(1)}초
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {tradeActions.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "2px 8px", borderRadius: 6 }}>
              {tradeActions.length}액션
            </span>
          )}
          {hasError && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 6 }}>오류</span>
          )}
          <span style={{ fontSize: 12, color: COLORS.dim }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${COLORS.line}`, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {hasError && (
            <div style={{ fontSize: 12, color: "#DC2626", padding: "6px 10px", background: "#FEF2F2", borderRadius: 6 }}>
              오류: {run.error}
            </div>
          )}
          {run.actions.length === 0 && (
            <div style={{ fontSize: 12, color: COLORS.dim }}>액션 없음</div>
          )}
          {run.actions.map((a, i) => {
            const meta = getActionMeta(a.type);
            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", borderBottom: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{meta.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    {a.name && <span style={{ fontSize: 12, color: COLORS.ink }}>{a.name}</span>}
                    {a.code && <span style={{ fontSize: 11, color: COLORS.dim }}>({a.code})</span>}
                  </div>
                  {a.detail && (
                    <div style={{ fontSize: 11, color: COLORS.mid, marginTop: 2, wordBreak: "break-all" }}>{a.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EngineLogSection() {
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(async (p: number, append = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/engine-log?page=${p}&limit=10`);
      const data: LogResponse = await res.json();
      setRuns((prev) => append ? [...prev, ...data.runs] : data.runs);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink, margin: 0 }}>엔진 실행 로그</h3>
        <span style={{ fontSize: 11, color: COLORS.dim }}>총 {total}건</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {runs.map((run) => <RunCard key={run.id} run={run} />)}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: COLORS.dim }}>불러오는 중...</div>
      )}

      {!loading && hasMore && (
        <button
          onClick={() => fetchPage(page + 1, true)}
          style={{
            width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 10,
            border: `1px solid ${COLORS.line}`, background: "transparent",
            fontSize: 13, fontWeight: 600, color: COLORS.mid, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          더 보기
        </button>
      )}

      {!loading && runs.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: COLORS.dim }}>실행 기록이 없습니다</div>
      )}
    </div>
  );
}
