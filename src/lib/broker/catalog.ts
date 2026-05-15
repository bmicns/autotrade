import type { BrokerConnectionMode, BrokerCredentialFields, BrokerDirectoryEntry, BrokerId } from "./types";

export interface DomesticBrokerCatalogEntry {
  id: BrokerId;
  label: string;
  shortLabel: string;
  description: string;
  implementationStatus: "implemented" | "planned";
  supportsRuntime: Array<BrokerConnectionMode>;
  operationsNote: string;
}

export const DOMESTIC_BROKER_CATALOG: DomesticBrokerCatalogEntry[] = [
  {
    id: "kis",
    label: "한국투자증권",
    shortLabel: "한국투자",
    description: "현재 실주문, 잔고, 시세, 헬스체크가 연결된 기본 브로커",
    implementationStatus: "implemented",
    supportsRuntime: ["paper", "live"],
    operationsNote: "모의/국내/해외 KIS 프로필을 함께 관리합니다.",
  },
  {
    id: "samsung",
    label: "삼성증권",
    shortLabel: "삼성증권",
    description: "어댑터 자리와 설정 흐름을 먼저 준비하는 대상",
    implementationStatus: "planned",
    supportsRuntime: ["planned"],
    operationsNote: "자격정보와 계좌 메타데이터를 저장할 수 있지만 주문 실행은 아직 연결되지 않습니다.",
  },
  {
    id: "kiwoom",
    label: "키움증권",
    shortLabel: "키움",
    description: "국내 개인 자동매매 확장 후보",
    implementationStatus: "planned",
    supportsRuntime: ["planned"],
    operationsNote: "OpenAPI/REST 연동 전까지는 브로커 디렉터리 수준으로 관리합니다.",
  },
  {
    id: "nh",
    label: "NH투자증권",
    shortLabel: "NH",
    description: "국내 대안 브로커 후보",
    implementationStatus: "planned",
    supportsRuntime: ["planned"],
    operationsNote: "키와 계좌 정보를 저장하고 활성 브로커 후보로 표시할 수 있습니다.",
  },
  {
    id: "kb",
    label: "KB증권",
    shortLabel: "KB",
    description: "향후 국내 계좌 확장용 슬롯",
    implementationStatus: "planned",
    supportsRuntime: ["planned"],
    operationsNote: "실행 어댑터 구현 전까지는 운영 메모와 계좌 메타데이터만 관리합니다.",
  },
  {
    id: "mirae",
    label: "미래에셋증권",
    shortLabel: "미래에셋",
    description: "국내 멀티브로커 확장용 슬롯",
    implementationStatus: "planned",
    supportsRuntime: ["planned"],
    operationsNote: "공식 API 규격 확보 후 잔고/주문 라우트에 연결할 수 있게 구조를 열어둡니다.",
  },
  {
    id: "ls",
    label: "LS증권",
    shortLabel: "LS",
    description: "추가 국내 브로커 후보",
    implementationStatus: "planned",
    supportsRuntime: ["planned"],
    operationsNote: "등록과 운영 분류는 가능하지만, 실제 체결 경로는 아직 없습니다.",
  },
];

export const BROKER_CREDENTIAL_FIELD_ORDER: Array<keyof BrokerCredentialFields> = [
  "apiKey",
  "apiSecret",
  "accountNo",
  "accountProductCode",
  "clientId",
  "userId",
];

export const BROKER_CREDENTIAL_FIELD_META: Record<keyof BrokerCredentialFields, { label: string; placeholder: string; secret?: boolean }> = {
  apiKey: {
    label: "접속 키",
    placeholder: "브로커 API 키 또는 앱키",
  },
  apiSecret: {
    label: "접속 시크릿",
    placeholder: "브로커 API 시크릿 또는 앱시크릿",
    secret: true,
  },
  accountNo: {
    label: "계좌번호",
    placeholder: "운영 대상 계좌번호",
  },
  accountProductCode: {
    label: "상품코드",
    placeholder: "국내 주문용 상품코드",
  },
  clientId: {
    label: "클라이언트 ID",
    placeholder: "브로커별 추가 식별자",
  },
  userId: {
    label: "사용자 ID",
    placeholder: "브로커별 로그인/회원 식별자",
  },
};

export function getDomesticBrokerCatalogEntry(brokerId: BrokerId): DomesticBrokerCatalogEntry {
  return DOMESTIC_BROKER_CATALOG.find((broker) => broker.id === brokerId) ?? DOMESTIC_BROKER_CATALOG[0];
}

export function createEmptyBrokerCredentials(): BrokerCredentialFields {
  return {
    apiKey: "",
    apiSecret: "",
    accountNo: "",
    accountProductCode: "",
    clientId: "",
    userId: "",
  };
}

export function createDefaultBrokerDirectoryEntry(brokerId: BrokerId): BrokerDirectoryEntry {
  return {
    brokerId,
    enabled: brokerId === "kis",
    connectionMode: brokerId === "kis" ? "paper" : "planned",
    credentials: createEmptyBrokerCredentials(),
    memo: "",
    updatedAt: null,
  };
}

export function createDefaultBrokerDirectory(): Record<BrokerId, BrokerDirectoryEntry> {
  return DOMESTIC_BROKER_CATALOG.reduce((acc, broker) => {
    acc[broker.id] = createDefaultBrokerDirectoryEntry(broker.id);
    return acc;
  }, {} as Record<BrokerId, BrokerDirectoryEntry>);
}
