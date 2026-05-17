"use client";

import { COLORS } from "@/lib/constants";
import { ActionLinkChip } from "@/components/common/action-link-chip";
import { formatRuntimeContextLine } from "@/lib/nexio-display";
import { resolvePreflightCheckAction } from "@/lib/navigation/nexio-actions";

interface PreflightCheck {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  impact?: "advisory" | "ops_blocker" | "trading_blocker";
  blocksTrading?: boolean;
  metadata?: {
    criteria?: Array<{ label: string; value: string }>;
    missingInDbCount?: number;
    qtyAdjustmentCount?: number;
    orphanedClosureCount?: number;
  };
}

interface PreflightState {
  status: "pass" | "warn" | "fail";
  runtimeContext?: {
    brokerId?: string | null;
    brokerLabel?: string | null;
    environment: "dev" | "paper" | "prod";
    runtimeMode: string;
    activeProfileId: string | null;
    activeProfileLabel: string | null;
    activeSource: "db" | "env" | null;
    activeAccountMask: string | null;
  };
  readiness?: {
    autoTradingReady: boolean;
    livePromotionReady: boolean;
    blockingCount: number;
    advisoryWarnCount: number;
  };
  checks: PreflightCheck[];
}

interface ReconcilePreview {
  mismatchCount: number;
  mismatches: {
    missingInDb: Array<{ code: string; name: string; brokerQty: number }>;
    qtyMismatch: Array<{ code: string; name: string; brokerQty: number; dbQty: number }>;
    orphanedDb: Array<{ code: string; name: string; dbQty: number }>;
  };
}

interface PnlAuditPreview {
  mismatchCount: number;
  matchedCount: number;
  closedPositionCount: number;
  closedTradeMemoryCount: number;
  mismatches: Array<{
    kind: string;
    code: string;
    name: string;
    positionValue?: number | string | null;
    tradeMemoryValue?: number | string | null;
  }>;
}

interface RehearsalState {
  items: Array<{ key: string; label: string; checked: boolean; checkedAt: string | null }>;
  summary: { totalCount: number; completedCount: number; remainingCount: number; completed: boolean };
}

interface ActionItem {
  tone: "block" | "warn";
  label: string;
  path?: string;
  detail?: string;
  location?: string;
  anchor?: string;
  buttonLabel?: string;
}

interface OperationsHealthSectionsProps {
  preflight: PreflightState | null;
  preflightLoading: boolean;
  preflightResult: string | null;
  actionItems: ActionItem[];
  reconcileLoading: boolean;
  reconcileRunning: boolean;
  reconcileResult: string | null;
  reconcilePreview: ReconcilePreview | null;
  pnlAuditLoading: boolean;
  pnlAuditResult: string | null;
  pnlAuditPreview: PnlAuditPreview | null;
  rehearsalLoading: boolean;
  rehearsalSaving: boolean;
  rehearsalResult: string | null;
  rehearsal: RehearsalState | null;
  onLoadPreflight: () => void;
  onJumpToSection: (path: string, anchor?: string) => void;
  onLoadReconcilePreview: () => void;
  onRunReconcile: () => void;
  onLoadPnlAuditPreview: () => void;
  onLoadRehearsalChecklist: () => void;
  onToggleRehearsalItem: (key: string, checked: boolean) => void;
  summarizeBrokerReconcilePlan: (check: PreflightCheck) => Array<{ label: string; count: number }>;
}

