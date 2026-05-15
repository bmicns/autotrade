"use client";

import { COLORS } from "@/lib/constants";
import { KIS_RUNTIME_MODE } from "@/lib/constants";
import {
  BROKER_CREDENTIAL_FIELD_META,
  BROKER_CREDENTIAL_FIELD_ORDER,
  DOMESTIC_BROKER_CATALOG,
  getDomesticBrokerCatalogEntry,
} from "@/lib/broker/catalog";
import { normalizeKisAccountInput } from "@/lib/kis/account";
import type { BrokerConnectionMode, BrokerDirectoryEntry, BrokerId } from "@/lib/broker/types";
import type { KISProfileId, KISProfileState } from "./settings-types";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: `1.5px solid ${COLORS.line}`,
  background: COLORS.sub,
  color: COLORS.ink,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  letterSpacing: "normal",
};

interface BrokerSettingsSectionProps {
  activeBrokerId: BrokerId;
  brokerDirectory: Record<BrokerId, BrokerDirectoryEntry>;
  brokerLoading: boolean;
  brokerSaving: boolean;
  brokerResult: string | null;
  profiles: Record<KISProfileId, KISProfileState>;
  onSelectBroker: (brokerId: BrokerId) => void;
  onUpdateBrokerEntry: (brokerId: BrokerId, updater: (prev: BrokerDirectoryEntry) => BrokerDirectoryEntry) => void;
  onSaveBrokerDirectory: () => Promise<void>;
  onUpdateProfile: (profileId: KISProfileId, updater: (prev: KISProfileState) => KISProfileState) => void;
  onSaveProfile: (profileId: KISProfileId) => Promise<void>;
  onTestProfile: (profileId: KISProfileId) => Promise<void>;
  onResetProfile: (profileId: KISProfileId) => Promise<void>;
}

const CONNECTION_MODE_LABELS: Record<BrokerConnectionMode, string> = {
  planned: "준비중",
  paper: "모의 운영",
  live: "실전 운영",
};

