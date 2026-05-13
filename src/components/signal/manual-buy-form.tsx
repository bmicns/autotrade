"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

const DEFAULT_US_ORDER_NOTE_TEMPLATES = ["선캐치", "재진입", "뉴스반응", "눌림목", "분할진입"] as const;

interface SearchResult {
  code: string;
  name: string;
  market: string;
  exchangeCode?: string;
  assetClass?: string;
}

interface Props {
  kisConnected: boolean;
  kisConfigured: boolean;
  onDone: () => void;
  marketMode?: "kr" | "us" | "both";
}

export function ManualBuyForm({ kisConnected, kisConfigured, onDone, marketMode = "both" }: Props) {
  const [marketType, setMarketType] = useState<"kr" | "us">(marketMode === "us" ? "us" : "kr");
  const [usConfigured, setUsConfigured] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [manualQty, setManualQty] = useState("1");
  const [manualPrice, setManualPrice] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [noteTemplates, setNoteTemplates] = useState<string[]>([...DEFAULT_US_ORDER_NOTE_TEMPLATES]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); setShowDrop(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}&market=${marketType}`);
      const data: SearchResult[] = res.ok ? await res.json() : [];
      setSuggestions(data);
      setShowDrop(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, [marketType]);

  const handleQueryChange = (val: string) => {
    setSelected(null);
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (marketType === "kr" && /^\d{6}$/.test(val.trim())) {
      setSuggestions([]);
      setShowDrop(false);
      return;
    }
    if (marketType === "us" && /^[A-Z][A-Z0-9.-]{0,14}$/i.test(val.trim())) {
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

  useEffect(() => {
    fetch("/api/kis/config?profile=us")
      .then((res) => res.json())
      .then((data: { appKey?: string; appSecret?: string; accountNo?: string }) => {
        setUsConfigured(Boolean(data.appKey && data.appSecret && data.accountNo));
      })
      .catch(() => setUsConfigured(false));
  }, []);

  useEffect(() => {
    fetch("/api/engine-control")
      .then((res) => res.json())
      .then((data: { manual_us_buy_note_templates?: string[] }) => {
        setNoteTemplates(Array.isArray(data.manual_us_buy_note_templates) && data.manual_us_buy_note_templates.length > 0
          ? data.manual_us_buy_note_templates
          : [...DEFAULT_US_ORDER_NOTE_TEMPLATES]);
      })
      .catch(() => setNoteTemplates([...DEFAULT_US_ORDER_NOTE_TEMPLATES]));
  }, []);

  useEffect(() => {
    if (marketMode === "both") return;
    setMarketType(marketMode);
  }, [marketMode]);

  useEffect(() => {
    setQuery("");
    setSelected(null);
    setSuggestions([]);
    setShowDrop(false);
    setManualResult(null);
    setManualQty("1");
    setManualPrice("");
    setManualNote("");
  }, [marketType]);

  const queueManualBuy = async () => {
    const rawQuery = query.trim();
    let stockCode = "";
    let stockName = "";
    const exchangeCode = selected?.exchangeCode ?? "NASD";

    if (selected) {
      stockCode = selected.code;
      stockName = selected.name;
    } else if (marketType === "kr" && /^\d{6}$/.test(rawQuery)) {
      stockCode = rawQuery;
      stockName = rawQuery;
    } else if (marketType === "us" && /^[A-Z][A-Z0-9.-]{0,14}$/i.test(rawQuery)) {
      stockCode = rawQuery.toUpperCase();
      stockName = stockCode;
    } else {
      setManualResult(marketType === "kr"
        ? "실패: 종목을 검색해서 선택하거나 6자리 코드를 입력해 주세요."
        : "실패: 미국 종목을 검색해서 선택하거나 심볼을 입력해 주세요.");
      return;
    }

    const qty = Math.floor(Number(manualQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setManualResult("실패: 수량은 1주 이상이어야 합니다.");
      return;
    }

    const price = Number(manualPrice);
    if (marketType === "us" && (!Number.isFinite(price) || price <= 0)) {
      setManualResult("실패: 미국 종목은 지정가를 입력해 주세요.");
      return;
    }

    setManualLoading(true);
    setManualResult(null);
    try {
      const res = await fetch(
        marketType === "kr" ? "/api/manual-buy" : "/api/kis/order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: marketType === "kr"
            ? JSON.stringify({ items: [{ stock_code: stockCode, stock_name: stockName, qty }] })
            : JSON.stringify({
              side: "buy",
              stockCode,
              stockName,
              quantity: qty,
              price,
              orderType: "00",
              market: "us",
              exchangeCode,
              profileId: "us",
              note: manualNote.trim(),
            }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setManualResult(`실패: ${data.error || "수동 매수 등록 실패"}`);
        return;
      }
      setManualResult(
        marketType === "kr"
          ? `등록 완료: ${stockName} ${qty}주 · 다음 엔진 사이클 체결 대기`
          : `주문 완료: ${stockName} ${qty}주 · ${exchangeCode} · $${price.toFixed(2)}`,
      );
      setQuery("");
      setSelected(null);
      setManualQty("1");
      setManualPrice("");
      setManualNote("");
      useAppStore.getState().fetchPendingCount();
      onDone();
    } catch {
      setManualResult("실패: 수동 매수 요청 전송 중 오류가 발생했습니다.");
    } finally {
      setManualLoading(false);
    }
  };

  const isConfigured = marketType === "kr" ? kisConfigured : usConfigured;

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${COLORS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>강제 매수</div>
          <div style={{ fontSize: 12, color: COLORS.dim, marginTop: 4 }}>
            {marketType === "kr"
              ? "종목명 또는 6자리 코드로 검색해서 매수 큐에 등록합니다."
              : "미국 종목은 지정가로 즉시 주문합니다."}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "4px 7px", borderRadius: 6,
          background: isConfigured ? COLORS.riseL : COLORS.sub,
          color: isConfigured ? COLORS.rise : COLORS.dim,
        }}>
          {isConfigured
            ? marketType === "kr"
              ? (kisConnected ? "등록 가능" : "등록 가능 · 잔고확인 재시도 중")
              : "주문 가능"
            : marketType === "kr"
              ? "KIS 설정 필요"
              : "미국 KIS 설정 필요"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {marketMode === "both" && (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <button
              type="button"
              onClick={() => setMarketType("kr")}
              style={{
                padding: "9px 0",
                borderRadius: 8,
                border: `1px solid ${marketType === "kr" ? COLORS.hero : COLORS.line}`,
                background: marketType === "kr" ? COLORS.hero : COLORS.bg,
                color: marketType === "kr" ? "#fff" : COLORS.ink,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              국내 큐 등록
            </button>
            <button
              type="button"
              onClick={() => setMarketType("us")}
              style={{
                padding: "9px 0",
                borderRadius: 8,
                border: `1px solid ${marketType === "us" ? COLORS.hero : COLORS.line}`,
                background: marketType === "us" ? COLORS.hero : COLORS.bg,
                color: marketType === "us" ? "#fff" : COLORS.ink,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              미국 즉시 주문
            </button>
          </div>
        )}

        {/* 종목 검색 */}
        <div ref={wrapperRef} style={{ position: "relative" }}>
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDrop(true)}
            placeholder={marketType === "kr" ? "종목명 또는 종목코드 6자리" : "미국 종목명 또는 심볼"}
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

        <div style={{ display: "grid", gap: 8, gridTemplateColumns: marketType === "us" ? "1fr 1fr" : "1fr" }}>
          <input
            value={manualQty}
            onChange={(e) => setManualQty(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="수량"
            style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none", boxSizing: "border-box" }}
          />
          {marketType === "us" && (
            <input
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
              placeholder="지정가 (USD)"
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none", boxSizing: "border-box" }}
            />
          )}
        </div>

        {marketType === "us" && (
          <div style={{ display: "grid", gap: 6 }}>
            <input
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value.slice(0, 120))}
              placeholder="주문 메모 (선택)"
              style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {noteTemplates.map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => setManualNote(template)}
                  style={{
                    padding: "5px 8px",
                    borderRadius: 999,
                    border: `1px solid ${manualNote === template ? COLORS.hero : COLORS.line}`,
                    background: manualNote === template ? COLORS.hero : COLORS.bg,
                    color: manualNote === template ? "#fff" : COLORS.dim,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {template}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={queueManualBuy}
          disabled={manualLoading || !isConfigured}
          style={{
            padding: "11px 0", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8,
            background: COLORS.hero, color: "#fff",
            cursor: manualLoading || !isConfigured ? "default" : "pointer",
            opacity: manualLoading || !isConfigured ? 0.45 : 1,
          }}
        >
          {manualLoading ? "처리 중..." : marketType === "kr" ? "강제 매수 등록" : "미국 지정가 주문"}
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
