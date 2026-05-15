"use client";

import { useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useStockSearch } from "@/hooks/useStockSearch";
import { usePendingSignals } from "@/hooks/usePendingSignals";

export function WatchlistSection() {
  const [query, setQuery] = useState("");
  const { results, searching } = useStockSearch(query);
  const { watchlist, loading, fetchWatchlist, addItem, removeItem } = useWatchlist();
  const { dartCodes, fetchEngineLog } = usePendingSignals();

  useEffect(() => {
    fetchWatchlist();
    fetchEngineLog();
  }, [fetchWatchlist, fetchEngineLog]);

  const handleAdd = async (code: string, name: string) => {
    await addItem(code, name);
    setQuery("");
  };

  return (
    <div>
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
          관심종목 ({watchlist.length})
        </span>
      </div>
      <div style={{ padding: "0 20px 16px" }}>
        <div style={{ position: "relative", marginBottom: 16 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 종목코드 검색 (예: 삼성전자, 005930)"
            style={{
              width: "100%", padding: "12px 14px", fontSize: 14,
              border: `1px solid ${COLORS.line}`, borderRadius: 8,
              background: COLORS.bg, color: COLORS.ink, outline: "none",
              boxSizing: "border-box",
            }}
          />
          {searching && (
            <div style={{ position: "absolute", right: 12, top: 13, fontSize: 12, color: COLORS.dim }}>
              검색 중...
            </div>
          )}
          {results.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
              marginTop: 4, background: "#FFF", border: `1px solid ${COLORS.line}`,
              borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              maxHeight: 240, overflowY: "auto",
            }}>
              {results.map((s) => {
                const already = watchlist.some((w) => w.code === s.code);
                return (
                  <button
                    key={s.code}
                    onClick={() => handleAdd(s.code, s.name)}
                    disabled={loading || already}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "10px 14px", border: "none",
                      borderBottom: `1px solid ${COLORS.line}`,
                      background: already ? "#f5f5f7" : "transparent",
                      cursor: already ? "default" : "pointer",
                      textAlign: "left", fontSize: 14, color: COLORS.ink,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.dim }}>{s.code}</span>
                    </div>
                    <span style={{ fontSize: 11, color: COLORS.dim, flexShrink: 0 }}>
                      {already ? "등록됨" : s.market}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {watchlist.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>관심종목이 없습니다</div>
            <div style={{ fontSize: 13, color: COLORS.dim, marginTop: 6 }}>
              종목코드를 입력해서 관심종목을 등록하세요. 엔진이 자동으로 신호를 분석합니다.
            </div>
          </div>
        ) : (
          watchlist.map((w, index) => {
            const isDart = dartCodes.has(w.code);
            const rowKey = w.id ? `${w.code}-${w.id}` : `${w.code}-${index}`;
            return (
              <div key={rowKey} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: isDart ? COLORS.fallL : COLORS.card,
                borderRadius: 10, padding: "12px 16px", marginBottom: 8,
                border: `1px solid ${isDart ? COLORS.fallB : COLORS.line}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{w.name || w.code}</span>
                      {isDart && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: COLORS.fall, color: "#fff" }}>
                          ⚠ DART
                        </span>
                      )}
                    </div>
                    {w.name && <span style={{ fontSize: 12, color: COLORS.dim }}>{w.code}</span>}
                  </div>
                </div>
                <button
                  onClick={() => removeItem(w.code)}
                  style={{
                    padding: "6px 12px", fontSize: 12, fontWeight: 600,
                    border: `1px solid ${COLORS.line}`, borderRadius: 6,
                    background: COLORS.bg, color: COLORS.dim, cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
