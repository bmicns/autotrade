// ─── KIS API 호출 함수 ───────────────────────────
import { KIS_VTS_BASE, KIS_TR } from "@/lib/constants";
import { type DailyCandle } from "@/lib/kis/indicators";
import { type EngineConfig, type OrderResult, type OpenOrder } from "./types";

// ─── KIS API 유틸 ───────────────────────────────
export function headers(config: EngineConfig, trId: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    authorization: `Bearer ${config.token}`,
    appkey: config.appKey, appsecret: config.appSecret, tr_id: trId,
  };
}

export async function getPrice(config: EngineConfig, code: string) {
  const params = new URLSearchParams({ fid_cond_mrkt_div_code: "J", fid_input_iscd: code });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`, {
    headers: headers(config, KIS_TR.PRICE),
  });
  if (!res.ok) return null;
  return (await res.json()).output;
}

export async function getDailyCandles(config: EngineConfig, code: string): Promise<DailyCandle[]> {
  const params = new URLSearchParams({
    fid_cond_mrkt_div_code: "J", fid_input_iscd: code,
    fid_input_date_1: "", fid_input_date_2: "",
    fid_period_div_code: "D", fid_org_adj_prc: "0",
  });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`, {
    headers: headers(config, "FHKST03010100"),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.output2 || []).map((d: Record<string, string>) => ({
    date: d.stck_bsop_date, close: Number(d.stck_clpr) || 0,
    open: Number(d.stck_oprc) || 0, high: Number(d.stck_hgpr) || 0,
    low: Number(d.stck_lwpr) || 0, volume: Number(d.acml_vol) || 0,
  })).reverse();
}

export async function getBalance(config: EngineConfig) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const params = new URLSearchParams({
    CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: "N", OFL_YN: "", INQR_DVSN: "02", UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N", FNCG_AMT_AUTO_RDPT_YN: "N", PRCS_DVSN: "00",
    CTX_AREA_FK100: "", CTX_AREA_NK100: "",
  });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`, {
    headers: headers(config, KIS_TR.BALANCE),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function executeOrder(config: EngineConfig, trId: string, code: string, qty: number, side: "buy" | "sell"): Promise<OrderResult> {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  try {
    const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
      method: "POST", headers: headers(config, trId),
      body: JSON.stringify({ CANO: cano, ACNT_PRDT_CD: acntPrdtCd, PDNO: code, ORD_DVSN: "01", ORD_QTY: String(qty), ORD_UNPR: "0" }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "응답 없음");
      return { success: false, msg: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    const rtCd = data.rt_cd;  // "0" = 성공
    const msg = data.msg1 || data.msg || "응답 없음";

    if (rtCd === "0") {
      return { success: true, msg, ordNo: data.output?.ODNO, raw: data };
    }
    return { success: false, msg: `[${rtCd}] ${msg}`, raw: data };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "네트워크 오류";
    return { success: false, msg: errMsg };
  }
}

export async function sellOrder(config: EngineConfig, code: string, qty: number): Promise<OrderResult> {
  return executeOrder(config, KIS_TR.SELL, code, qty, "sell");
}

export async function buyOrder(config: EngineConfig, code: string, qty: number): Promise<OrderResult> {
  return executeOrder(config, KIS_TR.BUY, code, qty, "buy");
}

// ─── 호가 단위 반올림 (KRX 기준) ────────────────
export function roundToTick(price: number): number {
  if (price < 1000)    return Math.round(price);
  if (price < 5000)    return Math.round(price / 5) * 5;
  if (price < 10000)   return Math.round(price / 10) * 10;
  if (price < 50000)   return Math.round(price / 50) * 50;
  if (price < 100000)  return Math.round(price / 100) * 100;
  if (price < 500000)  return Math.round(price / 500) * 500;
  return Math.round(price / 1000) * 1000;
}

// ─── 지정가 매수 (현재가 -0.5%) ─────────────────
export async function limitBuyOrder(config: EngineConfig, code: string, qty: number, currentPrice: number): Promise<OrderResult & { limitPrice: number }> {
  const limitPrice = roundToTick(currentPrice * 0.995);
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  try {
    const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
      method: "POST", headers: headers(config, KIS_TR.BUY),
      body: JSON.stringify({
        CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
        PDNO: code, ORD_DVSN: "00",          // 지정가
        ORD_QTY: String(qty), ORD_UNPR: String(limitPrice),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "응답 없음");
      return { success: false, msg: `HTTP ${res.status}: ${text.slice(0, 200)}`, limitPrice };
    }
    const data = await res.json();
    if (data.rt_cd === "0") {
      return { success: true, msg: data.msg1 || "성공", ordNo: data.output?.ODNO, raw: data, limitPrice };
    }
    return { success: false, msg: `[${data.rt_cd}] ${data.msg1 || data.msg}`, raw: data, limitPrice };
  } catch (e: unknown) {
    return { success: false, msg: e instanceof Error ? e.message : "네트워크 오류", limitPrice };
  }
}

// ─── 미체결 매수 주문 조회 ───────────────────────
export async function getOpenBuyOrders(config: EngineConfig): Promise<OpenOrder[]> {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  try {
    const params = new URLSearchParams({
      CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
      CTX_AREA_FK100: "", CTX_AREA_NK100: "",
      INQR_DVSN_1: "", INQR_DVSN_2: "0",
      PRDT_TYPE_CD: "300", SLL_BUY_DVSN_CD: "02",  // 02=매수
    });
    const res = await fetch(
      `${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl?${params}`,
      { headers: headers(config, KIS_TR.OPEN_ORDERS) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.output || []) as OpenOrder[];
  } catch {
    return [];
  }
}

// ─── 미체결 주문 취소 ────────────────────────────
export async function cancelOpenBuyOrders(config: EngineConfig): Promise<{ cancelled: number; failed: number }> {
  const orders = await getOpenBuyOrders(config);
  let cancelled = 0, failed = 0;
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];

  for (const ord of orders) {
    const rmn = Number(ord.rmn_qty || 0);
    if (rmn <= 0) continue;
    try {
      const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-rvsecncl`, {
        method: "POST", headers: headers(config, KIS_TR.CANCEL),
        body: JSON.stringify({
          CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
          KRX_FWDG_ORD_ORGNO: ord.ord_gno_brno,
          ORGN_ODNO: ord.odno,
          ORD_DVSN: "00", RVSE_CNCL_DVSN_CD: "02",  // 취소
          ORD_QTY: String(rmn), ORD_UNPR: "0", QTY_ALL_ORD_YN: "Y",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as Record<string, string>).rt_cd === "0") cancelled++;
      else failed++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { cancelled, failed };
}
