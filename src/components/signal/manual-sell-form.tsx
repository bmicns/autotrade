"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

const DEFAULT_US_ORDER_NOTE_TEMPLATES = ["익절", "리스크축소", "비중축소", "뉴스대응", "수동정리"] as const;

interface OverseasHolding {
  symbol: string;
  name: string;
  exchangeCode: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnlAmount: number;
  pnlRate: number;
  currency: string;
  kind: "stock" | "etf";
}

interface SearchResult {
  code: string;
  name: string;
  market: string;
  exchangeCode?: string;
  quantity: number;
}

interface KISConfigResponse {
  appKey?: string;
  appSecret?: string;
  accountNo?: string;
  token?: string;
  runtimeMode?: string;
}

interface Props {
  kisConfigured: boolean;
  onDone: () => void | Promise<void>;
  marketMode?: "kr" | "us" | "both";
}

export function ManualSellForm({ kisConfigured, onDone, marketMode = "both" }: Props) {
  const removeHolding = useAppStore((s) => s.removeHolding);
  const [marketType, setMarketType] = useState<"kr" | "us">(marketMode === "us" ? "us" : "kr");
  const [usConfigured, setUsConfigured] = useState(false);
  const [domesticConfigured, setDomesticConfigured] = useState(kisConfigured);
  const [domesticVerified, setDomesticVerified] = useState(false);
  const [domesticProfileLabel, setDomesticProfileLabel] = useState("모의투자");
  const [domesticHoldings, setDomesticHoldings] = useState<Array<{
    code: string;
    name: string;
    market: string;
    quantity: number;
  }>>([]);
  const [usHoldings, setUsHoldings] = useState<OverseasHolding[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [showDrop, setShowDrop] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [noteTemplates, setNoteTemplates] = useState<string[]>([...DEFAULT_US_ORDER_NOTE_TEMPLATES]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDomesticConfig = async () => {
      try {
        const defaultRes = await fetch("/api/kis/config?profile=default");
        const defaultData = await defaultRes.json() as KISConfigResponse;
        const runtimeMode = defaultData.runtimeMode === "prod" ? "prod" : "paper";
        const profileId = runtimeMode === "prod" ? "kr" : "default";
        const profileLabel = runtimeMode === "prod" ? "국내 계좌" : "모의투자";

        let activeData = defaultData;
        if (profileId === "kr") {
          const krRes = await fetch("/api/kis/config?profile=kr");
          activeData = await krRes.json() as KISConfigResponse;
        }

        setDomesticProfileLabel(profileLabel);
        setDomesticConfigured(Boolean(activeData.appKey && activeData.appSecret && activeData.accountNo));
        setDomesticVerified(Boolean(activeData.token));
      } catch {
        setDomesticConfigured(kisConfigured);
        setDomesticVerified(false);
      }
    };

    void loadDomesticConfig();
  }, [kisConfigured]);

  useEffect(() => {
    const loadDomesticHoldings = async () => {
      try {
        const res = await fetch("/api/kis/domestic-holdings");
        const data = await res.json() as { holdings?: Array<{ code: string; name: string; market: string; quantity: number }> };
        setDomesticHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      } catch {
        setDomesticHoldings([]);
      }
    };

    void loadDomesticHoldings();
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
      .then((data: { manual_us_sell_note_templates?: string[] }) => {
        setNoteTemplates(Array.isArray(data.manual_us_sell_note_templates) && data.manual_us_sell_note_templates.length > 0
          ? data.manual_us_sell_note_templates
          : [...DEFAULT_US_ORDER_NOTE_TEMPLATES]);
      })
      .catch(() => setNoteTemplates([...DEFAULT_US_ORDER_NOTE_TEMPLATES]));
  }, []);

  useEffect(() => {
    fetch("/api/kis/overseas-holdings")
      .then((res) => res.json())
      .then((data: { holdings?: OverseasHolding[] }) => {
        setUsHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      })
      .catch(() => setUsHoldings([]));
  }, []);

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
    if (marketMode === "both") return;
    setMarketType(marketMode);
  }, [marketMode]);

  useEffect(() => {
    setQuery("");
    setSelected(null);
    setManualPrice("");
    setManualNote("");
    setResult(null);
    setShowDrop(false);
  }, [marketType]);

  const domesticOptions = useMemo<SearchResult[]>(
    () => domesticHoldings.map((holding) => ({
      code: holding.code,
      name: holding.name,
      market: holding.market,
      quantity: holding.quantity,
    })),
    [domesticHoldings],
  );

  const overseasOptions = useMemo<SearchResult[]>(
    () => usHoldings.map((holding) => ({
      code: holding.symbol,
      name: holding.name,
      market: holding.kind === "etf" ? "US ETF" : "US STOCK",
      exchangeCode: holding.exchangeCode,
      quantity: holding.quantity,
    })),
    [usHoldings],
  );

  const suggestions = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const source = marketType === "kr" ? domesticOptions : overseasOptions;
    if (!raw) return source.slice(0, 8);
    return source.filter((item) =>
      item.code.toLowerCase().includes(raw) ||
      item.name.toLowerCase().includes(raw),
    ).slice(0, 8);
  }, [domesticOptions, marketType, overseasOptions, query]);

  const handleSelect = (item: SearchResult) => {
    setSelected(item);
    setQuery(`${item.name} (${item.code})`);
    setShowDrop(false);
  };

  const submit = async () => {
    const target = selected;
    if (!target) {
      setResult("실패: 보유 종목을 선택해 주세요.");
      return;
    }

    const isConfigured = marketType === "kr" ? domesticConfigured : usConfigured;
    if (!isConfigured) {
      setResult(marketType === "kr" ? `실패: ${domesticProfileLabel} KIS 설정이 필요합니다.` : "실패: 미국 KIS 설정이 필요합니다.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(marketType === "kr" ? "/api/manual-sell" : "/api/kis/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: marketType === "kr"
          ? JSON.stringify({ stockCode: target.code, quantity: target.quantity })
          : JSON.stringify({
            side: "sell",
            stockCode: target.code,
            stockName: target.name,
            quantity: target.quantity,
            price: Number(manualPrice),
            orderType: "00",
            market: "us",
            exchangeCode: target.exchangeCode ?? "NASD",
            profileId: "us",
            note: manualNote.trim(),
          }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`실패: ${data.error || "수동 매도 실패"}`);
        return;
      }
      setResult(
        marketType === "kr"
          ? `매도 완료: ${target.name} ${target.quantity}주 전량`
          : `미국 매도 완료: ${target.code} ${target.quantity}주 · ${target.exchangeCode ?? "NASD"}`,
      );
      if (marketType === "kr") {
        removeHolding(target.code);
        setDomesticHoldings((prev) => prev.filter((item) => item.code !== target.code));
      }
      setQuery("");
      setSelected(null);
      setManualPrice("");
      setManualNote("");
      await onDone();
    } catch {
      setResult("실패: 수동 매도 요청 전송 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const isConfigured = marketType === "kr" ? domesticConfigured : usConfigured;
  const isReadyToSubmit = marketType === "kr"
    ? isConfigured && !!selected
    : isConfigured && !!selected;

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${COLORS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>강제 매도</div>
          <div style={{ fontSize: 12, color: COLORS.dim, marginTop: 4 }}>
            {marketType === "kr" ? "국내는 전량 매도만 지원합니다." : "미국은 현재 보유를 지정가로 즉시 매도합니다."}
          </div>
        </div>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "4px 7px",
          borderRadius: 6,
          background: isReadyToSubmit ? COLORS.riseL : COLORS.sub,
          color: isReadyToSubmit ? COLORS.rise : COLORS.dim,
        }}>
          {marketType === "kr"
            ? isReadyToSubmit
              ? "실행 가능"
              : !isConfigured
                ? `${domesticProfileLabel} KIS 필요`
                : "종목 선택 필요"
            : isConfigured
              ? "실행 가능"
              : "미국 KIS 필요"}
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
                border: `1px solid ${marketType === "kr" ? COLORS.fall : COLORS.line}`,
                background: marketType === "kr" ? COLORS.fall : COLORS.bg,
                color: marketType === "kr" ? "#fff" : COLORS.ink,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              국내 전량 매도
            </button>
            <button
              type="button"
              onClick={() => setMarketType("us")}
              style={{
                padding: "9px 0",
                borderRadius: 8,
                border: `1px solid ${marketType === "us" ? COLORS.fall : COLORS.line}`,
                background: marketType === "us" ? COLORS.fall : COLORS.bg,
                color: marketType === "us" ? "#fff" : COLORS.ink,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              미국 즉시 매도
            </button>
          </div>
        )}

        <div ref={wrapperRef} style={{ position: "relative" }}>
          <input
            value={query}
            onChange={(e) => {
              setSelected(null);
              setQuery(e.target.value);
              setShowDrop(true);
            }}
            onFocus={() => setShowDrop(true)}
            placeholder={marketType === "kr" ? "보유 국내 종목 검색" : "보유 미국 종목 검색"}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: `1px solid ${selected ? COLORS.fall : COLORS.line}`,
              borderRadius: 8,
              background: COLORS.bg,
              color: COLORS.ink,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {showDrop && suggestions.length > 0 && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 50,
              background: COLORS.bg,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}>
              {suggestions.map((item) => (
                <div
                  key={`${item.code}:${item.exchangeCode ?? "KR"}`}
                  onMouseDown={() => handleSelect(item)}
                  style={{
                    padding: "9px 12px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: `1px solid ${COLORS.line}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{item.name}</span>
                  <span style={{ fontSize: 11, color: COLORS.dim }}>
                    {item.code} · {item.quantity}주{item.exchangeCode ? ` · ${item.exchangeCode}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: COLORS.sub, border: `1px solid ${COLORS.line}`, fontSize: 12, color: COLORS.dim }}>
            {selected.name} · {selected.code} · {selected.quantity}주{selected.exchangeCode ? ` · ${selected.exchangeCode}` : ""}
          </div>
        )}

        {marketType === "kr" && !domesticConfigured && (
          <div style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            fontSize: 12,
            color: "#B45309",
            lineHeight: 1.5,
          }}>
            {`${domesticProfileLabel} KIS 설정이 없습니다. 설정 탭에서 키와 계좌를 먼저 저장해 주세요.`}
          </div>
        )}

        {marketType === "kr" && domesticConfigured && !domesticVerified && (
          <div style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            fontSize: 12,
            color: "#1D4ED8",
            lineHeight: 1.5,
          }}>
            {`${domesticProfileLabel} 저장 토큰이 없거나 만료되었을 수 있습니다. 강제매도 실행 시 서버가 토큰 재발급을 시도합니다.`}
          </div>
        )}

        {marketType === "us" && (
          <>
            <input
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
              placeholder="지정가 (USD)"
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: COLORS.bg, color: COLORS.ink, outline: "none", boxSizing: "border-box" }}
            />
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
                    border: `1px solid ${manualNote === template ? COLORS.fall : COLORS.line}`,
                    background: manualNote === template ? COLORS.fall : COLORS.bg,
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
          </>
        )}

        <button
          onClick={submit}
          disabled={loading || !isReadyToSubmit}
          style={{
            padding: "11px 0",
            fontSize: 14,
            fontWeight: 700,
            border: "none",
            borderRadius: 8,
            background: COLORS.fall,
            color: "#fff",
            cursor: loading || !isReadyToSubmit ? "default" : "pointer",
            opacity: loading || !isReadyToSubmit ? 0.45 : 1,
          }}
        >
          {loading ? "처리 중..." : marketType === "kr" ? "국내 전량 매도" : "미국 지정가 매도"}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: 10,
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 12,
          fontWeight: 600,
          background: result.startsWith("실패") ? "#FEF2F2" : "#F0FDF4",
          color: result.startsWith("실패") ? "#DC2626" : "#16A34A",
          border: `1px solid ${result.startsWith("실패") ? "#FECACA" : "#BBF7D0"}`,
        }}>
          {result}
        </div>
      )}
    </div>
  );
}
