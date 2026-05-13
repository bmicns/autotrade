import { KIS_API_BASE, KIS_RUNTIME_MODE, KIS_TR } from "@/lib/constants";
import { KIS_RATE_LIMIT_DELAY_MS } from "@/lib/engine/constants";
import { shouldRetryKisRequest, shouldRetryRateLimit } from "@/lib/engine/kis-rate-limit";
import { resolveKisAccountParts } from "@/lib/kis/account";

interface KISConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountProductCode?: string;
  token?: string;
}

export interface KISTokenDetails {
  token: string;
  tokenExpiry: string | null;
}

export class KISError extends Error {
  status: number;
  detail: string;
  kisCode?: string;  // KIS error_code (예: "EGW00123")

  constructor(message: string, status: number, detail?: string, kisCode?: string) {
    super(message);
    this.name = "KISError";
    this.status = status;
    this.detail = detail ?? message;
    this.kisCode = kisCode;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponseDetail(res: Response): Promise<{ detail: string; kisCode?: string }> {
  const raw = await res.text().catch(() => "");
  let detail = raw.trim() || `HTTP ${res.status}`;
  let kisCode: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { msg1?: string; msg_cd?: string; error_description?: string; error?: string; error_code?: string; rt_cd?: string };
    detail = parsed.error_description || parsed.msg1 || parsed.error || raw.trim() || `HTTP ${res.status}`;
    kisCode = parsed.error_code || parsed.msg_cd || (parsed.error && !parsed.error.includes(" ") ? parsed.error : undefined) || parsed.rt_cd;
  } catch {
    // keep raw text
  }
  return { detail, kisCode };
}

// 토큰 발급
export async function getTokenDetails(appKey: string, appSecret: string): Promise<KISTokenDetails> {
  const res = await fetch(`${KIS_API_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let detail = raw.trim();
    let kisCode: string | undefined;
    try {
      const parsed = JSON.parse(raw) as { msg1?: string; msg_cd?: string; error_description?: string; error?: string; error_code?: string };
      detail = parsed.error_description || parsed.msg1 || parsed.error || raw.trim();
      // error_code 또는 msg_cd가 코드, error가 코드처럼 보이면 (공백 없음) 사용
      kisCode = parsed.error_code || parsed.msg_cd || (parsed.error && !parsed.error.includes(" ") ? parsed.error : undefined);
    } catch { /* keep raw text */ }
    throw new KISError(`KIS token error: ${res.status}`, res.status, detail || `HTTP ${res.status}`, kisCode);
  }
  const data = await res.json() as {
    access_token?: string;
    access_token_token_expired?: string;
    expires_in?: number | string;
  };
  const token = String(data.access_token ?? "");
  if (!token) {
    throw new KISError("KIS token error: invalid payload", 500, "access_token 누락");
  }
  const tokenExpiry = typeof data.access_token_token_expired === "string" && data.access_token_token_expired
    ? data.access_token_token_expired
    : (Number(data.expires_in) > 0 ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null);
  return { token, tokenExpiry };
}

export async function getToken(appKey: string, appSecret: string) {
  const details = await getTokenDetails(appKey, appSecret);
  return details.token;
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
      { headers: headers(config, KIS_TR.PRICE) }
    );
    if (res.ok) return res.json();

    const { detail } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new Error(`KIS price error: ${res.status} ${detail}`.trim());
  }

  throw new Error("KIS price error: retry exhausted");
}

// 잔고 조회
export async function getBalance(config: KISConfig) {
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`,
      { headers: headers(config, KIS_TR.BALANCE) }
    );
    if (res.ok) return res.json();

    const { detail, kisCode } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new KISError(`KIS balance error: ${res.status}`, res.status, detail || `HTTP ${res.status}`, kisCode);
  }

  throw new KISError("KIS balance error: retry exhausted", 500, "잔고 조회 재시도 실패");
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
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  const trId = side === "buy" ? KIS_TR.BUY : KIS_TR.SELL;
  const body = {
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    PDNO: stockCode,
    ORD_DVSN: orderType,
    ORD_QTY: String(quantity),
    ORD_UNPR: orderType === "01" ? "0" : String(price),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/trading/order-cash`,
      {
        method: "POST",
        headers: headers(config, trId),
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const { detail } = await parseResponseDetail(res);
      if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
        await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }
      throw new Error(`KIS order error: ${res.status} ${detail}`.trim());
    }

    const data = await res.json();
    const message = `${data.msg1 || data.msg || ""}`;
    if (data.rt_cd === "0") return data;
    if (attempt === 0 && shouldRetryKisRequest(message)) {
      await sleep(shouldRetryRateLimit(message) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    return data;
  }

  throw new Error("KIS order error: retry exhausted");
}

// 주문 내역 조회
export async function getOrderHistory(config: KISConfig) {
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/trading/inquire-daily-ccld?${params}`,
      { headers: headers(config, KIS_TR.ORDER_HISTORY) }
    );
    if (res.ok) return res.json();

    const { detail } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new Error(`KIS history error: ${res.status} ${detail}`.trim());
  }

  throw new Error("KIS history error: retry exhausted");
}

function isDemoMode(): boolean {
  return KIS_RUNTIME_MODE !== "prod";
}

