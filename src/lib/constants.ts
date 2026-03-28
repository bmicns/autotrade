// NEXIO 디자인 시스템 — 국내주식 전용
export const COLORS = {
  bg: "#FFFFFF",
  sub: "#F4F4F2",
  card: "#F9F9F7",
  line: "#E6E6E2",
  lineD: "#CACAC6",
  ink: "#0A0A0A",
  mid: "#484848",
  dim: "#909090",
  rise: "#E22929",
  fall: "#1554F0",
  riseL: "#FFF0F0",
  fallL: "#EEF3FF",
  riseB: "#EAAEAE",
  fallB: "#A8BAEE",
  hero: "#0F0F2E",
} as const;

// KIS 모의투자 API
export const KIS_VTS_BASE = "https://openapivts.koreainvestment.com:29443";
export const KIS_VTS_WS = "ws://ops.koreainvestment.com:31000";

export const KIS_TR = {
  PRICE: "FHKST01010100",
  DAILY_PRICE: "FHKST01010400",
  ASKING_PRICE: "FHKST01010200",
  BUY: "VTTC0802U",
  SELL: "VTTC0801U",
  CANCEL: "VTTC0803U",
  BALANCE: "VTTC8434R",
  ORDER_HISTORY: "VTTC8001R",
  BUYABLE: "VTTC8908R",
  WS_PRICE: "H0STCNT0",
  WS_ASKING: "H0STASP0",
  WS_EXECUTION: "H0STCNI9",
} as const;
