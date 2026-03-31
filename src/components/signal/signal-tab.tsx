"use client";

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

interface WatchlistItem {
  id: string;
  code: string;
  name: string | null;
  active: boolean;
}

interface PendingSignal {
  id: string;
  stock_code: string;
  stock_name: string | null;
  signal_score: number;
  signal_comment: string;
  source: string;
  status: string;
  created_at: string;
}

export function SignalTab() {
  const kisConnected = useAppStore((s) => s.kisConnected);
  const kisConfig = useAppStore((s) => s.kisConfig);
  const [tab, setTab] = useState<"signals" | "watchlist">("signals");
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [signals, setSignals] = useState<PendingSignal[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) setWatchlist(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/pending-signals");
      if (res.ok) setSignals(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchWatchlist();
    fetchSignals();
  }, [fetchWatchlist, fetchSignals]);

  const addToWatchlist = async () => {
    if (!newCode.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim() || null }),
      });
      setNewCode("");
      setNewName("");
      fetchWatchlist();
    } catch { /* ignore */ }
    setLoading(false);
  };

  const removeFromWatchlist = async (code: string) => {
    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    fetchWatchlist();
  };

  const handleSignalAction = async (id: string, action: "approved" | "rejected") => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/pending-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok && action === "approved") {
        const signal = signals.find((s) => s.id === id);
        if (signal && kisConfig.token) {
          // 승인된 신호 → 즉시 시장가 매수 실행
          const orderRes = await fetch("/api/kis/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appKey: kisConfig.appKey,
              appSecret: kisConfig.appSecret,
              accountNo: kisConfig.accountNo,
              token: kisConfig.token,
              stockCode: signal.stock_code,
              side: "buy",
              quantity: 1,     // 최소 1주 즉시 매수 (엔진이 다음 사이클에서 추가매수 판단)
              price: 0,
              orderType: "01", // 시장가
            }),
          });
          const orderData = await orderRes.json();
          if (orderData.rt_cd !== "0") {
            alert(`매수 실패: ${orderData.msg1 || orderData.error || "알 수 없는 오류"}`);
          }
        }
      }
      fetchSignals();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const sectionBtn = (label: string, key: "signals" | "watchlist") => (
    <button
      onClick={() => setTab(key)}
      style={{
        flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
        background: tab === key ? COLORS.hero : COLORS.sub,
        color: tab === key ? "#FFF" : COLORS.dim,
        borderRadius: key === "signals" ? "10px 0 0 10px" : "0 10px 10px 0",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* 탭 전환 */}
      <div style={{ display: "flex", marginBottom: 20 }}>
        {sectionBtn(`신호 대기 (${signals.length})`, "signals")}
        {sectionBtn(`관심종목 (${watchlist.length})`, "watchlist")}
      </div>

      {tab === "signals" && (
        <div>
          {signals.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.dim} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
                <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
              </svg>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>대기 중인 신호 없음</div>
              <div style={{ fontSize: 13, color: COLORS.dim, marginTop: 6, lineHeight: 1.6 }}>
                {kisConnected
                  ? "엔진이 약한 매수 신호를 감지하면 여기에 표시됩니다."
                  : "설정에서 KIS API를 연결하세요."}
              </div>
            </div>
          ) : (
            signals.map((s) => (
              <div key={s.id} style={{
                background: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12,
                border: `1px solid ${COLORS.line}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{s.stock_name || s.stock_code}</span>
                    <span style={{ fontSize: 12, color: COLORS.dim, marginLeft: 8 }}>{s.stock_code}</span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                    background: s.source === "surge" ? COLORS.riseL : COLORS.fallL,
                    color: s.source === "surge" ? COLORS.rise : COLORS.fall,
                  }}>
                    {s.source === "surge" ? "급등주" : "관심종목"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: COLORS.mid, marginBottom: 12 }}>
                  신호 점수: <strong>{s.signal_score}점</strong> &middot; {s.signal_comment}
                </div>
                <div style={{ fontSize: 11, color: COLORS.dim, marginBottom: 12 }}>
                  {new Date(s.created_at).toLocaleString("ko-KR")}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleSignalAction(s.id, "approved")}
                    disabled={actionLoading === s.id}
                    style={{
                      flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8,
                      background: COLORS.rise, color: "#FFF", cursor: "pointer", opacity: actionLoading === s.id ? 0.5 : 1,
                    }}
                  >
                    {actionLoading === s.id ? "..." : "매수 승인"}
                  </button>
                  <button
                    onClick={() => handleSignalAction(s.id, "rejected")}
                    disabled={actionLoading === s.id}
                    style={{
                      flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 600, border: `1px solid ${COLORS.line}`,
                      borderRadius: 8, background: COLORS.bg, color: COLORS.dim, cursor: "pointer",
                    }}
                  >
                    무시
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "watchlist" && (
        <div>
          {/* 종목 추가 폼 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="종목코드 (예: 005930)"
              style={{
                flex: 1, padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.line}`,
                borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none",
              }}
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="종목명 (선택)"
              style={{
                flex: 1, padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.line}`,
                borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none",
              }}
            />
            <button
              onClick={addToWatchlist}
              disabled={loading || !newCode.trim()}
              style={{
                padding: "10px 16px", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8,
                background: COLORS.hero, color: "#FFF", cursor: "pointer", whiteSpace: "nowrap",
                opacity: loading || !newCode.trim() ? 0.5 : 1,
              }}
            >
              {loading ? "..." : "추가"}
            </button>
          </div>

          {/* 관심종목 리스트 */}
          {watchlist.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>관심종목이 없습니다</div>
              <div style={{ fontSize: 13, color: COLORS.dim, marginTop: 6 }}>
                종목코드를 입력해서 관심종목을 등록하세요. 엔진이 자동으로 신호를 분석합니다.
              </div>
            </div>
          ) : (
            watchlist.map((w) => (
              <div key={w.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: COLORS.card, borderRadius: 10, padding: "12px 16px", marginBottom: 8,
                border: `1px solid ${COLORS.line}`,
              }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{w.name || w.code}</span>
                  {w.name && <span style={{ fontSize: 12, color: COLORS.dim, marginLeft: 8 }}>{w.code}</span>}
                </div>
                <button
                  onClick={() => removeFromWatchlist(w.code)}
                  style={{
                    padding: "6px 12px", fontSize: 12, fontWeight: 600,
                    border: `1px solid ${COLORS.line}`, borderRadius: 6,
                    background: COLORS.bg, color: COLORS.dim, cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
