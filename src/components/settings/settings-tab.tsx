"use client";

import { useCallback, useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { EngineControlSection } from "@/components/settings/engine-control-section";
import { BrokerSettingsSection } from "@/components/settings/broker-settings-section";
import { OperationsHealthSections } from "@/components/settings/operations-health-sections";
import { summarizePreflightAction } from "@/lib/navigation/nexio-actions";
import { highlightSectionFromHash, scrollToSection } from "@/lib/navigation/section-nav";
import { useBrokerSettingsState } from "@/components/settings/use-broker-settings-state";

export function SettingsTab() {
  const setKISConfig = useAppStore((s) => s.setKISConfig);
  const {
    activeBrokerId,
    brokerDirectory,
    brokerLoading,
    brokerSaving,
    brokerResult,
    profiles,
    setActiveBrokerId,
    updateBrokerEntry,
    loadBrokerDirectory,
    saveBrokerDirectory,
    updateProfile,
    loadKisProfile,
    handleSave,
    handleTest,
    handleResetDbConfig,
  } = useBrokerSettingsState(setKISConfig);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileRunning, setReconcileRunning] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [reconcilePreview, setReconcilePreview] = useState<{
    mismatchCount: number;
    mismatches: {
      missingInDb: Array<{ code: string; name: string; brokerQty: number }>;
      qtyMismatch: Array<{ code: string; name: string; brokerQty: number; dbQty: number }>;
      orphanedDb: Array<{ code: string; name: string; dbQty: number }>;
    };
  } | null>(null);
  const [pnlAuditLoading, setPnlAuditLoading] = useState(false);
  const [pnlAuditResult, setPnlAuditResult] = useState<string | null>(null);
  const [pnlAuditPreview, setPnlAuditPreview] = useState<{
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
  } | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<{
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
    checks: Array<{
      key: string;
      label: string;
      status: "pass" | "warn" | "fail";
      detail: string;
      impact?: "advisory" | "ops_blocker" | "trading_blocker";
      blocksTrading?: boolean;
      metadata?: {
        missingInDbCount?: number;
        qtyAdjustmentCount?: number;
        orphanedClosureCount?: number;
      };
    }>;
  } | null>(null);
  const [rehearsalLoading, setRehearsalLoading] = useState(false);
  const [rehearsalSaving, setRehearsalSaving] = useState(false);
  const [rehearsalResult, setRehearsalResult] = useState<string | null>(null);
  const [rehearsal, setRehearsal] = useState<{
    items: Array<{ key: string; label: string; checked: boolean; checkedAt: string | null }>;
    summary: { totalCount: number; completedCount: number; remainingCount: number; completed: boolean };
  } | null>(null);

  const blockingChecks = (preflight?.checks ?? []).filter((check) => check.blocksTrading);
  const advisoryChecks = (preflight?.checks ?? []).filter((check) => !check.blocksTrading && check.status === "warn");
  const actionItems = [
    ...blockingChecks.map((check) => ({
      tone: "block" as const,
      label: check.label,
      ...summarizePreflightAction(check),
    })),
    ...advisoryChecks.slice(0, 4).map((check) => ({
      tone: "warn" as const,
      label: check.label,
      ...summarizePreflightAction(check),
    })),
  ].slice(0, 6);

  const summarizeBrokerReconcilePlan = useCallback((check: NonNullable<typeof preflight>["checks"][number]) => {
    if (check.key !== "broker_reconcile" || !check.metadata) return [];
    const items = [
      { label: "DB복구", count: check.metadata.missingInDbCount ?? 0 },
      { label: "수량보정", count: check.metadata.qtyAdjustmentCount ?? 0 },
      { label: "고아정리", count: check.metadata.orphanedClosureCount ?? 0 },
    ];
    return items.filter((item) => item.count > 0);
  }, []);

  const jumpToSection = useCallback((anchor: string) => {
    scrollToSection(anchor);
  }, []);

  const loadReconcilePreview = async () => {
    setReconcileLoading(true);
    setReconcileResult(null);
    try {
      const res = await fetch("/api/positions/reconcile");
      const data = await res.json();
      if (!res.ok) {
        setReconcilePreview(null);
        setReconcileResult(data.error ?? "리컨실 미리보기 실패");
        return;
      }
      setReconcilePreview({
        mismatchCount: data.mismatchCount ?? 0,
        mismatches: data.mismatches ?? { missingInDb: [], qtyMismatch: [], orphanedDb: [] },
      });
    } catch {
      setReconcileResult("리컨실 미리보기 네트워크 오류");
    } finally {
      setReconcileLoading(false);
    }
  };

  const runReconcile = async () => {
    setReconcileRunning(true);
    setReconcileResult(null);
    try {
      const res = await fetch("/api/positions/reconcile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setReconcileResult(data.error ?? "리컨실 실행 실패");
        return;
      }
      setReconcileResult(
        `리컨실 완료 · 복구 ${data.restoredCount ?? 0}건 · 수량보정 ${data.qtyAdjustedCount ?? 0}건 · 고아정리 ${data.orphanedClosedCount ?? 0}건`,
      );
      await loadReconcilePreview();
    } catch {
      setReconcileResult("리컨실 실행 네트워크 오류");
    } finally {
      setReconcileRunning(false);
    }
  };

  const loadPnlAuditPreview = async () => {
    setPnlAuditLoading(true);
    setPnlAuditResult(null);
    try {
      const res = await fetch("/api/pnl-audit?days=14");
      const data = await res.json();
      if (!res.ok) {
        setPnlAuditPreview(null);
        setPnlAuditResult(data.error ?? "손익 대사 조회 실패");
        return;
      }
      setPnlAuditPreview({
        mismatchCount: data.mismatchCount ?? 0,
        matchedCount: data.matchedCount ?? 0,
        closedPositionCount: data.closedPositionCount ?? 0,
        closedTradeMemoryCount: data.closedTradeMemoryCount ?? 0,
        mismatches: data.mismatches ?? [],
      });
    } catch {
      setPnlAuditResult("손익 대사 네트워크 오류");
    } finally {
      setPnlAuditLoading(false);
    }
  };

  const loadPreflight = async () => {
    setPreflightLoading(true);
    setPreflightResult(null);
    try {
      const res = await fetch("/api/preflight");
      const data = await res.json();
      if (!res.ok) {
        setPreflight(null);
        setPreflightResult(data.error ?? "프리플라이트 조회 실패");
        return;
      }
      setPreflight({
        status: data.status ?? "fail",
        runtimeContext: data.runtimeContext ?? undefined,
        readiness: data.readiness ?? undefined,
        checks: Array.isArray(data.checks) ? data.checks : [],
      });
    } catch {
      setPreflightResult("프리플라이트 네트워크 오류");
    } finally {
      setPreflightLoading(false);
    }
  };

  const loadRehearsalChecklist = async () => {
    setRehearsalLoading(true);
    setRehearsalResult(null);
    try {
      const res = await fetch("/api/rehearsal-checklist");
      const data = await res.json();
      if (!res.ok) {
        setRehearsal(null);
        setRehearsalResult(data.error ?? "리허설 체크리스트 조회 실패");
        return;
      }
      setRehearsal({
        items: Array.isArray(data.items) ? data.items : [],
        summary: data.summary,
      });
    } catch {
      setRehearsalResult("리허설 체크리스트 네트워크 오류");
    } finally {
      setRehearsalLoading(false);
    }
  };

  const toggleRehearsalItem = async (key: string, checked: boolean) => {
    setRehearsalSaving(true);
    setRehearsalResult(null);
    try {
      const res = await fetch("/api/rehearsal-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ key, checked }] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRehearsalResult(data.error ?? "리허설 체크리스트 저장 실패");
        return;
      }
      setRehearsal({
        items: Array.isArray(data.items) ? data.items : [],
        summary: data.summary,
      });
      await loadPreflight();
    } catch {
      setRehearsalResult("리허설 체크리스트 네트워크 오류");
    } finally {
      setRehearsalSaving(false);
    }
  };

  useEffect(() => {
    void loadBrokerDirectory();
    void loadKisProfile("default");
    void loadKisProfile("kr");
    void loadKisProfile("us");
    loadReconcilePreview().catch(() => {});
    loadPnlAuditPreview().catch(() => {});
    loadPreflight().catch(() => {});
    loadRehearsalChecklist().catch(() => {});
  }, [loadBrokerDirectory, loadKisProfile]);

  useEffect(() => {
    highlightSectionFromHash();
  }, []);

  return (
    <div>
      <BrokerSettingsSection
        activeBrokerId={activeBrokerId}
        brokerDirectory={brokerDirectory}
        brokerLoading={brokerLoading}
        brokerSaving={brokerSaving}
        brokerResult={brokerResult}
        profiles={profiles}
        onSelectBroker={setActiveBrokerId}
        onUpdateBrokerEntry={updateBrokerEntry}
        onSaveBrokerDirectory={saveBrokerDirectory}
        onUpdateProfile={updateProfile}
        onSaveProfile={handleSave}
        onTestProfile={handleTest}
        onResetProfile={handleResetDbConfig}
      />

      {/* 엔진 제어 */}
      <div id="engine-control-section" style={{ scrollMarginTop: 16 }}>
        <EngineControlSection />
      </div>
      <OperationsHealthSections
        preflight={preflight}
        preflightLoading={preflightLoading}
        preflightResult={preflightResult}
        actionItems={actionItems}
        reconcileLoading={reconcileLoading}
        reconcileRunning={reconcileRunning}
        reconcileResult={reconcileResult}
        reconcilePreview={reconcilePreview}
        pnlAuditLoading={pnlAuditLoading}
        pnlAuditResult={pnlAuditResult}
        pnlAuditPreview={pnlAuditPreview}
        rehearsalLoading={rehearsalLoading}
        rehearsalSaving={rehearsalSaving}
        rehearsalResult={rehearsalResult}
        rehearsal={rehearsal}
        onLoadPreflight={() => { loadPreflight().catch(() => {}); }}
        onJumpToSection={jumpToSection}
        onLoadReconcilePreview={() => { loadReconcilePreview().catch(() => {}); }}
        onRunReconcile={() => { runReconcile().catch(() => {}); }}
        onLoadPnlAuditPreview={() => { loadPnlAuditPreview().catch(() => {}); }}
        onLoadRehearsalChecklist={() => { loadRehearsalChecklist().catch(() => {}); }}
        onToggleRehearsalItem={(key, checked) => { toggleRehearsalItem(key, checked).catch(() => {}); }}
        summarizeBrokerReconcilePlan={summarizeBrokerReconcilePlan}
      />

      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>NEXIO v2.4 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