export function BrokerSettingsSection({
  activeBrokerId,
  brokerDirectory,
  brokerLoading,
  brokerSaving,
  brokerResult,
  profiles,
  onSelectBroker,
  onUpdateBrokerEntry,
  onSaveBrokerDirectory,
  onUpdateProfile,
  onSaveProfile,
  onTestProfile,
  onResetProfile,
}: BrokerSettingsSectionProps) {
  const activeBroker = getDomesticBrokerCatalogEntry(activeBrokerId);
  const activeEntry = brokerDirectory[activeBrokerId];
  const registeredCount = Object.values(brokerDirectory).filter((entry) => entry.enabled).length;
  const executableCount = DOMESTIC_BROKER_CATALOG.filter((broker) => broker.implementationStatus === "implemented").length;

  return (
    <>
      <div
        id="kis-config-section"
        style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", scrollMarginTop: 16 }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
          브로커 운영 설정
        </span>
        <span style={{ fontSize: 10, color: COLORS.dim }}>
          국내 브로커 선택 / 계좌 / 자격정보
        </span>
      </div>

      <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ borderRadius: 14, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink }}>
                활성 브로커: {activeBroker.label}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: COLORS.mid }}>
                등록 {registeredCount}개 · 실행 어댑터 {executableCount}개 · 현재 상태 {activeBroker.implementationStatus === "implemented" ? "실행 가능" : "구조 준비"}
              </div>
            </div>
            <div style={{ fontSize: 11, color: COLORS.dim, alignSelf: "center" }}>
              {brokerLoading ? "브로커 설정 조회 중..." : "국내 증권사 디렉터리"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
          {DOMESTIC_BROKER_CATALOG.map((broker) => {
            const entry = brokerDirectory[broker.id];
            const selected = broker.id === activeBrokerId;
            return (
              <button
                key={broker.id}
                type="button"
                onClick={() => onSelectBroker(broker.id)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: `1px solid ${selected ? "#1D4ED8" : COLORS.line}`,
                  background: selected ? "#EFF6FF" : "#FFF",
                  color: COLORS.ink,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{broker.shortLabel}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: broker.implementationStatus === "implemented" ? "#166534" : "#92400E",
                      background: broker.implementationStatus === "implemented" ? "#DCFCE7" : "#FEF3C7",
                      borderRadius: 999,
                      padding: "2px 6px",
                    }}
                  >
                    {broker.implementationStatus === "implemented" ? "실행" : "준비"}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: COLORS.mid }}>{broker.description}</div>
                <div style={{ marginTop: 8, fontSize: 10, color: entry?.enabled ? "#1D4ED8" : COLORS.dim }}>
                  {entry?.enabled ? `등록됨 · ${CONNECTION_MODE_LABELS[entry.connectionMode]}` : "미등록"}
                </div>
              </button>
            );
          })}
        </div>

        {activeEntry && (
          <div style={{ borderRadius: 16, background: "#F8FAFC", border: `1px solid ${COLORS.line}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.ink }}>{activeBroker.label}</div>
              <div style={{ marginTop: 4, fontSize: 11, color: COLORS.mid }}>{activeBroker.operationsNote}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>운영 등록</span>
                <button
                  type="button"
                  onClick={() => onUpdateBrokerEntry(activeBrokerId, (prev) => ({ ...prev, enabled: !prev.enabled }))}
                  style={{
                    ...inputStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    background: activeEntry.enabled ? "#EEF2FF" : COLORS.sub,
                    color: activeEntry.enabled ? "#3730A3" : COLORS.mid,
                  }}
                >
                  {activeEntry.enabled ? "등록됨" : "미등록"}
                </button>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>운영 모드</span>
                <select
                  value={activeEntry.connectionMode}
                  onChange={(e) => onUpdateBrokerEntry(activeBrokerId, (prev) => ({
                    ...prev,
                    connectionMode: e.target.value as BrokerConnectionMode,
                  }))}
                  style={inputStyle}
                >
                  {(["planned", "paper", "live"] as BrokerConnectionMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {CONNECTION_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {BROKER_CREDENTIAL_FIELD_ORDER.map((field) => {
                const meta = BROKER_CREDENTIAL_FIELD_META[field];
                const type = meta.secret ? "password" : "text";
                return (
                  <label key={field} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>{meta.label}</span>
                    <input
                      type={type}
                      value={activeEntry.credentials[field]}
                      onChange={(e) => onUpdateBrokerEntry(activeBrokerId, (prev) => ({
                        ...prev,
                        credentials: {
                          ...prev.credentials,
                          [field]: e.target.value,
                        },
                      }))}
                      placeholder={meta.placeholder}
                      style={inputStyle}
                    />
                  </label>
                );
              })}
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.mid }}>운영 메모</span>
              <textarea
                value={activeEntry.memo}
                onChange={(e) => onUpdateBrokerEntry(activeBrokerId, (prev) => ({ ...prev, memo: e.target.value.slice(0, 400) }))}
                placeholder="해당 브로커의 인증 방식, 실계좌 여부, 주의점 등을 기록"
                style={{ ...inputStyle, minHeight: 92, resize: "vertical" as const }}
              />
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void onSaveBrokerDirectory()}
                disabled={brokerSaving}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  background: COLORS.ink,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  opacity: brokerSaving ? 0.5 : 1,
                }}
              >
                {brokerSaving ? "저장 중..." : "브로커 설정 저장"}
              </button>
            </div>

            {brokerResult && (
              <div
                style={{
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  background: brokerResult.includes("완료") ? "#F0FDF4" : "#FEF2F2",
                  color: brokerResult.includes("완료") ? "#16A34A" : "#DC2626",
                  border: `1px solid ${brokerResult.includes("완료") ? "#BBF7D0" : "#FECACA"}`,
                }}
              >
                {brokerResult}
              </div>
            )}

            <div style={{ borderRadius: 12, padding: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
              <div style={{ fontSize: 11, color: COLORS.dim, lineHeight: 1.6 }}>
                현재 선택 브로커: {activeBroker.label} · 상태 {activeBroker.implementationStatus === "implemented" ? "실행 어댑터 연결 완료" : "자격정보 저장 및 운영 분류만 가능"}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: COLORS.mid, lineHeight: 1.6 }}>
                최근 저장 시각: {activeEntry.updatedAt ? new Date(activeEntry.updatedAt).toLocaleString("ko-KR") : "없음"}
              </div>
            </div>
          </div>
        )}
      </div>

      {activeBrokerId === "kis" && (
        <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
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
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid }}>App Key</span>
                    <input type="text" value={profile.appKey} onChange={(e) => onUpdateProfile(id, (prev) => ({ ...prev, appKey: e.target.value }))} placeholder="KIS Developers에서 발급받은 앱키" style={inputStyle} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid }}>App Secret</span>
                    <input type="password" value={profile.appSecret} onChange={(e) => onUpdateProfile(id, (prev) => ({ ...prev, appSecret: e.target.value }))} placeholder="KIS Developers에서 발급받은 시크릿" style={inputStyle} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid }}>계좌번호</span>
                    <input type="text" value={profile.accountNo} onChange={(e) => onUpdateProfile(id, (prev) => ({ ...prev, accountNo: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="계좌번호 8자리 또는 10자리 전체 입력" style={inputStyle} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.mid }}>계좌 상품코드</span>
                    <input type="text" value={profile.accountProductCode} onChange={(e) => onUpdateProfile(id, (prev) => ({ ...prev, accountProductCode: e.target.value.replace(/\D/g, "").slice(0, 2) || "01" }))} placeholder="주문용 상품코드 2자리 (예: 01)" style={inputStyle} />
                  </label>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => void onSaveProfile(id)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: profile.saved ? "#22C55E" : COLORS.ink, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {profile.saved ? "✓ 저장됨" : "저장"}
                    </button>
                    <button onClick={() => void onTestProfile(id)} disabled={profile.testing} style={{ flex: 1, padding: "10px 0", borderRadius: 12, background: "transparent", color: COLORS.rise, border: `1.5px solid ${COLORS.rise}`, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: profile.testing ? 0.5 : 1 }}>
                      {profile.testing ? "테스트 중..." : testLabel}
                    </button>
                    <button onClick={() => void onResetProfile(id)} disabled={profile.resetting || !profile.hasDbConfig} style={{ flexBasis: "100%", padding: "10px 0", borderRadius: 12, background: "transparent", color: profile.hasDbConfig ? "#DC2626" : COLORS.dim, border: `1.5px solid ${profile.hasDbConfig ? "#FCA5A5" : COLORS.line}`, fontSize: 12, fontWeight: 700, cursor: profile.hasDbConfig ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: profile.resetting ? 0.5 : 1 }}>
                      {profile.resetting ? "초기화 중..." : "DB 저장값 초기화"}
                    </button>
                  </div>

                  {profile.testResult && (
                    <div style={{ borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 500, background: successTone ? "#F0FDF4" : "#FEF2F2", color: successTone ? "#16A34A" : "#DC2626", border: `1px solid ${successTone ? "#BBF7D0" : "#FECACA"}` }}>
                      {profile.testResult}
                    </div>
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
                      <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.ink }}>{normalizeKisAccountInput(profile.accountNo, profile.accountProductCode).accountNo || "미설정"}</span>
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
      )}

      <div style={{ height: 1, background: COLORS.line }} />
    </>
  );
}