export function OperationsHealthSections({
  preflight,
  preflightLoading,
  preflightResult,
  actionItems,
  reconcileLoading,
  reconcileRunning,
  reconcileResult,
  reconcilePreview,
  pnlAuditLoading,
  pnlAuditResult,
  pnlAuditPreview,
  rehearsalLoading,
  rehearsalSaving,
  rehearsalResult,
  rehearsal,
  onLoadPreflight,
  onJumpToSection,
  onLoadReconcilePreview,
  onRunReconcile,
  onLoadPnlAuditPreview,
  onLoadRehearsalChecklist,
  onToggleRehearsalItem,
  summarizeBrokerReconcilePlan,
}: OperationsHealthSectionsProps) {
  const tradingBlockers = (preflight?.checks ?? []).filter((check) => check.impact === "trading_blocker");
  const opsBlockers = (preflight?.checks ?? []).filter((check) => check.impact === "ops_blocker");
  const advisoryChecks = (preflight?.checks ?? []).filter((check) => check.impact === "advisory" && check.status === "warn");

  const impactMeta = (check: PreflightCheck) => {
    if (check.impact === "trading_blocker") {
      return { label: "거래 차단", color: "#991B1B", background: "#FEE2E2" };
    }
    if (check.impact === "ops_blocker") {
      return { label: "운영 차단", color: "#9A3412", background: "#FED7AA" };
    }
    return { label: "주의", color: "#92400E", background: "#FEF3C7" };
  };

  return (
    <>
      <div id="preflight-section" style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>운영 프리플라이트</span>
        <span style={{ fontSize: 10, color: preflight?.status === "fail" ? "#DC2626" : preflight?.status === "warn" ? "#D97706" : COLORS.dim }}>
          {preflightLoading ? "확인 중..." : preflight?.status === "fail" ? "실행 금지" : preflight?.status === "warn" ? "주의 필요" : "통과"}
        </span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>실자금/소액 리허설 시작 전 핵심 상태를 한 번에 점검합니다.</div>
          {preflight?.readiness && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <div style={{ borderRadius: 10, padding: "10px 12px", background: preflight.readiness.autoTradingReady ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${preflight.readiness.autoTradingReady ? "#BBF7D0" : "#FECACA"}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>자동매매 준비</div>
                <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: preflight.readiness.autoTradingReady ? "#15803D" : "#DC2626" }}>{preflight.readiness.autoTradingReady ? "가능" : "차단"}</div>
              </div>
              <div style={{ borderRadius: 10, padding: "10px 12px", background: preflight.readiness.livePromotionReady ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${preflight.readiness.livePromotionReady ? "#BBF7D0" : "#FDE68A"}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>실전 승격</div>
                <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: preflight.readiness.livePromotionReady ? "#15803D" : "#B45309" }}>{preflight.readiness.livePromotionReady ? "가능" : "보류"}</div>
              </div>
            </div>
          )}
          {preflight?.runtimeContext && (
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>현재 실행 기준</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: COLORS.ink }}>
                {formatRuntimeContextLine({
                  brokerLabel: preflight.runtimeContext.brokerLabel,
                  environment: preflight.runtimeContext.environment,
                  runtimeMode: preflight.runtimeContext.runtimeMode,
                  profileLabel: preflight.runtimeContext.activeProfileLabel,
                  accountMask: preflight.runtimeContext.activeAccountMask,
                  source: preflight.runtimeContext.activeSource,
                })}
              </div>
            </div>
          )}
          {preflight?.readiness && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.mid }}>차단 항목 {preflight.readiness.blockingCount}건 · 운영 경고 {preflight.readiness.advisoryWarnCount}건</div>}
          {preflight && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              <div style={{ borderRadius: 10, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>거래 차단</div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: "#B91C1C" }}>
                  {tradingBlockers.filter((check) => check.status !== "pass").length}건
                </div>
              </div>
              <div style={{ borderRadius: 10, padding: "10px 12px", background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>운영 차단</div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: "#C2410C" }}>
                  {opsBlockers.filter((check) => check.status !== "pass").length}건
                </div>
              </div>
              <div style={{ borderRadius: 10, padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>주의</div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: "#A16207" }}>
                  {advisoryChecks.length}건
                </div>
              </div>
            </div>
          )}
          {preflight && (tradingBlockers.some((check) => check.status !== "pass") || opsBlockers.some((check) => check.status !== "pass")) && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>즉시 확인할 차단 사유</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {tradingBlockers.filter((check) => check.status !== "pass").slice(0, 3).map((check) => (
                  <div key={`block-${check.key}`} style={{ fontSize: 11, color: COLORS.ink, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: "#B91C1C" }}>[거래 차단]</span> {check.label} · {check.detail}
                  </div>
                ))}
                {opsBlockers.filter((check) => check.status !== "pass").slice(0, 3).map((check) => (
                  <div key={`ops-${check.key}`} style={{ fontSize: 11, color: COLORS.ink, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: "#C2410C" }}>[운영 차단]</span> {check.label} · {check.detail}
                  </div>
                ))}
              </div>
            </div>
          )}
          {actionItems.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C2410C" }}>지금 할 일</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {actionItems.map((item, index) => (
                  <div key={`${item.tone}-${item.label}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ marginTop: 2, fontSize: 9, fontWeight: 800, color: item.tone === "block" ? "#FFFFFF" : "#9A3412", background: item.tone === "block" ? "#DC2626" : "#FED7AA", borderRadius: 999, padding: "2px 6px", whiteSpace: "nowrap" }}>
                      {item.tone === "block" ? "우선" : "점검"} {index + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{item.label}</div>
                      <div style={{ marginTop: 2, fontSize: 11, color: COLORS.mid }}>{item.detail}</div>
                      <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: COLORS.dim }}>{item.location}</span>
                        {(item.path || item.anchor) && (
                          <ActionLinkChip
                            label={item.buttonLabel ?? "여기로 이동"}
                            onClick={() => onJumpToSection(item.path ?? "/settings", item.anchor)}
                            tone="warn"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {preflight && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {preflight.checks.map((check) => {
                const action = resolvePreflightCheckAction(check);
                return (
                  <div key={check.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{check.label}</div>
                        <span style={{ fontSize: 9, fontWeight: 800, color: impactMeta(check).color, background: impactMeta(check).background, borderRadius: 999, padding: "2px 6px" }}>
                          {impactMeta(check).label}
                        </span>
                        {check.blocksTrading && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 999, padding: "2px 6px" }}>차단</span>}
                        {!check.blocksTrading && check.status === "warn" && <span style={{ fontSize: 9, fontWeight: 800, color: "#92400E", background: "#FEF3C7", borderRadius: 999, padding: "2px 6px" }}>운영 경고</span>}
                        {check.status === "pass" && <span style={{ fontSize: 9, fontWeight: 800, color: "#166534", background: "#DCFCE7", borderRadius: 999, padding: "2px 6px" }}>통과</span>}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.mid, marginTop: 2 }}>{check.detail}</div>
                      {(check.metadata?.criteria?.length ?? 0) > 0 && (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {check.metadata?.criteria?.map((item) => (
                            <span
                              key={`${check.key}-${item.label}`}
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: COLORS.mid,
                                background: "#F8FAFC",
                                border: `1px solid ${COLORS.line}`,
                                borderRadius: 999,
                                padding: "2px 8px",
                              }}
                            >
                              {item.label} {item.value}
                            </span>
                          ))}
                        </div>
                      )}
                      {summarizeBrokerReconcilePlan(check).length > 0 && (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {summarizeBrokerReconcilePlan(check).map((item) => (
                            <span key={`${check.key}-${item.label}`} style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 999, padding: "2px 8px" }}>
                              {item.label} {item.count}건
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: COLORS.dim }}>{action.location}</span>
                        {(action.path || action.anchor) && (
                          <ActionLinkChip
                            label={action.buttonLabel ?? "이동"}
                            onClick={() => onJumpToSection(action.path ?? "/settings", action.anchor)}
                          />
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: check.status === "fail" ? "#DC2626" : check.status === "warn" ? "#D97706" : "#15803D", whiteSpace: "nowrap" }}>
                      {check.status === "fail" ? "FAIL" : check.status === "warn" ? "WARN" : "PASS"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button onClick={onLoadPreflight} disabled={preflightLoading} style={{ padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: preflightLoading ? 0.5 : 1 }}>
          {preflightLoading ? "조회 중..." : "프리플라이트 새로고침"}
        </button>

        {preflightResult && <div style={{ borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{preflightResult}</div>}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div id="reconcile-section" style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>포지션 리컨실</span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>{reconcileLoading ? "확인 중..." : `불일치 ${reconcilePreview?.mismatchCount ?? 0}건`}</span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>브로커 실보유와 DB 오픈 포지션 차이를 미리 확인합니다. 엔진 실행 중에는 조회/실행이 막힙니다.</div>
          {reconcilePreview && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: COLORS.ink }}>DB 누락 보유: {reconcilePreview.mismatches.missingInDb.length}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>수량 불일치: {reconcilePreview.mismatches.qtyMismatch.length}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>고아 DB 포지션: {reconcilePreview.mismatches.orphanedDb.length}건</div>
              {reconcilePreview.mismatches.qtyMismatch.slice(0, 2).map((item) => <div key={`qty-${item.code}`} style={{ fontSize: 11, color: COLORS.mid }}>{item.name} ({item.code}) · 브로커 {item.brokerQty}주 / DB {item.dbQty}주</div>)}
              {reconcilePreview.mismatches.orphanedDb.slice(0, 2).map((item) => <div key={`orphan-${item.code}`} style={{ fontSize: 11, color: COLORS.mid }}>{item.name} ({item.code}) · DB만 {item.dbQty}주</div>)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onLoadReconcilePreview} disabled={reconcileLoading || reconcileRunning} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: reconcileLoading || reconcileRunning ? 0.5 : 1 }}>
            {reconcileLoading ? "조회 중..." : "미리보기 새로고침"}
          </button>
          <button onClick={onRunReconcile} disabled={reconcileLoading || reconcileRunning} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: COLORS.ink, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: reconcileLoading || reconcileRunning ? 0.5 : 1 }}>
            {reconcileRunning ? "실행 중..." : "리컨실 실행"}
          </button>
        </div>

        {reconcileResult && <div style={{ borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500, background: reconcileResult.includes("완료") ? "#F0FDF4" : "#FEF2F2", color: reconcileResult.includes("완료") ? "#16A34A" : "#DC2626", border: `1px solid ${reconcileResult.includes("완료") ? "#BBF7D0" : "#FECACA"}` }}>{reconcileResult}</div>}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>손익 대사</span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>{pnlAuditLoading ? "확인 중..." : `불일치 ${pnlAuditPreview?.mismatchCount ?? 0}건`}</span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>최근 14일 기준으로 `positions` 종료 손익과 `trade_memory` 종료 손익을 비교합니다.</div>
          {pnlAuditPreview && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: COLORS.ink }}>종료 포지션: {pnlAuditPreview.closedPositionCount}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>종료 trade_memory: {pnlAuditPreview.closedTradeMemoryCount}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>정상 매칭: {pnlAuditPreview.matchedCount}건</div>
              {pnlAuditPreview.mismatches.slice(0, 3).map((item, index) => <div key={`${item.kind}-${item.code}-${index}`} style={{ fontSize: 11, color: COLORS.mid }}>{item.name} ({item.code}) · {item.kind}{item.positionValue !== undefined || item.tradeMemoryValue !== undefined ? ` · pos ${String(item.positionValue ?? "-")} / mem ${String(item.tradeMemoryValue ?? "-")}` : ""}</div>)}
            </div>
          )}
        </div>

        <button onClick={onLoadPnlAuditPreview} disabled={pnlAuditLoading} style={{ padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: pnlAuditLoading ? 0.5 : 1 }}>
          {pnlAuditLoading ? "조회 중..." : "손익 대사 새로고침"}
        </button>

        {pnlAuditResult && <div style={{ borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{pnlAuditResult}</div>}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div id="rehearsal-section" style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>리허설 추적</span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>{rehearsalLoading ? "확인 중..." : `${rehearsal?.summary.completedCount ?? 0}/${rehearsal?.summary.totalCount ?? 0} 완료`}</span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>소액 실거래 또는 모의투자 리허설 항목을 체크합니다. 프리플라이트와 연결됩니다.</div>
          {rehearsal && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {rehearsal.items.map((item) => (
                <label key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: rehearsalSaving ? "default" : "pointer" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: COLORS.mid }}>{item.checkedAt ? `완료 시각 ${item.checkedAt}` : "미완료"}</div>
                  </div>
                  <input type="checkbox" checked={item.checked} disabled={rehearsalSaving} onChange={(e) => onToggleRehearsalItem(item.key, e.target.checked)} />
                </label>
              ))}
            </div>
          )}
        </div>

        <button onClick={onLoadRehearsalChecklist} disabled={rehearsalLoading || rehearsalSaving} style={{ padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: rehearsalLoading || rehearsalSaving ? 0.5 : 1 }}>
          {rehearsalLoading ? "조회 중..." : rehearsalSaving ? "저장 중..." : "리허설 상태 새로고침"}
        </button>

        {rehearsalResult && <div style={{ borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{rehearsalResult}</div>}
      </div>
    </>
  );
}
