"use client";

import { useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useEngineState } from "@/hooks/useEngineState";
import { ActionLinkChip } from "@/components/common/action-link-chip";
import { resolveAlertAction, resolveSummaryAction } from "@/lib/navigation/nexio-actions";
import { navigateToSection } from "@/lib/navigation/section-nav";

function fmtKst(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAgo(minutes: number | null) {
  if (minutes === null) return "미확인";
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 전`;
}

const EVENT_LABELS: Record<string, string> = {
  app_config_updated: "설정 변경",
  manual_buy_queued: "수동매수 등록",
  manual_buy_executed: "수동매수 실행",
  manual_sell_executed: "수동매도 실행",
  holding_news_risk_alert_sent: "뉴스리스크 점검",
  pending_order_saved: "주문 대기 저장",
  pending_order_partially_filled: "대기 주문 부분체결",
  pending_order_deleted: "대기 주문 삭제",
  order_failure_recorded: "주문 실패",
  pending_signal_resolved: "신호 처리",
  position_opened: "포지션 진입",
  position_closed: "포지션 청산",
  position_reconciled: "포지션 복구",
  partial_exit_recorded: "부분청산 기록",
  trade_memory_recorded: "메모리 기록",
  trade_memory_closed: "메모리 종료",
};

function describeEvent(event: {
  eventType: string;
  stockCode: string | null;
  payload: Record<string, unknown> | null;
}) {
  const label = EVENT_LABELS[event.eventType] ?? event.eventType;
  const stock = event.stockCode ? ` · ${event.stockCode}` : "";
  const payload = event.payload ?? {};

  if (event.eventType === "app_config_updated") {
    const changes = Array.isArray(payload.changes) ? payload.changes as Array<{ key?: string }> : [];
    const names = changes.map((item) => item.key).filter(Boolean).slice(0, 3).join(", ");
    return `${label}${names ? ` · ${names}` : ""}`;
  }
  if (event.eventType === "manual_sell_executed") {
    const qty = Number(payload.qty ?? 0);
    const price = Number(payload.price ?? 0);
    const currency = String(payload.currency ?? "KRW");
    const note = typeof payload.note === "string" && payload.note.trim() ? ` · 메모 ${payload.note.trim()}` : "";
    return `${label}${stock}${qty > 0 ? ` · ${qty}주` : ""}${price > 0 ? ` @ ${currency === "USD" ? `$${price.toFixed(2)}` : `${price.toLocaleString("ko-KR")}원`}` : ""}${note}`;
  }
  if (event.eventType === "manual_buy_executed") {
    const qty = Number(payload.qty ?? 0);
    const price = Number(payload.price ?? 0);
    const currency = String(payload.currency ?? "KRW");
    const note = typeof payload.note === "string" && payload.note.trim() ? ` · 메모 ${payload.note.trim()}` : "";
    return `${label}${stock}${qty > 0 ? ` · ${qty}주` : ""}${price > 0 ? ` @ ${currency === "USD" ? `$${price.toFixed(2)}` : `${price.toLocaleString("ko-KR")}원`}` : ""}${note}`;
  }
  if (event.eventType === "position_reconciled") {
    const qty = Number(payload.qty ?? 0);
    return `${label}${stock}${qty > 0 ? ` · ${qty}주` : ""}`;
  }
  if (event.eventType === "holding_news_risk_alert_sent") {
    const success = payload.success === true;
    const count = Number(payload.count ?? 0);
    return success ? `${label} · ${count}개 종목 전송` : `${label} · 실패`;
  }
  if (event.eventType === "pending_order_deleted") {
    const resolution = String(payload.resolution ?? "");
    const ageMinutes = Number(payload.age_minutes ?? 0);
    if (resolution === "filled") return `대기 주문 해제${stock} · 체결 반영`;
    if (resolution === "timeout") {
      const cancelSucceeded = payload.cancel_succeeded === true;
      const cancelAttempted = payload.cancel_attempted === true;
      const cancelText = cancelSucceeded ? " · 잔량 취소 완료" : cancelAttempted ? " · 잔량 취소 시도" : "";
      return `대기 주문 해제${stock} · ${ageMinutes}분 미체결${cancelText}`;
    }
    if (resolution === "stale_cleanup") return `대기 주문 정리${stock} · stale ${ageMinutes}분`;
  }
  if (event.eventType === "pending_order_partially_filled") {
    const filledQty = Number(payload.filled_qty ?? 0);
    const remainingQty = Number(payload.remaining_qty ?? 0);
    return `${label}${stock} · ${filledQty}주 체결 / ${remainingQty}주 잔여`;
  }
  if (event.eventType === "pending_signal_resolved") {
    const status = String(payload.status ?? "");
    const signalData = payload.signal_data && typeof payload.signal_data === "object"
      ? (payload.signal_data as Record<string, unknown>)
      : null;
    const detail = typeof signalData?.resolution_detail === "string" && signalData.resolution_detail.trim()
      ? signalData.resolution_detail.trim()
      : "";
    const statusLabel = status === "rejected"
      ? "거절"
      : status === "failed"
        ? "실패"
        : status === "expired"
          ? "종결"
          : status || "처리";
    return `${label}${stock} · ${statusLabel}${detail ? ` · ${detail}` : ""}`;
  }
  if (event.eventType === "order_failure_recorded") {
    const side = payload.side === "sell" ? "매도" : "매수";
    const tag = typeof payload.tag === "string" ? payload.tag : "주문실패";
    const kisCode = typeof payload.kis_code === "string" && payload.kis_code ? ` · ${payload.kis_code}` : "";
    return `${label}${stock} · ${side} · ${tag}${kisCode}`;
  }
  return `${label}${stock}`;
}

interface EngineStateCardProps {
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function EngineStateCard({ collapsible = false, defaultOpen = true }: EngineStateCardProps) {
  const { state, loading, fetchEngineState } = useEngineState();

  useEffect(() => {
    fetchEngineState();
  }, [fetchEngineState]);

  if (loading && !state) return null;
  if (!state) return null;

  const content = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: state.runtime.engineEnabled ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${state.runtime.engineEnabled ? "#BBF7D0" : "#FECACA"}`,
        }}>
          <div style={{ fontSize: 10, color: COLORS.dim }}>엔진 스위치</div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: state.runtime.engineEnabled ? "#15803D" : "#DC2626" }}>
            {state.runtime.engineEnabled ? "활성" : "정지"}
          </div>
        </div>
        <div style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: state.runtime.engineLocked ? "#FFFBEB" : COLORS.sub,
          border: `1px solid ${state.runtime.engineLocked ? "#FDE68A" : COLORS.line}`,
        }}>
          <div style={{ fontSize: 10, color: COLORS.dim }}>실행 상태</div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: state.runtime.engineLocked ? "#B45309" : COLORS.ink }}>
            {state.runtime.engineLocked ? "실행 중" : "대기 중"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 10, color: COLORS.dim }}>헬스</div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: COLORS.ink }}>
            {state.runtime.healthStatus.status}
          </div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 10, color: COLORS.dim }}>마지막 실행</div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: COLORS.ink }}>
            {formatAgo(state.runtime.healthStatus.minutesSinceLastRun)}
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: COLORS.dim }}>실행 환경</div>
        <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: COLORS.ink }}>
          {String(state.runtime.environment).toUpperCase()} · {state.runtime.kisRuntime.mode === "paper" ? "모의투자" : state.runtime.kisRuntime.mode}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: COLORS.mid, lineHeight: 1.5 }}>
          {state.runtime.kisRuntime.profileLabel ?? "미설정"} 프로필
          {state.runtime.kisRuntime.accountMask ? ` · ${state.runtime.kisRuntime.accountMask}` : ""}
          {state.runtime.kisRuntime.source ? ` · ${state.runtime.kisRuntime.source}` : ""}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "오픈 포지션", value: state.summary.openPositionCount, tone: COLORS.ink },
          { label: "대기 주문", value: state.summary.pendingOrderCount, tone: "#B45309" },
          { label: "stale 주문", value: state.summary.pendingOrderStaleCount, tone: state.summary.pendingOrderStaleCount > 0 ? "#DC2626" : "#15803D" },
          { label: "대기 신호", value: state.summary.pendingSignalCount, tone: COLORS.rise },
        ].map((item) => {
          const action = resolveSummaryAction(item.label);
          return (
          <button
            key={item.label}
            type="button"
            onClick={() => action?.anchor && navigateToSection(action.path, action.anchor)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: COLORS.sub,
              border: `1px solid ${COLORS.line}`,
              textAlign: "left",
              cursor: action ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: item.tone }}>{item.value}</div>
            {action && <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>{action.hint}</div>}
          </button>
        )})}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        {[
          { label: "최근 부분체결", value: state.summary.recentPartialFillCount, tone: state.summary.recentPartialFillCount > 0 ? "#B45309" : COLORS.dim },
          { label: "최근 lifecycle 경고", value: state.summary.recentLifecycleRiskCount, tone: state.summary.recentLifecycleRiskCount > 0 ? "#DC2626" : COLORS.dim },
          { label: "최근 수동주문", value: state.summary.recentManualOrderCount, tone: state.summary.recentManualOrderCount > 0 ? "#1D4ED8" : COLORS.dim },
          { label: "최근 주문실패", value: state.summary.recentOrderFailureCount, tone: state.summary.recentOrderFailureCount > 0 ? "#DC2626" : COLORS.dim },
        ].map((item) => {
          const action = resolveSummaryAction(item.label);
          return (
          <button
            key={item.label}
            type="button"
            onClick={() => action?.anchor && navigateToSection(action.path, action.anchor)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: COLORS.sub,
              border: `1px solid ${COLORS.line}`,
              textAlign: "left",
              cursor: action ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 10, color: COLORS.dim }}>{item.label}</div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: item.tone }}>{item.value}</div>
            {action && <div style={{ marginTop: 4, fontSize: 10, color: COLORS.mid }}>{action.hint}</div>}
          </button>
        )})}
      </div>

      {state.summary.brokerMismatchCount > 0 && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#B91C1C", textTransform: "uppercase", letterSpacing: "0.05em" }}>리컨실 필요</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: "#991B1B" }}>
                브로커-DB 불일치 {state.summary.brokerMismatchCount}건
              </div>
            </div>
            <ActionLinkChip
              label="리컨실 이동"
              onClick={() => navigateToSection("/settings", "reconcile-section")}
              tone="warn"
            />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {state.summary.brokerMissingInDbCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 999, padding: "2px 8px" }}>
                DB복구 {state.summary.brokerMissingInDbCount}건
              </span>
            )}
            {state.summary.brokerQtyAdjustmentCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 999, padding: "2px 8px" }}>
                수량보정 {state.summary.brokerQtyAdjustmentCount}건
              </span>
            )}
            {state.summary.brokerOrphanedClosureCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 999, padding: "2px 8px" }}>
                고아정리 {state.summary.brokerOrphanedClosureCount}건
              </span>
            )}
          </div>
        </div>
      )}

      {(state.summary.pendingOrderStaleCount > 0
        || state.summary.recentLifecycleRiskCount > 0
        || state.summary.recentOrderFailureCount > 0
        || state.summary.recentManualOrderCount > 0
        || state.summary.pendingSignalCount > 0) && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>바로가기</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(state.summary.pendingOrderStaleCount > 0 || state.summary.recentLifecycleRiskCount > 0 || state.summary.recentManualOrderCount > 0) && (
              <button
                type="button"
                onClick={() => navigateToSection("/stats", "order-timeline-section")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${COLORS.line}`,
                  background: "#FFFFFF",
                  color: COLORS.mid,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                통계 {" > "} 주문 타임라인
              </button>
            )}
            {state.summary.recentOrderFailureCount > 0 && (
              <button
                type="button"
                onClick={() => navigateToSection("/stats", "engine-log-section")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${COLORS.line}`,
                  background: "#FFFFFF",
                  color: COLORS.mid,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                통계 {" > "} 엔진 로그
              </button>
            )}
            {(state.summary.pendingOrderStaleCount > 0 || state.summary.pendingSignalCount > 0) && (
              <button
                type="button"
                onClick={() => navigateToSection("/settings", "preflight-section")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${COLORS.line}`,
                  background: "#FFFFFF",
                  color: COLORS.mid,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                설정 {" > "} 프리플라이트
              </button>
            )}
            {state.summary.openPositionCount > 0 && (
              <button
                type="button"
                onClick={() => navigateToSection("/settings", "reconcile-section")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${COLORS.line}`,
                  background: "#FFFFFF",
                  color: COLORS.mid,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                설정 {" > "} 포지션 리컨실
              </button>
            )}
          </div>
        </div>
      )}

      {state.runtime.alerts.length > 0 && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em" }}>운영 경고</div>
            {state.runtime.alertPriority && (
              <span style={{ fontSize: 10, fontWeight: 800, color: state.runtime.alertPriority === "P1" ? "#B91C1C" : state.runtime.alertPriority === "P2" ? "#B45309" : "#1D4ED8" }}>
                {state.runtime.alertPriority}
              </span>
            )}
          </div>
          {state.runtime.alertHeadline && (
            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#92400E" }}>
              최우선: {state.runtime.alertHeadline}
            </div>
          )}
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {state.runtime.alerts.slice(0, 3).map((alert) => (
              <div key={alert} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                {(() => {
                  const action = resolveAlertAction(alert);
                  return (
                    <>
                <span style={{ fontSize: 11, color: "#92400E" }}>{alert}</span>
                <ActionLinkChip
                  label={action.label ?? "이동"}
                  onClick={() => action.anchor && navigateToSection(action.path, action.anchor)}
                  tone="warn"
                />
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.recentEvents.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {state.recentEvents.slice(0, 5).map((event) => (
            <div key={event.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: COLORS.mid }}>{describeEvent(event)}</span>
              <span style={{ fontSize: 10, color: COLORS.dim, whiteSpace: "nowrap" }}>{fmtKst(event.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (collapsible) {
    return (
      <details
        open={defaultOpen}
        style={{ margin: "10px 20px 0", borderRadius: 12, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}
      >
        <summary
          style={{
            listStyle: "none",
            cursor: "pointer",
            padding: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>엔진 상태</span>
          <span style={{ fontSize: 11, color: COLORS.dim }}>최근 이벤트 {state.recentEvents.length}건</span>
        </summary>
        <div style={{ padding: "0 14px 14px" }}>
          {content}
        </div>
      </details>
    );
  }

  return (
    <div style={{ margin: "10px 20px 0", padding: "14px", borderRadius: 12, background: "#FFF", border: `1px solid ${COLORS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>엔진 상태</span>
        <span style={{ fontSize: 11, color: COLORS.dim }}>최근 이벤트 {state.recentEvents.length}건</span>
      </div>
      {content}
    </div>
  );
}
