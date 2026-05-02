"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

interface SearchResult {
  code: string;
  name: string;
  market: string;
}

interface Props {
  kisConnected: boolean;
  kisConfigured: boolean;
  onDone: () => void;
}

export function ManualBuyForm({ kisConnected, kisConfigured, onDone }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [manualQty, setManualQty] = useState("1");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); setShowDrop(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`);
      const data: SearchResult[] = res.ok ? await res.json() : [];
      setSuggestions(data);
      setShowDrop(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setSelected(null);
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // 6자리 숫자면 바로 선택
    if (/^\d{6}$/.test(val.trim())) {
      setSuggestions([]);
      setShowDrop(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(val.trim()), 280);
  };

  const handleSelect = (item: SearchResult) => {
    setSelected(item);
    setQuery(`${item.name} (${item.code})`);
    setSuggestions([]);
    setShowDrop(false);
  };

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const queueManualBuy = async () => {
    const rawQuery = query.trim();
    let stockCode = "";
    let stockName = "";

    if (selected) {
      stockCode = selected.code;
      stockName = selected.name;
    } else if (/^\d{6}$/.test(rawQuery)) {
      stockCode = rawQuery;
      stockName = rawQuery;
    } else {
      setManualResult("실패: 종목을 검색해서 선택하거나 6자리 코드를 입력해 주세요.");
      return;
    }

    const qty = Math.floor(Number(manualQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setManualResult("실패: 수량은 1주 이상이어야 합니다.");
      return;
    }

    setManualLoading(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/manual-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ stock_code: stockCode, stock_name: stockName, qty }] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualResult(`실패: ${data.error || "수동 매수 등록 실패"}`);
        return;
      }
      setManualResult(`등록 완료: ${stockName} ${qty}주 · 다음 엔진 사이클 체결 대기`);
      setQuery("");
      setSelected(null);
      setManualQty("1");
      useAppStore.getState().fetchPendingCount();
      onDone();
    } catch {
      setManualResult("실패: 수동 매수 요청 전송 중 오류가 발생했습니다.");
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${COLORS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>강제 매수</div>
          <div style={{ fontSize: 12, color: COLORS.dim, marginTop: 4 }}>
            종목명 또는 6자리 코드로 검색해서 매수 큐에 등록합니다.
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "4px 7px", borderRadius: 6,
          background: kisConfigured ? COLORS.riseL : COLORS.sub,
          color: kisConfigured ? COLORS.rise : COLORS.dim,
        }}>
          {kisConfigured ? (kisConnected ? "등록 가능" : "등록 가능 · 잔고확인 재시도 중") : "KIS 설정 필요"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {/* 종목 검색 */}
        <div ref={wrapperRef} style={{ position: "relative" }}>
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDrop(true)}
            placeholder="종목명 또는 종목코드 6자리"
            style={{
              width: "100%", padding: "10px 12px", fontSize: 14,
              border: `1px solid ${selected ? COLORS.rise : COLORS.line}`,
              borderRadius: 8, background: COLORS.bg, color: COLORS.ink,
              outline: "none", boxSizing: "border-box",
            }}
          />
          {searching && (
            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: COLORS.dim }}>
              검색중...
            </span>
          )}
          {showDrop && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
              background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)", overflow: "hidden",
            }}>
              {suggestions.map((item) => (
                <div
                  key={item.code}
                  onMouseDown={() => handleSelect(item)}
                  style={{
                    padding: "9px 12px", cursor: "pointer", display: "flex",
                    justifyContent: "space-between", alignItems: "center",
                    borderBottom: `1px solid ${COLORS.line}`,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.sub)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{item.name}</span>
                  <span style={{ fontSize: 11, color: COLORS.dim }}>{item.code} · {item.market}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 수량 */}
        <input
          value={manualQty}
          onChange={(e) => setManualQty(e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="수량"
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none", boxSizing: "border-box" }}
        />

        <button
          onClick={queueManualBuy}
          disabled={manualLoading || !kisConfigured}
          style={{
            padding: "11px 0", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8,
            background: COLORS.hero, color: "#fff",
            cursor: manualLoading || !kisConfigured ? "default" : "pointer",
            opacity: manualLoading || !kisConfigured ? 0.45 : 1,
          }}
        >
          {manualLoading ? "등록 중..." : "강제 매수 등록"}
        </button>
      </div>

      {manualResult && (
        <div style={{
          marginTop: 10, borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 600,
          background: manualResult.startsWith("등록 완료") ? "#F0FDF4" : "#FEF2F2",
          color: manualResult.startsWith("등록 완료") ? "#16A34A" : "#DC2626",
          border: `1px solid ${manualResult.startsWith("등록 완료") ? "#BBF7D0" : "#FECACA"}`,
        }}>
          {manualResult}
        </div>
      )}
    </div>
  );
}
