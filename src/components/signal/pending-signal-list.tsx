"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { type PendingSignal, type FilterLog } from "@/hooks/usePendingSignals";

interface Props {
  signals: PendingSignal[];
  recentSignals: PendingSignal[];
  filterLogs: FilterLog[];
  fetchSignals: () => void;
  expireSignal: (id: string) => Promise<boolean>;
  rejectSignal: (id: string) => Promise<boolean>;
  bulkApproveSignals: () => Promise<{ ok: boolean; approvedCount: number; error?: string }>;
  bulkBuySignals: () => Promise<{ ok: boolean; approvedCount: number; failedCount: number; error?: string }>;
}

interface BulkBuyRuntimeStatus {
  profileId: string;
  source: string;
  runtimeMode: string;
  tokenExpiry: string;
  tokenValid: boolean;
}

function getSignalStatusLabel(status: string) {
  switch (status) {
    case "approved":   return { text: "체결 대기", bg: COLORS.riseL,   color: COLORS.rise };
    case "processing": return { text: "처리 중",   bg: "#FEF3C7",      color: "#B45309" };
    case "expired":    return { text: "주문 접수", bg: "#F0FDF4",      color: "#15803D" };
    case "failed":     return { text: "주문 실패", bg: "#FEF2F2",      color: "#DC2626" };
    case "rejected":   return { text: "취소됨",    bg: COLORS.sub,     color: COLORS.dim };
    default:           return { text: "승인 대기", bg: COLORS.fallL,   color: COLORS.fall };
  }
}

