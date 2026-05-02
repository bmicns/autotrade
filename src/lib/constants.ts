// NEXIO 디자인 시스템 — CLIO 구조 통일
export const COLORS = {
  bg: "#FFFFFF",
  sub: "#F5F5F7",
  card: "#F7F8FA",
  line: "#E2E5EA",
  lineD: "#D1D5DB",
  ink: "#0A0A0A",
  mid: "#484848",
  dim: "#7C8494",
  rise: "#E22929",
  fall: "#1554F0",
  riseL: "#FFF0F0",
  fallL: "#EEF3FF",
  riseB: "#EAAEAE",
  fallB: "#A8BAEE",
  hero: "#0F0F2E",
} as const;

export const KIS_RUNTIME_MODE = process.env.KIS_RUNTIME_MODE ?? "paper";
export const KIS_API_BASE = process.env.KIS_API_BASE_URL ?? "https://openapivts.koreainvestment.com:29443";
export const KIS_WS_URL = process.env.KIS_WS_URL ?? "ws://ops.koreainvestment.com:31000";

function trEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const KIS_TR = {
  PRICE: trEnv("KIS_TR_PRICE", "FHKST01010100"),
  DAILY_PRICE: trEnv("KIS_TR_DAILY_PRICE", "FHKST01010400"),
  ASKING_PRICE: trEnv("KIS_TR_ASKING_PRICE", "FHKST01010200"),
  BUY: trEnv("KIS_TR_BUY", "VTTC0802U"),
  SELL: trEnv("KIS_TR_SELL", "VTTC0801U"),
  CANCEL: trEnv("KIS_TR_CANCEL", "VTTC0803U"),
  BALANCE: trEnv("KIS_TR_BALANCE", "VTTC8434R"),
  ORDER_HISTORY: trEnv("KIS_TR_ORDER_HISTORY", "VTTC8001R"),
  BUYABLE: trEnv("KIS_TR_BUYABLE", "VTTC8908R"),
  WS_PRICE: trEnv("KIS_TR_WS_PRICE", "H0STCNT0"),
  WS_ASKING: trEnv("KIS_TR_WS_ASKING", "H0STASP0"),
  WS_EXECUTION: trEnv("KIS_TR_WS_EXECUTION", "H0STCNI9"),
  INVESTOR_TREND: trEnv("KIS_TR_INVESTOR_TREND", "FHKST01010900"),  // 투자자별 매매동향
  OPEN_ORDERS: trEnv("KIS_TR_OPEN_ORDERS", "VTTC8036R"),         // 미체결 조회
  MINUTE_CHART: trEnv("KIS_TR_MINUTE_CHART", "FHKST03010200"),    // 분봉 (VWAP/Volume Profile용)
  INST_RANKING: trEnv("KIS_TR_INST_RANKING", "FHPST02320000"),    // 기관/외국인 순매수 상위 종목
} as const;
