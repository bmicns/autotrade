"use client";

import { useCallback, useState } from "react";
import { createDefaultBrokerDirectory } from "@/lib/broker/catalog";
import { normalizeBrokerId } from "@/lib/broker/registry";
import { normalizeKisAccountInput } from "@/lib/kis/account";
import type { KISConfig } from "@/lib/store";
import type { BrokerDirectoryEntry, BrokerId } from "@/lib/broker/types";
import type { KISProfileId, KISProfileState } from "./settings-types";

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

export function useBrokerSettingsState(setKISConfig: (config: KISConfig) => void) {
  const [activeBrokerId, setActiveBrokerId] = useState<BrokerId>("kis");
  const [brokerDirectory, setBrokerDirectory] = useState(createDefaultBrokerDirectory);
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerSaving, setBrokerSaving] = useState(false);
  const [brokerResult, setBrokerResult] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<KISProfileId, KISProfileState>>({
    default: { ...EMPTY_PROFILE_STATE },
    kr: { ...EMPTY_PROFILE_STATE },
    us: { ...EMPTY_PROFILE_STATE },
  });

  const updateProfile = useCallback((profileId: KISProfileId, updater: (prev: KISProfileState) => KISProfileState) => {
    setProfiles((prev) => ({ ...prev, [profileId]: updater(prev[profileId]) }));
  }, []);

  const updateBrokerEntry = useCallback((brokerId: BrokerId, updater: (prev: BrokerDirectoryEntry) => BrokerDirectoryEntry) => {
    setBrokerDirectory((prev) => ({ ...prev, [brokerId]: updater(prev[brokerId]) }));
  }, []);

  const loadBrokerDirectory = useCallback(async () => {
    setBrokerLoading(true);
    setBrokerResult(null);
    try {
      const res = await fetch("/api/brokers/config");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBrokerResult(data.error ?? "브로커 설정 조회 실패");
        return;
      }
      if (data.activeBrokerId) {
        setActiveBrokerId(data.activeBrokerId);
      }
      if (data.brokers && typeof data.brokers === "object") {
        setBrokerDirectory((prev) => ({ ...prev, ...data.brokers }));
      }
    } catch {
      setBrokerResult("브로커 설정 네트워크 오류");
    } finally {
      setBrokerLoading(false);
    }
  }, []);

  const saveBrokerDirectory = useCallback(async () => {
    setBrokerSaving(true);
    setBrokerResult(null);
    try {
      const res = await fetch("/api/brokers/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeBrokerId,
          brokers: brokerDirectory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBrokerResult(data.error ?? "브로커 설정 저장 실패");
        return;
      }
      if (data.activeBrokerId) {
        setActiveBrokerId(data.activeBrokerId);
      }
      if (data.brokers && typeof data.brokers === "object") {
        setBrokerDirectory((prev) => ({ ...prev, ...data.brokers }));
      }
      setBrokerResult("브로커 운영 설정 저장 완료");
    } catch {
      setBrokerResult("브로커 설정 저장 실패: 네트워크 오류");
    } finally {
      setBrokerSaving(false);
    }
  }, [activeBrokerId, brokerDirectory]);

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
      if (typeof data.brokerId === "string") {
        setActiveBrokerId(normalizeBrokerId(data.brokerId));
      }
      if (profileId === "default" && (data.appKey || data.accountNo)) {
        setKISConfig({
          brokerId: normalizeBrokerId(typeof data.brokerId === "string" ? data.brokerId : undefined),
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

  const handleSave = useCallback(async (profileId: KISProfileId) => {
    const profile = profiles[profileId];
    const normalized = normalizeKisAccountInput(profile.accountNo, profile.accountProductCode);
    const payload = {
      brokerId: activeBrokerId,
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
          brokerId: activeBrokerId,
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
  }, [activeBrokerId, loadKisProfile, profiles, setKISConfig, updateProfile]);

  const handleTest = useCallback(async (profileId: KISProfileId) => {
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
      const res = await fetch("/api/kis/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appKey: profile.appKey, appSecret: profile.appSecret }) });
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
              brokerId: activeBrokerId,
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
        const parts = [data.status ? `HTTP ${data.status}` : "", data.error || "알 수 없는 오류", data.detail || ""].filter(Boolean);
        updateProfile(profileId, (prev) => ({ ...prev, testResult: `실패: ${parts.join(" / ")}` }));
      }
    } catch {
      updateProfile(profileId, (prev) => ({ ...prev, testResult: "네트워크 오류 — KIS 서버 연결 실패" }));
    } finally {
      updateProfile(profileId, (prev) => ({ ...prev, testing: false }));
    }
  }, [activeBrokerId, profiles, setKISConfig, updateProfile]);

  const handleResetDbConfig = useCallback(async (profileId: KISProfileId) => {
    updateProfile(profileId, (prev) => ({ ...prev, resetting: true, testResult: null }));
    try {
      const res = await fetch(`/api/kis/config?profile=${profileId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        updateProfile(profileId, (prev) => ({ ...prev, resetting: false, testResult: `DB 초기화 실패: ${data.error ?? "알 수 없는 오류"}` }));
        return;
      }
      await loadKisProfile(profileId);
      updateProfile(profileId, (prev) => ({ ...prev, resetting: false, testResult: "DB 저장값을 초기화했습니다. env 설정이 있으면 그 값을 사용합니다." }));
    } catch {
      updateProfile(profileId, (prev) => ({ ...prev, resetting: false, testResult: "DB 초기화 실패: 네트워크 오류" }));
    }
  }, [loadKisProfile, updateProfile]);

  return {
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
  };
}