export function PendingSignalList({ signals, recentSignals, filterLogs, fetchSignals, expireSignal, rejectSignal, bulkApproveSignals, bulkBuySignals }: Props) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [bulkBuyRuntimeStatus, setBulkBuyRuntimeStatus] = useState<BulkBuyRuntimeStatus | null>(null);
  const pendingCount = signals.filter((signal) => signal.status === "pending").length;

  useEffect(() => {
    const unresolvedCodes = Array.from(new Set([
      ...signals.map((signal) => ({ code: signal.stock_code, name: signal.stock_name })),
      ...recentSignals.map((signal) => ({ code: signal.stock_code, name: signal.stock_name })),
      ...filterLogs.map((log) => ({ code: log.stock_code, name: log.stock_name ?? null })),
    ]
      .filter((item) => /^\d{6}$/.test(item.code) && (!item.name || item.name === item.code))
      .map((item) => item.code)))
      .filter((code) => !resolvedNames[code]);

    if (unresolvedCodes.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(unresolvedCodes.map(async (code) => {
        try {
          const res = await fetch(`/api/stock-search?q=${encodeURIComponent(code)}&market=kr`);
          const data = res.ok ? await res.json() as Array<{ code?: string; name?: string }> : [];
          const match = data.find((item) => item.code === code && item.name && item.name !== code);
          return match ? [code, match.name] as const : null;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const next = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
      if (Object.keys(next).length > 0) {
        setResolvedNames((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filterLogs, recentSignals, resolvedNames, signals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/kis/config?profile=default");
        if (!res.ok) return;
        const data = await res.json() as {
          profileId?: string;
          source?: string;
          runtimeMode?: string;
          tokenExpiry?: string;
        };
        if (cancelled) return;
        if (!data.profileId || !data.source || !data.runtimeMode) return;
        setBulkBuyRuntimeStatus({
          profileId: data.profileId,
          source: data.source,
          runtimeMode: data.runtimeMode,
          tokenExpiry: typeof data.tokenExpiry === "string" ? data.tokenExpiry : "",
          tokenValid: (() => {
            const expiryMs = typeof data.tokenExpiry === "string" ? new Date(data.tokenExpiry).getTime() : Number.NaN;
            return Number.isFinite(expiryMs) && expiryMs - Date.now() > 60_000;
          })(),
        });
      } catch {
        if (!cancelled) setBulkBuyRuntimeStatus(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const bulkBuyStatusText = bulkBuyRuntimeStatus
    ? `${bulkBuyRuntimeStatus.source}/${bulkBuyRuntimeStatus.profileId} · ${bulkBuyRuntimeStatus.runtimeMode === "paper" ? "모의" : "실전"} · ${bulkBuyRuntimeStatus.tokenValid ? "토큰 유효" : "연결 테스트 필요"}`
    : "주문 프로필 확인 중...";

  const renderStockLabel = (code: string, name?: string | null, emphasis: "strong" | "regular" = "strong") => {
    const resolvedName = name && name !== code ? name : resolvedNames[code];
    if (!resolvedName) {
      return <span style={{ fontSize: emphasis === "strong" ? 15 : 13, fontWeight: emphasis === "strong" ? 700 : 600, color: COLORS.ink }}>{code}</span>;
    }
    return (
      <>
        <span style={{ fontSize: emphasis === "strong" ? 15 : 13, fontWeight: emphasis === "strong" ? 700 : 600, color: COLORS.ink }}>{resolvedName}</span>
        <span style={{ fontSize: 12, color: COLORS.dim, marginLeft: 8 }}>{code}</span>
      </>
    );
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
        if (signal) {
          try {
            const orderRes = await fetch("/api/kis/order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                stockCode: signal.stock_code,
                stockName: signal.stock_name ?? signal.stock_code,
                side: "buy",
                quantity: (signal.signal_data?.qty_override as number) || 1,
                price: 0,
                orderType: "01",
              }),
            });
            const orderData = await orderRes.json();
            if (orderRes.ok && orderData.rt_cd === "0") {
              await expireSignal(id);
            } else {
              alert(`즉시매수 실패 (엔진이 재시도합니다): ${orderData.msg1 || orderData.error || "알 수 없는 오류"}`);
            }
          } catch {
            alert("즉시매수 요청 실패 — 엔진이 다음 사이클에서 재시도합니다.");
          }
        }
      }
      fetchSignals();
      useAppStore.getState().fetchPendingCount();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleBulkBuy = async () => {
    setBulkLoading(true);
    setActionResult(null);
    const result = await bulkBuySignals();
    if (!result.ok) {
      setActionResult(`실패: ${result.error || "일괄매수 실패"}`);
      setBulkLoading(false);
      return;
    }

    const message = result.failedCount > 0
      ? `일괄매수 완료: ${result.approvedCount}건 주문, ${result.failedCount}건은 체결 대기로 남겼습니다.`
      : `일괄매수 완료: ${result.approvedCount}건 주문 접수`;
    setActionResult(message);
    await fetchSignals();
    useAppStore.getState().fetchPendingCount();
    setBulkLoading(false);
  };

  const handleBulkApprove = async () => {
    setApproveLoading(true);
    setActionResult(null);
    const result = await bulkApproveSignals();
    if (!result.ok) {
      setActionResult(`실패: ${result.error || "일괄 승인 실패"}`);
      setApproveLoading(false);
      return;
    }

    setActionResult(`일괄 승인 완료: ${result.approvedCount}건이 승인 매수 대기로 전환됐습니다.`);
    await fetchSignals();
    useAppStore.getState().fetchPendingCount();
    setApproveLoading(false);
  };

  return (
    <div>
      {pendingCount > 0 && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12, border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: actionResult ? 10 : 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>승인 대기 {pendingCount}건</div>
              <div style={{ fontSize: 12, color: COLORS.dim, marginTop: 4 }}>
                승인만 넘기거나, 즉시 시장가 매수까지 한 번에 실행할 수 있습니다. 결과는 텔레그램 푸시로 전송합니다.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: bulkBuyRuntimeStatus?.tokenValid ? "#EFFCF3" : "#FEF2F2",
                  color: bulkBuyRuntimeStatus?.tokenValid ? "#15803D" : "#DC2626",
                  border: `1px solid ${bulkBuyRuntimeStatus?.tokenValid ? "#BBF7D0" : "#FECACA"}`,
                }}>
                  일괄매수: {bulkBuyStatusText}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={approveLoading || bulkLoading}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 800,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 8,
                  background: COLORS.bg,
                  color: COLORS.ink,
                  cursor: approveLoading || bulkLoading ? "default" : "pointer",
                  opacity: approveLoading || bulkLoading ? 0.5 : 1,
                }}
              >
                {approveLoading ? "승인 중..." : "일괄 승인"}
              </button>
              <button
                type="button"
                onClick={handleBulkBuy}
                disabled={bulkLoading || approveLoading}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 800,
                  border: "none",
                  borderRadius: 8,
                  background: COLORS.hero,
                  color: "#FFF",
                  cursor: bulkLoading || approveLoading ? "default" : "pointer",
                  opacity: bulkLoading || approveLoading ? 0.5 : 1,
                }}
              >
                {bulkLoading ? "일괄매수 중..." : "일괄매수"}
              </button>
            </div>
          </div>
          {actionResult && (
            <div style={{
              marginTop: 10,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12,
              fontWeight: 600,
              background: actionResult.startsWith("실패:") ? "#FEF2F2" : "#F0FDF4",
              color: actionResult.startsWith("실패:") ? "#DC2626" : "#15803D",
              border: `1px solid ${actionResult.startsWith("실패:") ? "#FECACA" : "#BBF7D0"}`,
            }}>
              {actionResult}
            </div>
          )}
        </div>
      )}

      {signals.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.dim} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
            <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>대기 중인 신호 없음</div>
          <div style={{ fontSize: 13, color: COLORS.dim, marginTop: 6, lineHeight: 1.6 }}>
            승인 대기나 체결 대기 신호가 생기면 여기에 표시됩니다.
          </div>
        </div>
      ) : (
        signals.map((s) => (
          <div key={s.id} style={{ background: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                {renderStockLabel(s.stock_code, s.stock_name, "strong")}
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                background: getSignalStatusLabel(s.status).bg,
                color: getSignalStatusLabel(s.status).color,
              }}>
                {getSignalStatusLabel(s.status).text}
              </span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.mid, marginBottom: 12 }}>
              신호 점수: <strong>{s.signal_score}점</strong> &middot; {s.signal_comment}
              {s.source === "manual" ? " · 수동 등록" : s.source === "surge" ? " · 급등주" : " · 관심종목"}
            </div>
            <div style={{ fontSize: 11, color: COLORS.dim, marginBottom: 12 }}>
              {new Date(s.created_at).toLocaleString("ko-KR")}
            </div>
            {s.status === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleSignalAction(s.id, "approved")}
                  disabled={actionLoading === s.id}
                  style={{ flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8, background: COLORS.rise, color: "#FFF", cursor: "pointer", opacity: actionLoading === s.id ? 0.5 : 1 }}
                >
                  {actionLoading === s.id ? "..." : "매수 승인"}
                </button>
                <button
                  onClick={() => handleSignalAction(s.id, "rejected")}
                  disabled={actionLoading === s.id}
                  style={{ flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 600, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: COLORS.bg, color: COLORS.dim, cursor: "pointer" }}
                >
                  무시
                </button>
              </div>
            ) : s.source === "manual" && (s.status === "approved" || s.status === "processing") ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={async () => {
                    setActionLoading(s.id);
                    await rejectSignal(s.id);
                    await fetchSignals();
                    useAppStore.getState().fetchPendingCount();
                    setActionLoading(null);
                  }}
                  disabled={actionLoading === s.id}
                  style={{ flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8, background: "#DC2626", color: "#FFF", cursor: "pointer", opacity: actionLoading === s.id ? 0.5 : 1 }}
                >
                  {actionLoading === s.id ? "..." : "수동 주문 취소"}
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}

      {recentSignals.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
            최근 처리 결과
          </div>
          {recentSignals.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
              <div style={{ minWidth: 0 }}>
                <div>{renderStockLabel(s.stock_code, s.stock_name, "regular")}</div>
                <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 2 }}>{s.signal_comment}</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "4px 7px", borderRadius: 6,
                background: getSignalStatusLabel(s.status).bg,
                color: getSignalStatusLabel(s.status).color,
                whiteSpace: "nowrap",
              }}>
                {getSignalStatusLabel(s.status).text}
              </span>
            </div>
          ))}
        </div>
      )}

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
                  {renderStockLabel(l.stock_code, l.stock_name ?? null, "regular")}
                  {l.action_type === "dart_filtered" && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: COLORS.fall, color: "#fff" }}>DART</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: COLORS.dim, marginTop: 2, display: "block" }}>{l.reason}</span>
              </div>
              <span style={{ fontSize: 10, color: COLORS.dim, flexShrink: 0, marginLeft: 8 }}>
                {new Date(l.run_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