export async function getOverseasPrice(
  config: KISConfig,
  symbol: string,
  exchangeCode: "NAS" | "NYS" | "AMS",
  auth = "",
) {
  const params = new URLSearchParams({ AUTH: auth, EXCD: exchangeCode, SYMB: symbol });
  const trId = "HHDFS00000300";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${KIS_API_BASE}/uapi/overseas-price/v1/quotations/price?${params}`, {
      headers: headers(config, trId),
    });
    if (res.ok) return res.json();

    const { detail } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new Error(`KIS overseas price error: ${res.status} ${detail}`.trim());
  }

  throw new Error("KIS overseas price error: retry exhausted");
}

export async function getOverseasPriceDetail(
  config: KISConfig,
  symbol: string,
  exchangeCode: "NAS" | "NYS" | "AMS",
  auth = "",
) {
  const params = new URLSearchParams({ AUTH: auth, EXCD: exchangeCode, SYMB: symbol });
  const trId = "HHDFS76200200";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${KIS_API_BASE}/uapi/overseas-price/v1/quotations/price-detail?${params}`, {
      headers: headers(config, trId),
    });
    if (res.ok) return res.json();

    const { detail } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new Error(`KIS overseas price detail error: ${res.status} ${detail}`.trim());
  }

  throw new Error("KIS overseas price detail error: retry exhausted");
}

export async function getOverseasDailyPrices(
  config: KISConfig,
  symbol: string,
  exchangeCode: "NAS" | "NYS" | "AMS",
  params?: { auth?: string; gubn?: "0" | "1" | "2"; bymd?: string; modp?: "0" | "1" },
) {
  const query = new URLSearchParams({
    AUTH: params?.auth ?? "",
    EXCD: exchangeCode,
    SYMB: symbol,
    GUBN: params?.gubn ?? "0",
    BYMD: params?.bymd ?? "",
    MODP: params?.modp ?? "1",
  });
  const trId = "HHDFS76240000";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${KIS_API_BASE}/uapi/overseas-price/v1/quotations/dailyprice?${query}`, {
      headers: headers(config, trId),
    });
    if (res.ok) return res.json();

    const { detail } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new Error(`KIS overseas dailyprice error: ${res.status} ${detail}`.trim());
  }

  throw new Error("KIS overseas dailyprice error: retry exhausted");
}

export async function searchOverseasInfo(
  config: KISConfig,
  symbol: string,
  productTypeCode: "512" | "513" | "529",
) {
  const query = new URLSearchParams({ PRDT_TYPE_CD: productTypeCode, PDNO: symbol });
  const trId = "CTPF1702R";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${KIS_API_BASE}/uapi/overseas-price/v1/quotations/search-info?${query}`, {
      headers: headers(config, trId),
    });
    if (res.ok) return res.json();

    const { detail } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new Error(`KIS overseas search-info error: ${res.status} ${detail}`.trim());
  }

  throw new Error("KIS overseas search-info error: retry exhausted");
}

export async function getOverseasBalance(
  config: KISConfig,
  exchangeCode: "NASD" | "NYSE" | "AMEX" = "NASD",
  currencyCode = "USD",
) {
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  const query = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    OVRS_EXCG_CD: exchangeCode,
    TR_CRCY_CD: currencyCode,
    CTX_AREA_FK200: "",
    CTX_AREA_NK200: "",
  });
  const trId = isDemoMode() ? "VTTS3012R" : "TTTS3012R";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${KIS_API_BASE}/uapi/overseas-stock/v1/trading/inquire-balance?${query}`, {
      headers: headers(config, trId),
    });
    if (res.ok) return res.json();

    const { detail, kisCode } = await parseResponseDetail(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    throw new KISError(`KIS overseas balance error: ${res.status}`, res.status, detail || `HTTP ${res.status}`, kisCode);
  }

  throw new KISError("KIS overseas balance error: retry exhausted", 500, "해외 잔고 조회 재시도 실패");
}

export async function placeOverseasOrder(
  config: KISConfig,
  params: {
    side: "buy" | "sell";
    symbol: string;
    quantity: number;
    price: number;
    exchangeCode: "NASD" | "NYSE" | "AMEX";
    orderDiv: "00";
  },
) {
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  const trId = (() => {
    if (params.side === "buy") return isDemoMode() ? "VTTT1002U" : "TTTT1002U";
    return isDemoMode() ? "VTTT1006U" : "TTTT1006U";
  })();
  const body = {
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    OVRS_EXCG_CD: params.exchangeCode,
    PDNO: params.symbol,
    ORD_QTY: String(params.quantity),
    OVRS_ORD_UNPR: String(params.price),
    CTAC_TLNO: "",
    MGCO_APTM_ODNO: "",
    SLL_TYPE: params.side === "sell" ? "00" : "",
    ORD_SVR_DVSN_CD: "0",
    ORD_DVSN: params.orderDiv,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${KIS_API_BASE}/uapi/overseas-stock/v1/trading/order`, {
      method: "POST",
      headers: headers(config, trId),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { detail } = await parseResponseDetail(res);
      if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
        await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }
      throw new Error(`KIS overseas order error: ${res.status} ${detail}`.trim());
    }

    const data = await res.json();
    const message = `${data.msg1 || data.msg || ""}`;
    if (data.rt_cd === "0") return data;
    if (attempt === 0 && shouldRetryKisRequest(message)) {
      await sleep(shouldRetryRateLimit(message) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    return data;
  }

  throw new Error("KIS overseas order error: retry exhausted");
}
