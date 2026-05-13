"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { ActionLinkChip } from "@/components/common/action-link-chip";
import { resolvePreflightCheckAction, summarizePreflightAction } from "@/lib/navigation/nexio-actions";
import { navigateToSection } from "@/lib/navigation/section-nav";

type CheckStatus = "pass" | "warn" | "fail";

type PreflightCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  impact?: "advisory" | "ops_blocker" | "trading_blocker";
  blocksTrading?: boolean;
};

type PreflightResponse = {
  status: CheckStatus;
  readiness?: {
    autoTradingReady: boolean;
    livePromotionReady: boolean;
    blockingCount: number;
    advisoryWarnCount: number;
  };
  runtimeContext?: {
    environment: "dev" | "paper" | "prod";
    runtimeMode: string;
    activeProfileLabel: string | null;
    activeAccountMask: string | null;
    activeSource: "db" | "env" | null;
  };
  checks: PreflightCheck[];
};

const STATUS_META: Record<CheckStatus, { label: string; bg: string; border: string; text: string }> = {
  pass: { label: "운영 가능", bg: "#F0FDF4", border: "#BBF7D0", text: "#15803D" },
  warn: { label: "주의 필요", bg: "#FFFBEB", border: "#FDE68A", text: "#B45309" },
  fail: { label: "실행 금지", bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" },
};

function getPriority(check: PreflightCheck) {
  if (check.blocksTrading && check.status === "fail") return 0;
  if (check.blocksTrading) return 1;
  if (check.status === "warn" && check.impact === "ops_blocker") return 2;
  if (check.status === "warn") return 3;
  return 4;
}

export function PreflightStatusCard() {
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/preflight")
      .then(async (res) => {
        if (!res.ok) throw new Error(`preflight ${res.status}`);
        return res.json() as Promise<PreflightResponse>;
      })
      .then((data) => {
        if (!cancelled) setPreflight(data);
      })
      .catch(() => {
        if (!cancelled) setPreflight(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!preflight) return null;

  const meta = STATUS_META[preflight.status];
  const readiness = preflight.readiness;
  const actionChecks = [...(preflight.checks ?? [])]
    .sort((a, b) => getPriority(a) - getPriority(b))
    .filter((check) => check.status !== "pass")
    .slice(0, 6);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "5px 9px",
          borderRadius: 999,
          border: `1px solid ${meta.border}`,
          background: "#FFFFFF",
          color: meta.text,
          fontSize: 10,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        프리플라이트
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(10, 10, 10, 0.46)",
            padding: "20px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "min(82vh, 760px)",
              overflowY: "auto",
              borderRadius: 16,
              background: "#FFFFFF",
              border: `1px solid ${COLORS.line}`,
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.24)",
            }}
          >
            <div style={{ position: "sticky", top: 0, zIndex: 1, padding: "16px 16px 12px", background: "#FFFFFF", borderBottom: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: meta.text, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    프리플라이트
                  </div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: meta.text }}>
                    {meta.label}
                  </div>
                  {preflight.runtimeContext && (
                    <div style={{ marginTop: 6, fontSize: 11, color: COLORS.mid, lineHeight: 1.5 }}>
                      {String(preflight.runtimeContext.environment).toUpperCase()} · {preflight.runtimeContext.runtimeMode === "paper" ? "모의투자" : preflight.runtimeContext.runtimeMode}
                      {preflight.runtimeContext.activeProfileLabel ? ` · ${preflight.runtimeContext.activeProfileLabel}` : ""}
                      {preflight.runtimeContext.activeAccountMask ? ` · ${preflight.runtimeContext.activeAccountMask}` : ""}
                      {preflight.runtimeContext.activeSource ? ` · ${preflight.runtimeContext.activeSource}` : ""}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    border: `1px solid ${COLORS.line}`,
                    background: "#FFF",
                    color: COLORS.mid,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: "14px 16px 16px" }}>
              {readiness && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ padding: "10px 12px", borderRadius: 10, background: readiness.autoTradingReady ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${readiness.autoTradingReady ? "#BBF7D0" : "#FECACA"}` }}>
                      <div style={{ fontSize: 10, color: COLORS.dim }}>자동매매</div>
                      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: readiness.autoTradingReady ? "#15803D" : "#DC2626" }}>
                        {readiness.autoTradingReady ? "가능" : "차단"}
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px", borderRadius: 10, background: readiness.livePromotionReady ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${readiness.livePromotionReady ? "#BBF7D0" : "#FDE68A"}` }}>
                      <div style={{ fontSize: 10, color: COLORS.dim }}>실전 승격</div>
                      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: readiness.livePromotionReady ? "#15803D" : "#B45309" }}>
                        {readiness.livePromotionReady ? "가능" : "보류"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: readiness.blockingCount > 0 ? "#DC2626" : "#15803D" }}>
                      차단 {readiness.blockingCount}건
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>·</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: readiness.advisoryWarnCount > 0 ? "#B45309" : COLORS.dim }}>
                      운영 경고 {readiness.advisoryWarnCount}건
                    </span>
                  </div>
                </>
              )}

              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                {(actionChecks.length > 0 ? actionChecks : preflight.checks).map((check) => {
                  const summary = summarizePreflightAction(check);
                  const action = resolvePreflightCheckAction(check);
                  return (
                    <div
                      key={check.key}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: check.status === "fail" ? "#FEF2F2" : check.status === "warn" ? "#FFFBEB" : "#F8FAFC",
                        border: `1px solid ${check.status === "fail" ? "#FECACA" : check.status === "warn" ? "#FDE68A" : COLORS.line}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.ink }}>{check.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, color: check.status === "fail" ? "#DC2626" : check.status === "warn" ? "#B45309" : "#15803D" }}>
                              {check.status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: COLORS.mid, lineHeight: 1.5 }}>
                            {summary.detail}
                          </div>
                        </div>
                        {action.anchor && (
                          <ActionLinkChip
                            label={action.buttonLabel ?? "이동"}
                            onClick={() => navigateToSection(action.path, action.anchor!)}
                            tone={check.blocksTrading ? "warn" : "accent"}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <ActionLinkChip label="설정 상세" onClick={() => navigateToSection("/settings", "preflight-section")} tone={preflight.status === "pass" ? "accent" : "warn"} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.line}`,
                    background: "#FFF",
                    color: COLORS.ink,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
