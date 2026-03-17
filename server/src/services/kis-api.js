/**
 * kis-api.js
 * 한국투자증권 KIS Open API 연동
 */
import axios from "axios";
import { log } from "../utils/logger.js";
import { rateLimit } from "../utils/rate-limiter.js";

// ─── 환경 설정 ───
const isReal = process.env.KIS_MODE === "real";
const BASE_URL = isReal
  ? "https://openapi.koreainvestment.com:9443"
  : "https://openapivts.koreainvestment.com:29443";

const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
const ACCOUNT_NO = process.env.KIS_ACCOUNT_NO || "";
const [CANO, ACNT_PRDT_CD] = ACCOUNT_NO.split("-");

let accessToken = null;
let tokenExpiry = 0;

// ─── 토큰 발급 ───
async function getToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const { data } = await axios.post(`${BASE_URL}/oauth2/tokenP`, {
    grant_type: "client_credentials",
    appkey: APP_KEY,
    appsecret: APP_SECRET,
  });

  accessToken = data.access_token;
  // 토큰 만료 23시간 후 갱신 (실제 24시간)
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  log("info", "✅ KIS 토큰 발급 완료");
  return accessToken;
}

function headers(trId) {
  return {
    "content-type": "application/json; charset=utf-8",
    authorization: `Bearer ${accessToken}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: trId,
  };
}

// ─── 거래량 상위 종목 조회 (KOSPI/KOSDAQ) ───
export async function getTopVolumeStocks(market = "J", count = 50) {
  await getToken();
  await rateLimit();
  // market: "J" = KOSPI, "Q" = KOSDAQ
  const trId = "FHPST01710000";
  try {
    const { data } = await axios.get(
      `${BASE_URL}/uapi/domestic-stock/v1/quotations/volume-rank`,
      {
        headers: headers(trId),
        params: {
          FID_COND_MRKT_DIV_CODE: market,
          FID_COND_SCR_DIV_CODE: "20101",
          FID_INPUT_ISCD: "0000",
          FID_DIV_CLS_CODE: "0",
          FID_BLNG_CLS_CODE: "0",
          FID_TRGT_CLS_CODE: "111111111",
          FID_TRGT_EXLS_CLS_CODE: "000000",
          FID_INPUT_PRICE_1: "0",
          FID_INPUT_PRICE_2: "0",
          FID_VOL_CNT: "0",
          FID_INPUT_DATE_1: "",
        },
      }
    );
    return (data.output || []).slice(0, count).map((s) => ({
      code: s.mksc_shrn_iscd,
      name: s.hts_kor_isnm,
      price: Number(s.stck_prpr),
      changeRate: Number(s.prdy_ctrt),
      volume: Number(s.acml_vol),
      tradeAmount: Number(s.acml_tr_pbmn),
      market: market === "J" ? "KOSPI" : "KOSDAQ",
    }));
  } catch (err) {
    log("error", `거래량순위 조회 실패 (${market}): ${err.message}`);
    return [];
  }
}

// ─── 현재가 조회 ───
export async function getCurrentPrice(stockCode) {
  await getToken();
  await rateLimit();
  const trId = isReal ? "FHKST01010100" : "FHKST01010100";
  const { data } = await axios.get(`${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`, {
    headers: headers(trId),
    params: {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: stockCode,
    },
  });
  const o = data.output;
  return {
    price: Number(o.stck_prpr),
    change: Number(o.prdy_vrss),
    changeRate: Number(o.prdy_ctrt),
    volume: Number(o.acml_vol),
    high: Number(o.stck_hgpr),
    low: Number(o.stck_lwpr),
    open: Number(o.stck_oprc),
  };
}

// ─── 일봉 데이터 (최근 N일) ───
export async function getDailyCandles(stockCode, days = 60) {
  await getToken();
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, "");

  const { data } = await axios.get(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
    {
      headers: headers("FHKST03010100"),
      params: {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: stockCode,
        FID_INPUT_DATE_1: start,
        FID_INPUT_DATE_2: end,
        FID_PERIOD_DIV_CODE: "D",
        FID_ORG_ADJ_PRC: "0",
      },
    }
  );
  return (data.output2 || []).map((c) => ({
    date: c.stck_bsop_date,
    open: Number(c.stck_oprc),
    high: Number(c.stck_hgpr),
    low: Number(c.stck_lwpr),
    close: Number(c.stck_clpr),
    volume: Number(c.acml_vol),
  })).reverse(); // 오래된 날짜 → 최신 순
}

// ─── 매수 주문 ───
export async function buyOrder(stockCode, qty, price = 0) {
  await getToken();
  const trId = isReal ? "TTTC0802U" : "VTTC0802U";
  const body = {
    CANO: CANO,
    ACNT_PRDT_CD: ACNT_PRDT_CD,
    PDNO: stockCode,
    ORD_DVSN: price === 0 ? "01" : "00", // 01: 시장가, 00: 지정가
    ORD_QTY: String(qty),
    ORD_UNPR: String(price),
  };
  const { data } = await axios.post(
    `${BASE_URL}/uapi/domestic-stock/v1/trading/order-cash`,
    body,
    { headers: headers(trId) }
  );
  log("info", `📈 매수 주문: ${stockCode} x${qty}`, data.output);
  return data;
}

// ─── 매도 주문 ───
export async function sellOrder(stockCode, qty, price = 0) {
  await getToken();
  const trId = isReal ? "TTTC0801U" : "VTTC0801U";
  const body = {
    CANO: CANO,
    ACNT_PRDT_CD: ACNT_PRDT_CD,
    PDNO: stockCode,
    ORD_DVSN: price === 0 ? "01" : "00",
    ORD_QTY: String(qty),
    ORD_UNPR: String(price),
  };
  const { data } = await axios.post(
    `${BASE_URL}/uapi/domestic-stock/v1/trading/order-cash`,
    body,
    { headers: headers(trId) }
  );
  log("info", `📉 매도 주문: ${stockCode} x${qty}`, data.output);
  return data;
}

// ─── 잔고 조회 ───
export async function getBalance() {
  await getToken();
  const trId = isReal ? "TTTC8434R" : "VTTC8434R";
  const { data } = await axios.get(
    `${BASE_URL}/uapi/domestic-stock/v1/trading/inquire-balance`,
    {
      headers: headers(trId),
      params: {
        CANO: CANO,
        ACNT_PRDT_CD: ACNT_PRDT_CD,
        AFHR_FLPR_YN: "N",
        OFL_YN: "",
        INQR_DVSN: "02",
        UNPR_DVSN: "01",
        FUND_STTL_ICLD_YN: "N",
        FNCG_AMT_AUTO_RDPT_YN: "N",
        PRCS_DVSN: "00",
        CTX_AREA_FK100: "",
        CTX_AREA_NK100: "",
      },
    }
  );
  return {
    holdings: (data.output1 || []).map((h) => ({
      code: h.pdno,
      name: h.prdt_name,
      qty: Number(h.hldg_qty),
      avgPrice: Number(h.pchs_avg_pric),
      currentPrice: Number(h.prpr),
      profitRate: Number(h.evlu_pfls_rt),
      profitAmount: Number(h.evlu_pfls_amt),
    })),
    cash: Number(data.output2?.[0]?.dnca_tot_amt || 0),
    totalEval: Number(data.output2?.[0]?.scts_evlu_amt || 0),
  };
}
