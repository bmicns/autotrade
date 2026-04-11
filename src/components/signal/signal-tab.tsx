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

interface FilterLog {
  stock_code: string;
  stock_name?: string;
  action_type: string;
  reason: string;
  run_at: string;
}

export function SignalTab() {
  const kisConnected = useAppStore((s) => s.kisConnected);
  const kisConfig = useAppStore((s) => s.kisConfig);
  const [tab, setTab] = useState<"signals" | "watchlist">("signals");
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [signals, setSignals] = useState<PendingSignal[]>([]);
  const [filterLogs, setFilterLogs] = useState<FilterLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ code: string; name: string; market: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dartCodes, setDartCodes] = useState<Set<string>>(new Set());

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
    fetch("/api/engine-log")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.filterLogs)) setFilterLogs(d.filterLogs);
        // DART 위험공시 종목 코드 세트 추출
        const dartSet = new Set<string>();
        (d.filterLogs as FilterLog[] || []).forEach((l) => {
          if (l.action_type === "dart_filtered") dartSet.add(l.stock_code);
        });
        setDartCodes(dartSet);
      })
      .catch(() => {});
  }, [fetchWatchlist, fetchSignals]);

  // 종목 검색 디바운스
  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/stock-search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addToWatchlist = async (code: string, name: string) => {
    setLoading(true);
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      setSearchQuery("");
      setSearchResults([]);
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
          // 승인된 신호 → 즉시 시장가 매수 시도
          try {
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
                quantity: 1,
                price: 0,
                orderType: "01",
              }),
            });
            const orderData = await orderRes.json();
            if (orderRes.ok && orderData.rt_cd === "0") {
              // 매수 성공 → expired 처리
              await fetch("/api/pending-signals", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status: "expired" }),
              });
            } else {
              // 매수 실패 → approved 유지, 엔진이 다음 사이클에서 재시도
              alert(`즉시매수 실패 (엔진이 재시도합니다): ${orderData.msg1 || orderData.error || "알 수 없는 오류"}`);
            }
          } catch {
            // 네트워크 에러 → approved 유지, 엔진 재시도 대기
            alert("즉시매수 요청 실패 — 엔진이 다음 사이클에서 재시도합니다.");
          }
        }
      }
      fetchSignals();
      useAppStore.getState().fetchPendingCount();
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

          {/* 필터 탈락 로그 */}
          {filterLogs.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
                최근 필터 탈락 ({filterLogs.length})
              </div>
              {filterLogs.map((l, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 12px", borderRadius: 8, marginBottom: 6,
                  background: l.action_type === "dart_filtered" ? COLORS.fallL : COLORS.sub,
                  border: `1px solid ${l.action_type === "dart_filtered" ? COLORS.fallB : COLORS.line}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                        {l.stock_name || l.stock_code}
                      </span>
                      {l.action_type === "dart_filtered" && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: COLORS.fall, color: "#fff",
                        }}>DART</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: COLORS.dim, marginTop: 2, display: "block" }}>
                      {l.reason}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: COLORS.dim, flexShrink: 0, marginLeft: 8 }}>
                    {new Date(l.run_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "watchlist" && (
        <div>
          {/* 종목 검색 */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="종목명 또는 종목코드 검색 (예: 삼성전자, 005930)"
              style={{
                width: "100%", padding: "12px 14px", fontSize: 14, border: `1px solid ${COLORS.line}`,
                borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none",
                boxSizing: "border-box",
              }}
            />
            {searching && (
              <div style={{ position: "absolute", right: 12, top: 13, fontSize: 12, color: COLORS.dim }}>검색 중...</div>
            )}
            {searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 4,
                background: "#FFF", border: `1px solid ${COLORS.line}`, borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 240, overflowY: "auto",
              }}>
                {searchResults.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => addToWatchlist(s.code, s.name)}
                    disabled={loading || watchlist.some((w) => w.code === s.code)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "10px 14px", border: "none", borderBottom: `1px solid ${COLORS.line}`,
                      background: watchlist.some((w) => w.code === s.code) ? "#f5f5f7" : "transparent",
                      cursor: watchlist.some((w) => w.code === s.code) ? "default" : "pointer",
                      textAlign: "left", fontSize: 14, color: COLORS.ink,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.dim }}>{s.code}</span>
                    </div>
                    <span style={{ fontSize: 11, color: COLORS.dim, flexShrink: 0 }}>
                      {watchlist.some((w) => w.code === s.code) ? "등록됨" : s.market}
                    </span>
                  </button>
                ))}
              </div>
            )}
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
                background: dartCodes.has(w.code) ? COLORS.fallL : COLORS.card,
                borderRadius: 10, padding: "12px 16px", marginBottom: 8,
                border: `1px solid ${dartCodes.has(w.code) ? COLORS.fallB : COLORS.line}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{w.name || w.code}</span>
                      {dartCodes.has(w.code) && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                          background: COLORS.fall, color: "#fff",
                        }}>⚠ DART</span>
                      )}
                    </div>
                    {w.name && <span style={{ fontSize: 12, color: COLORS.dim }}>{w.code}</span>}
                  </div>
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
