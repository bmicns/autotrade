"use client";

import { useCallback, useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { EngineControlSection } from "@/components/settings/engine-control-section";
import { ActionLinkChip } from "@/components/common/action-link-chip";
import { normalizeKisAccountInput } from "@/lib/kis/account";
import { resolvePreflightCheckAction, summarizePreflightAction } from "@/lib/navigation/nexio-actions";
import { highlightSectionFromHash, scrollToSection } from "@/lib/navigation/section-nav";
import { KIS_RUNTIME_MODE } from "@/lib/constants";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`, background: COLORS.sub,
  color: COLORS.ink, fontSize: 14, fontFamily: "inherit", outline: "none", letterSpacing: "normal",
};

type KISProfileId = "default" | "kr" | "us";

interface KISProfileState {
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountProductCode: string;
  token?: string;
  tokenExpiry?: string;
  source?: "env" | "db" | null;
  runtimeMode?: string;
  apiBaseUrl?: string;
  hasEnvConfig?: boolean;
  hasDbConfig?: boolean;
  saved: boolean;
  testing: boolean;
  testResult: string | null;
  loading: boolean;
  resetting: boolean;
}

const EMPTY_PROFILE_STATE: KISProfileState = {
  appKey: "",
  appSecret: "",
  accountNo: "",
  accountProductCode: "01",
  token: "",
  tokenExpiry: "",
  source: null,
  runtimeMode: "",
  apiBaseUrl: "",
  hasEnvConfig: false,
  hasDbConfig: false,
  saved: false,
  testing: false,
  testResult: null,
  loading: true,
  resetting: false,
};

export function SettingsTab() {
  const setKISConfig = useAppStore((s) => s.setKISConfig);

  const [profiles, setProfiles] = useState<Record<KISProfileId, KISProfileState>>({
    default: { ...EMPTY_PROFILE_STATE },
    kr: { ...EMPTY_PROFILE_STATE },
    us: { ...EMPTY_PROFILE_STATE },
  });
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

  const updateProfile = useCallback((profileId: KISProfileId, updater: (prev: KISProfileState) => KISProfileState) => {
    setProfiles((prev) => ({ ...prev, [profileId]: updater(prev[profileId]) }));
  }, []);

  const loadKisProfile = useCallback(async (profileId: KISProfileId) => {
    updateProfile(profileId, (prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/kis/config?profile=${profileId}`);
      const data = await res.json();
      updateProfile(profileId, (prev) => ({
        ...prev,
        appKey: data.appKey ?? "",
        appSecret: data.appSecret ?? "",
        accountNo: data.accountNo ?? "",
        accountProductCode: data.accountProductCode ?? "01",
        token: data.token ?? "",
        tokenExpiry: data.tokenExpiry ?? "",
        source: data.source ?? null,
        runtimeMode: data.runtimeMode ?? "",
        apiBaseUrl: data.apiBaseUrl ?? "",
        hasEnvConfig: Boolean(data.hasEnvConfig),
        hasDbConfig: Boolean(data.hasDbConfig),
        testResult: prev.testResult,
        saved: false,
        testing: false,
        loading: false,
      }));
      if (profileId === "default" && (data.appKey || data.accountNo)) {
        setKISConfig({
          appKey: data.appKey ?? "",
          appSecret: data.appSecret ?? "",
          accountNo: data.accountNo ?? "",
          accountProductCode: data.accountProductCode ?? "01",
          token: data.token ?? "",
          tokenExpiry: data.tokenExpiry ?? "",
          source: data.source ?? null,
          runtimeMode: data.runtimeMode ?? "",
          apiBaseUrl: data.apiBaseUrl ?? "",
          hasEnvConfig: Boolean(data.hasEnvConfig),
          hasDbConfig: Boolean(data.hasDbConfig),
        });
      }
    } catch {
      updateProfile(profileId, (prev) => ({
        ...prev,
        loading: false,
        testResult: "설정 조회 실패",
      }));
    }
  }, [setKISConfig, updateProfile]);

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
    void loadKisProfile("default");
    void loadKisProfile("kr");
    void loadKisProfile("us");
    loadReconcilePreview().catch(() => {});
    loadPnlAuditPreview().catch(() => {});
    loadPreflight().catch(() => {});
    loadRehearsalChecklist().catch(() => {});
  }, [loadKisProfile]);

  useEffect(() => {
    highlightSectionFromHash();
  }, []);

  const handleSave = async (profileId: KISProfileId) => {
    const profile = profiles[profileId];
    const normalized = normalizeKisAccountInput(profile.accountNo, profile.accountProductCode);
    const payload = {
      profileId,
      appKey: profile.appKey,
      appSecret: profile.appSecret,
      accountNo: normalized.accountNo,
      accountProductCode: normalized.accountProductCode,
      token: profile.token,
      tokenExpiry: profile.tokenExpiry,
    };
    updateProfile(profileId, (prev) => ({ ...prev, testResult: null }));
    try {
      const res = await fetch("/api/kis/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        updateProfile(profileId, (prev) => ({ ...prev, testResult: `저장 실패: ${data.error ?? "알 수 없는 오류"}` }));
        return;
      }
      if (profileId === "default") {
        setKISConfig({
          appKey: profile.appKey,
          appSecret: profile.appSecret,
          accountNo: normalized.accountNo,
          accountProductCode: normalized.accountProductCode,
          token: profile.token,
          tokenExpiry: profile.tokenExpiry,
          source: "db",
          runtimeMode: profile.runtimeMode,
          apiBaseUrl: profile.apiBaseUrl,
          hasEnvConfig: profile.hasEnvConfig,
          hasDbConfig: true,
        });
      }
      updateProfile(profileId, (prev) => ({
        ...prev,
        accountNo: normalized.accountNo,
        accountProductCode: normalized.accountProductCode,
        saved: true,
        source: "db",
        hasDbConfig: true,
      }));
      setTimeout(() => {
        updateProfile(profileId, (prev) => ({ ...prev, saved: false }));
      }, 2000);
      await loadKisProfile(profileId);
    } catch {
      updateProfile(profileId, (prev) => ({ ...prev, testResult: "저장 실패: 네트워크 오류" }));
    }
  };

  const handleTest = async (profileId: KISProfileId) => {
    const profile = profiles[profileId];
    if (!profile.appKey || !profile.appSecret) {
      updateProfile(profileId, (prev) => ({ ...prev, testResult: "App Key와 App Secret을 입력하세요" }));
      return;
    }
    const normalized = normalizeKisAccountInput(profile.accountNo, profile.accountProductCode);
    if (!normalized.accountNo) {
      updateProfile(profileId, (prev) => ({ ...prev, testResult: "계좌번호를 입력하세요" }));
      return;
    }
    updateProfile(profileId, (prev) => ({ ...prev, testing: true, testResult: null }));
    try {
      const res  = await fetch("/api/kis/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appKey: profile.appKey, appSecret: profile.appSecret }) });
      const data = await res.json();
      if (data.token) {
        const nextTokenExpiry = new Date(Date.now() + 86400000).toISOString();
        if (profileId === "default" || profileId === "kr") {
          const params = new URLSearchParams({
            appKey: profile.appKey,
            appSecret: profile.appSecret,
            token: data.token,
            accountNo: normalized.accountNo,
            accountProductCode: normalized.accountProductCode,
          });
          const authRes = await fetch(`/api/kis/history?${params.toString()}`);
          const authData = await authRes.json().catch(() => ({}));
          if (!authRes.ok) {
            const detail = authData.error || "주문 계좌 인증 실패";
            updateProfile(profileId, (prev) => ({ ...prev, testResult: `실패: 토큰 발급 성공 / ${detail}`, testing: false }));
            return;
          }
          if (profileId === "default") {
            setKISConfig({
              appKey: profile.appKey,
              appSecret: profile.appSecret,
              accountNo: normalized.accountNo,
              accountProductCode: normalized.accountProductCode,
              token: data.token,
              tokenExpiry: nextTokenExpiry,
            });
          }
          updateProfile(profileId, (prev) => ({
            ...prev,
            accountNo: normalized.accountNo,
            accountProductCode: normalized.accountProductCode,
            token: data.token,
            tokenExpiry: nextTokenExpiry,
            testResult: "연결 성공! 토큰 발급 및 주문 계좌 인증 완료",
            testing: false,
          }));
        } else {
          updateProfile(profileId, (prev) => ({
            ...prev,
            accountNo: normalized.accountNo,
            accountProductCode: normalized.accountProductCode,
            token: data.token,
            tokenExpiry: nextTokenExpiry,
            testResult: "연결 성공! 토큰 발급 완료 · 해외 잔고/주문 화면에서 추가 확인",
            testing: false,
          }));
        }
      } else {
        const parts = [
          data.status ? `HTTP ${data.status}` : "",
          data.error || "알 수 없는 오류",
          data.detail || "",
        ].filter(Boolean);
        updateProfile(profileId, (prev) => ({ ...prev, testResult: `실패: ${parts.join(" / ")}` }));
      }
    } catch {
      updateProfile(profileId, (prev) => ({ ...prev, testResult: "네트워크 오류 — KIS 서버 연결 실패" }));
    } finally {
      updateProfile(profileId, (prev) => ({ ...prev, testing: false }));
    }
  };

  const handleResetDbConfig = async (profileId: KISProfileId) => {
    updateProfile(profileId, (prev) => ({ ...prev, resetting: true, testResult: null }));
    try {
      const res = await fetch(`/api/kis/config?profile=${profileId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        updateProfile(profileId, (prev) => ({
          ...prev,
          resetting: false,
          testResult: `DB 초기화 실패: ${data.error ?? "알 수 없는 오류"}`,
        }));
        return;
      }
      await loadKisProfile(profileId);
      updateProfile(profileId, (prev) => ({
        ...prev,
        resetting: false,
        testResult: "DB 저장값을 초기화했습니다. env 설정이 있으면 그 값을 사용합니다.",
      }));
    } catch {
      updateProfile(profileId, (prev) => ({
        ...prev,
        resetting: false,
        testResult: "DB 초기화 실패: 네트워크 오류",
      }));
    }
  };

  return (
    <div>
      {/* KIS 계좌 설정 */}
      <div id="kis-config-section" style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>KIS 계좌 설정</span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>모의 / 국내 / 해외 분리</span>
      </div>

      <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column" as const, gap: 12 }}>
        {([
          { id: "default" as const, title: "모의투자", subtitle: "기본 엔진 / 모의투자 API", testLabel: "연결 테스트" },
          { id: "kr" as const, title: "국내 계좌", subtitle: "국내주식 / 국내ETF", testLabel: "연결 테스트" },
          { id: "us" as const, title: "해외 계좌", subtitle: "미국주식 / 미국ETF", testLabel: "토큰 테스트" },
        ]).map(({ id, title, subtitle, testLabel }) => {
          const profile = profiles[id];
          const hasKey = !!profile.appKey;
          const hasToken = !!profile.token;
          const isDomesticOrderProfile = id === (KIS_RUNTIME_MODE === "prod" ? "kr" : "default");
          const activeSourceLabel =
            profile.source === "env" ? "환경변수(env)" :
            profile.source === "db" ? "DB(kis_config)" :
            "미확인";
          const runtimeModeLabel = profile.runtimeMode === "paper" ? "모의투자" : profile.runtimeMode || "미확인";
          const successTone = Boolean(profile.testResult?.includes("성공"));
          const runtimeSourceBadge = profile.source ? `${profile.source}/${id}` : `${id}/unset`;
          return (
            <details key={id} open={id === "default"} style={{ borderRadius: 16, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <summary style={{ listStyle: "none", cursor: "pointer", padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.ink }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: COLORS.dim }}>{subtitle}</div>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 999, background: profile.source === "db" ? "#FEF2F2" : "#EFF6FF", border: `1px solid ${profile.source === "db" ? "#FECACA" : "#BFDBFE"}` }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: profile.source === "db" ? "#B91C1C" : "#1D4ED8" }}>
                        현재 사용 중: {runtimeSourceBadge}
                      </span>
                    </div>
                    {isDomesticOrderProfile && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 999, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#3730A3" }}>
                          지금 국내 주문에 사용 중
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: hasToken ? "#22C55E" : hasKey ? "#F59E0B" : COLORS.dim }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: hasToken ? "#22C55E" : hasKey ? "#F59E0B" : COLORS.dim }}>
                    {profile.loading ? "조회 중" : hasToken ? "연결됨" : hasKey ? "키 저장됨" : "미설정"}
                  </span>
                </div>
              </summary>

              <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>App Key</label>
                  <input type="text" value={profile.appKey} onChange={(e) => updateProfile(id, (prev) => ({ ...prev, appKey: e.target.value }))} placeholder="KIS Developers에서 발급받은 앱키" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>App Secret</label>
                  <input type="password" value={profile.appSecret} onChange={(e) => updateProfile(id, (prev) => ({ ...prev, appSecret: e.target.value }))} placeholder="KIS Developers에서 발급받은 시크릿" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>계좌번호</label>
                  <input type="text" value={profile.accountNo} onChange={(e) => updateProfile(id, (prev) => ({ ...prev, accountNo: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="계좌번호 8자리 또는 10자리 전체 입력" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.mid, marginBottom: 6 }}>계좌 상품코드</label>
                  <input type="text" value={profile.accountProductCode} onChange={(e) => updateProfile(id, (prev) => ({ ...prev, accountProductCode: e.target.value.replace(/\D/g, "").slice(0, 2) || "01" }))} placeholder="주문용 상품코드 2자리 (예: 01)" style={inputStyle} />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => void handleSave(id)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                    background: profile.saved ? "#22C55E" : COLORS.ink, color: "#fff",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>{profile.saved ? "✓ 저장됨" : "저장"}</button>
                  <button onClick={() => void handleTest(id)} disabled={profile.testing} style={{
                    flex: 1, padding: "10px 0", borderRadius: 12,
                    background: "transparent", color: COLORS.rise,
                    border: `1.5px solid ${COLORS.rise}`,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    opacity: profile.testing ? 0.5 : 1,
                  }}>{profile.testing ? "테스트 중..." : testLabel}</button>
                  <button
                    onClick={() => void handleResetDbConfig(id)}
                    disabled={profile.resetting || !profile.hasDbConfig}
                    style={{
                      flexBasis: "100%",
                      padding: "10px 0",
                      borderRadius: 12,
                      background: "transparent",
                      color: profile.hasDbConfig ? "#DC2626" : COLORS.dim,
                      border: `1.5px solid ${profile.hasDbConfig ? "#FCA5A5" : COLORS.line}`,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: profile.hasDbConfig ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      opacity: profile.resetting ? 0.5 : 1,
                    }}
                  >
                    {profile.resetting ? "초기화 중..." : "DB 저장값 초기화"}
                  </button>
                </div>

                {profile.testResult && (
                  <div style={{
                    borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500,
                    background: successTone ? "#F0FDF4" : "#FEF2F2",
                    color: successTone ? "#16A34A" : "#DC2626",
                    border: `1px solid ${successTone ? "#BBF7D0" : "#FECACA"}`,
                  }}>{profile.testResult}</div>
                )}

                <div style={{ borderRadius: 12, padding: 12, background: `${COLORS.fall}08`, border: `1px solid ${COLORS.fall}15` }}>
                  <span style={{ fontSize: 11, lineHeight: 1.6, color: COLORS.mid }}>
                    KIS Developers (apiportal.koreainvestment.com)에서 {id === "default" ? "모의투자" : id === "kr" ? "국내" : "해외"} 계좌용 앱키를 발급받으세요. 현재 런타임 기준값은 {activeSourceLabel}이며,
                    {profile.source === "env"
                      ? " 현재 DB 값이 없거나 불완전해 env 폴백으로 운영 중입니다. 저장하면 서버 kis_config와 브라우저 캐시가 함께 갱신됩니다."
                      : " 저장 시 서버 kis_config와 브라우저 캐시가 함께 갱신되며, 실제 운영 조회도 DB 값을 우선 사용합니다."}
                  </span>
                </div>

                <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>활성 소스</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{activeSourceLabel}</span>
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>계좌번호</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{profile.accountNo || "미설정"}</span>
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>상품코드</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{profile.accountProductCode || "01"}</span>
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>런타임 모드</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{runtimeModeLabel}</span>
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>KIS API Base</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{profile.apiBaseUrl || "미설정"}</span>
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>설정 소스 보유</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>
                      env {profile.hasEnvConfig ? "있음" : "없음"} / db {profile.hasDbConfig ? "있음" : "없음"}
                    </span>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div id="preflight-section" style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>운영 프리플라이트</span>
        <span style={{ fontSize: 10, color: preflight?.status === "fail" ? "#DC2626" : preflight?.status === "warn" ? "#D97706" : COLORS.dim }}>
          {preflightLoading ? "확인 중..." : preflight?.status === "fail" ? "실행 금지" : preflight?.status === "warn" ? "주의 필요" : "통과"}
        </span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>
            실자금/소액 리허설 시작 전 핵심 상태를 한 번에 점검합니다.
          </div>
          {preflight?.readiness && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <div style={{ borderRadius: 10, padding: "10px 12px", background: preflight.readiness.autoTradingReady ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${preflight.readiness.autoTradingReady ? "#BBF7D0" : "#FECACA"}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>자동매매 준비</div>
                <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: preflight.readiness.autoTradingReady ? "#15803D" : "#DC2626" }}>
                  {preflight.readiness.autoTradingReady ? "가능" : "차단"}
                </div>
              </div>
              <div style={{ borderRadius: 10, padding: "10px 12px", background: preflight.readiness.livePromotionReady ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${preflight.readiness.livePromotionReady ? "#BBF7D0" : "#FDE68A"}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>실전 승격</div>
                <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: preflight.readiness.livePromotionReady ? "#15803D" : "#B45309" }}>
                  {preflight.readiness.livePromotionReady ? "가능" : "보류"}
                </div>
              </div>
            </div>
          )}
          {preflight?.runtimeContext && (
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>현재 실행 기준</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: COLORS.ink }}>
                {String(preflight.runtimeContext.environment).toUpperCase()} · {preflight.runtimeContext.runtimeMode === "paper" ? "모의투자" : preflight.runtimeContext.runtimeMode}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: COLORS.mid, lineHeight: 1.5 }}>
                {preflight.runtimeContext.activeProfileLabel ?? "미설정"} 프로필
                {preflight.runtimeContext.activeAccountMask ? ` · ${preflight.runtimeContext.activeAccountMask}` : ""}
                {preflight.runtimeContext.activeSource ? ` · ${preflight.runtimeContext.activeSource}` : ""}
              </div>
            </div>
          )}
          {preflight?.readiness && (
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.mid }}>
              차단 항목 {preflight.readiness.blockingCount}건 · 운영 경고 {preflight.readiness.advisoryWarnCount}건
            </div>
          )}
          {actionItems.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C2410C" }}>지금 할 일</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {actionItems.map((item, index) => (
                  <div key={`${item.tone}-${item.label}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{
                      marginTop: 2,
                      fontSize: 9,
                      fontWeight: 800,
                      color: item.tone === "block" ? "#FFFFFF" : "#9A3412",
                      background: item.tone === "block" ? "#DC2626" : "#FED7AA",
                      borderRadius: 999,
                      padding: "2px 6px",
                      whiteSpace: "nowrap",
                    }}>
                      {item.tone === "block" ? "우선" : "점검"} {index + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{item.label}</div>
                      <div style={{ marginTop: 2, fontSize: 11, color: COLORS.mid }}>{item.detail}</div>
                      <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: COLORS.dim }}>{item.location}</span>
                        {item.anchor && (
                          <ActionLinkChip label="여기로 이동" onClick={() => item.anchor && jumpToSection(item.anchor)} tone="warn" />
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
              {preflight.checks.map((check) => (
                <div key={check.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  {(() => {
                    const action = resolvePreflightCheckAction(check);
                    return (
                      <>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{check.label}</div>
                      {check.blocksTrading && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 999, padding: "2px 6px" }}>
                          차단
                        </span>
                      )}
                      {!check.blocksTrading && check.status === "warn" && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#92400E", background: "#FEF3C7", borderRadius: 999, padding: "2px 6px" }}>
                          운영 경고
                        </span>
                      )}
                      {check.status === "pass" && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#166534", background: "#DCFCE7", borderRadius: 999, padding: "2px 6px" }}>
                          통과
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.mid, marginTop: 2 }}>{check.detail}</div>
                    {summarizeBrokerReconcilePlan(check).length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {summarizeBrokerReconcilePlan(check).map((item) => (
                          <span
                            key={`${check.key}-${item.label}`}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#92400E",
                              background: "#FFFBEB",
                              border: "1px solid #FDE68A",
                              borderRadius: 999,
                              padding: "2px 8px",
                            }}
                          >
                            {item.label} {item.count}건
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: COLORS.dim }}>
                        {action.location}
                      </span>
                      {action.anchor && (
                        <ActionLinkChip
                          label={action.buttonLabel ?? "이동"}
                          onClick={() => action.anchor && jumpToSection(action.anchor)}
                        />
                      )}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: check.status === "fail" ? "#DC2626" : check.status === "warn" ? "#D97706" : "#15803D",
                    whiteSpace: "nowrap",
                  }}>
                    {check.status === "fail" ? "FAIL" : check.status === "warn" ? "WARN" : "PASS"}
                  </span>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={loadPreflight}
          disabled={preflightLoading}
          style={{
            padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`,
            background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            opacity: preflightLoading ? 0.5 : 1,
          }}
        >
          {preflightLoading ? "조회 중..." : "프리플라이트 새로고침"}
        </button>

        {preflightResult && (
          <div style={{
            borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500,
            background: "#FEF2F2",
            color: "#DC2626",
            border: "1px solid #FECACA",
          }}>{preflightResult}</div>
        )}
      </div>

      {/* 엔진 제어 */}
      <div id="engine-control-section" style={{ scrollMarginTop: 16 }}>
        <EngineControlSection />
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div id="reconcile-section" style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>포지션 리컨실</span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>
          {reconcileLoading ? "확인 중..." : `불일치 ${reconcilePreview?.mismatchCount ?? 0}건`}
        </span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>
            브로커 실보유와 DB 오픈 포지션 차이를 미리 확인합니다. 엔진 실행 중에는 조회/실행이 막힙니다.
          </div>
          {reconcilePreview && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: COLORS.ink }}>DB 누락 보유: {reconcilePreview.mismatches.missingInDb.length}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>수량 불일치: {reconcilePreview.mismatches.qtyMismatch.length}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>고아 DB 포지션: {reconcilePreview.mismatches.orphanedDb.length}건</div>
              {reconcilePreview.mismatches.qtyMismatch.slice(0, 2).map((item) => (
                <div key={`qty-${item.code}`} style={{ fontSize: 11, color: COLORS.mid }}>
                  {item.name} ({item.code}) · 브로커 {item.brokerQty}주 / DB {item.dbQty}주
                </div>
              ))}
              {reconcilePreview.mismatches.orphanedDb.slice(0, 2).map((item) => (
                <div key={`orphan-${item.code}`} style={{ fontSize: 11, color: COLORS.mid }}>
                  {item.name} ({item.code}) · DB만 {item.dbQty}주
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={loadReconcilePreview}
            disabled={reconcileLoading || reconcileRunning}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`,
              background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              opacity: reconcileLoading || reconcileRunning ? 0.5 : 1,
            }}
          >
            {reconcileLoading ? "조회 중..." : "미리보기 새로고침"}
          </button>
          <button
            onClick={runReconcile}
            disabled={reconcileLoading || reconcileRunning}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
              background: COLORS.ink, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              opacity: reconcileLoading || reconcileRunning ? 0.5 : 1,
            }}
          >
            {reconcileRunning ? "실행 중..." : "리컨실 실행"}
          </button>
        </div>

        {reconcileResult && (
          <div style={{
            borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500,
            background: reconcileResult.includes("완료") ? "#F0FDF4" : "#FEF2F2",
            color: reconcileResult.includes("완료") ? "#16A34A" : "#DC2626",
            border: `1px solid ${reconcileResult.includes("완료") ? "#BBF7D0" : "#FECACA"}`,
          }}>{reconcileResult}</div>
        )}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>손익 대사</span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>
          {pnlAuditLoading ? "확인 중..." : `불일치 ${pnlAuditPreview?.mismatchCount ?? 0}건`}
        </span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>
            최근 14일 기준으로 `positions` 종료 손익과 `trade_memory` 종료 손익을 비교합니다.
          </div>
          {pnlAuditPreview && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: COLORS.ink }}>종료 포지션: {pnlAuditPreview.closedPositionCount}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>종료 trade_memory: {pnlAuditPreview.closedTradeMemoryCount}건</div>
              <div style={{ fontSize: 11, color: COLORS.ink }}>정상 매칭: {pnlAuditPreview.matchedCount}건</div>
              {pnlAuditPreview.mismatches.slice(0, 3).map((item, index) => (
                <div key={`${item.kind}-${item.code}-${index}`} style={{ fontSize: 11, color: COLORS.mid }}>
                  {item.name} ({item.code}) · {item.kind}
                  {item.positionValue !== undefined || item.tradeMemoryValue !== undefined
                    ? ` · pos ${String(item.positionValue ?? "-")} / mem ${String(item.tradeMemoryValue ?? "-")}`
                    : ""}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={loadPnlAuditPreview}
          disabled={pnlAuditLoading}
          style={{
            padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`,
            background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            opacity: pnlAuditLoading ? 0.5 : 1,
          }}
        >
          {pnlAuditLoading ? "조회 중..." : "손익 대사 새로고침"}
        </button>

        {pnlAuditResult && (
          <div style={{
            borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500,
            background: "#FEF2F2",
            color: "#DC2626",
            border: "1px solid #FECACA",
          }}>{pnlAuditResult}</div>
        )}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      <div id="rehearsal-section" style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>리허설 추적</span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>
          {rehearsalLoading ? "확인 중..." : `${rehearsal?.summary.completedCount ?? 0}/${rehearsal?.summary.totalCount ?? 0} 완료`}
        </span>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>
            소액 실거래 또는 모의투자 리허설 항목을 체크합니다. 프리플라이트와 연결됩니다.
          </div>
          {rehearsal && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {rehearsal.items.map((item) => (
                <label key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: rehearsalSaving ? "default" : "pointer" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: COLORS.mid }}>
                      {item.checkedAt ? `완료 시각 ${item.checkedAt}` : "미완료"}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={rehearsalSaving}
                    onChange={(e) => void toggleRehearsalItem(item.key, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={loadRehearsalChecklist}
          disabled={rehearsalLoading || rehearsalSaving}
          style={{
            padding: "10px 0", borderRadius: 10, border: `1.5px solid ${COLORS.line}`,
            background: "transparent", color: COLORS.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            opacity: rehearsalLoading || rehearsalSaving ? 0.5 : 1,
          }}
        >
          {rehearsalLoading ? "조회 중..." : rehearsalSaving ? "저장 중..." : "리허설 상태 새로고침"}
        </button>

        {rehearsalResult && (
          <div style={{
            borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500,
            background: "#FEF2F2",
            color: "#DC2626",
            border: "1px solid #FECACA",
          }}>{rehearsalResult}</div>
        )}
      </div>

      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.dim }}>NEXIO v2.4 · Vercel + Supabase</span>
      </div>
    </div>
  );
}
