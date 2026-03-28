import { KIS_VTS_BASE, KIS_TR } from "@/lib/constants";

interface KISConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
  token?: string;
}

// 토큰 발급
export async function getToken(appKey: string, appSecret: string) {
  const res = await fetch(`${KIS_VTS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });
  if (!res.ok) throw new Error(`KIS token error: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

// 공통 헤더
function headers(config: KISConfig, trId: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    authorization: `Bearer ${config.token}`,
    appkey: config.appKey,
    appsecret: config.appSecret,
    tr_id: trId,
  };
}

// 현재가 조회
export async function getPrice(config: KISConfig, stockCode: string) {
  const params = new URLSearchParams({
    fid_cond_mrkt_div_code: "J",
    fid_input_iscd: stockCode,
  });
  const res = await fetch(
    `${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
    { headers: headers(config, KIS_TR.PRICE) }
  );
  if (!res.ok) throw new Error(`KIS price error: ${res.status}`);
  return res.json();
}

// 잔고 조회
export async function getBalance(config: KISConfig) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const params = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: "N",
    OFL_YN: "",
    INQR_DVSN: "02",
    UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N",
    FNCG_AMT_AUTO_RDPT_YN: "N",
    PRCS_DVSN: "00",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  });
  const res = await fetch(
    `${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`,
    { headers: headers(config, KIS_TR.BALANCE) }
  );
  if (!res.ok) throw new Error(`KIS balance error: ${res.status}`);
  return res.json();
}

// 주문 (매수/매도)
export async function placeOrder(
  config: KISConfig,
  side: "buy" | "sell",
  stockCode: string,
  quantity: number,
  price: number,
  orderType: "00" | "01" = "00" // 00=지정가, 01=시장가
) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const trId = side === "buy" ? KIS_TR.BUY : KIS_TR.SELL;
  const body = {
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    PDNO: stockCode,
    ORD_DVSN: orderType,
    ORD_QTY: String(quantity),
    ORD_UNPR: orderType === "01" ? "0" : String(price),
  };
  const res = await fetch(
    `${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`,
    {
      method: "POST",
      headers: headers(config, trId),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`KIS order error: ${res.status}`);
  return res.json();
}

// 주문 내역 조회
export async function getOrderHistory(config: KISConfig) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const params = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    INQR_STRT_DT: today,
    INQR_END_DT: today,
    SLL_BUY_DVSN_CD: "00",
    INQR_DVSN: "00",
    PDNO: "",
    CCLD_DVSN: "00",
    ORD_GNO_BRNO: "",
    ODNO: "",
    INQR_DVSN_3: "00",
    INQR_DVSN_1: "",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  });
  const res = await fetch(
    `${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/inquire-daily-ccld?${params}`,
    { headers: headers(config, KIS_TR.ORDER_HISTORY) }
  );
  if (!res.ok) throw new Error(`KIS history error: ${res.status}`);
  return res.json();
}
