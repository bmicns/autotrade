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

// 국내 주식 더미 데이터 (KIS 연동 전까지 사용)
export const DUMMY_STOCKS = [
  { code: "005930", name: "삼성전자", market: "KOSPI", price: 188900, change: 1.4, history: [182000, 183500, 185000, 184200, 186300, 188900] },
  { code: "000660", name: "SK하이닉스", market: "KOSPI", price: 933000, change: 0.97, history: [896000, 904000, 916000, 920000, 924000, 933000] },
  { code: "035720", name: "카카오", market: "KOSPI", price: 47200, change: -1.87, history: [49200, 48800, 48500, 48300, 48100, 47200] },
  { code: "005380", name: "현대차", market: "KOSPI", price: 258000, change: 0.78, history: [251000, 253000, 254500, 256000, 255200, 258000] },
  { code: "006400", name: "삼성SDI", market: "KOSPI", price: 387000, change: -0.51, history: [392000, 390000, 389500, 388000, 389000, 387000] },
];

export const DUMMY_HOLDINGS = [
  { code: "005930", name: "삼성전자", market: "KOSPI", quantity: 10, avgPrice: 175400 },
  { code: "000660", name: "SK하이닉스", market: "KOSPI", quantity: 2, avgPrice: 880000 },
  { code: "035720", name: "카카오", market: "KOSPI", quantity: 20, avgPrice: 52100 },
];

export const DUMMY_KOSPI = { value: 2763, change: -2.73 };

export const DUMMY_NEWS = [
  { title: "SK하이닉스, HBM4 납품 70% 확보…목표주가 130만원 상향", source: "한국경제", mood: "pos" as const },
  { title: "삼성전자 노조, 전 부회장 면담 후 총파업 잠정 유예", source: "연합뉴스", mood: "neu" as const },
  { title: "코스피 2.73% 급락…이란발 지정학적 리스크·외국인 매도", source: "매일경제", mood: "neg" as const },
];

export const DUMMY_PERF = {
  winRate: 64.2,
  profitFactor: 1.82,
  totalPnl: 1284000,
  totalTrades: 47,
  avgProfit: 5.3,
  avgLoss: 2.9,
  indicators: [
    { name: "RSI", value: 78 },
    { name: "MACD", value: 85 },
    { name: "이동평균", value: 71 },
    { name: "볼린저", value: 66 },
    { name: "거래량", value: 59 },
  ],
  sectors: [
    { name: "반도체", winRate: 72, trades: 18 },
    { name: "전기차", winRate: 58, trades: 12 },
    { name: "바이오", winRate: 55, trades: 9 },
    { name: "방산", winRate: 80, trades: 8 },
  ],
};

export const SIGNAL_INDICATORS = [
  { name: "RSI", value: "28.4", desc: "과매도 구간", hit: true },
  { name: "MACD", value: "골든크로스", desc: "추세 상승 전환", hit: true },
  { name: "이동평균", value: "5일>20일", desc: "돌파 확인", hit: true },
  { name: "볼린저", value: "하단 이탈", desc: "반등 가능성", hit: true },
  { name: "거래량", value: "243%", desc: "20일 평균 대비", hit: false },
];

// KIS 모의투자 API
export const KIS_VTS_BASE = "https://openapivts.koreainvestment.com:29443";
export const KIS_VTS_WS = "ws://ops.koreainvestment.com:31000";

export const KIS_TR = {
  // 시세 (실전/모의 동일)
  PRICE: "FHKST01010100",
  DAILY_PRICE: "FHKST01010400",
  ASKING_PRICE: "FHKST01010200",
  // 주문 (모의투자 VTT 접두사)
  BUY: "VTTC0802U",
  SELL: "VTTC0801U",
  CANCEL: "VTTC0803U",
  // 잔고/조회
  BALANCE: "VTTC8434R",
  ORDER_HISTORY: "VTTC8001R",
  BUYABLE: "VTTC8908R",
  // WebSocket
  WS_PRICE: "H0STCNT0",
  WS_ASKING: "H0STASP0",
  WS_EXECUTION: "H0STCNI9", // 모의전용
} as const;
