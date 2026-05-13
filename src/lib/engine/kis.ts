// ─── KIS API 호출 함수 ───────────────────────────
import { KIS_API_BASE, KIS_TR } from "@/lib/constants";
import type { MinuteCandle } from "@/lib/engine/intraday";
import { shouldRetryKisRequest, shouldRetryRateLimit } from "@/lib/engine/kis-rate-limit";
import { type DailyCandle } from "@/lib/kis/indicators";
import { resolveKisAccountParts } from "@/lib/kis/account";
import { type EngineConfig, type KISPriceOutput, type OpenOrder, type OrderResult, type PendingOrderFillStatus } from "./types";
import { KIS_RATE_LIMIT_DELAY_MS } from "./constants";

type KISCreds = Pick<EngineConfig, "appKey" | "appSecret" | "accountNo" | "accountProductCode" | "token">;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseOrderError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "응답 없음");
  return `HTTP ${res.status}: ${text.slice(0, 200)}`;
}

function getKisErrorCode(payload: Record<string, unknown>): string | undefined {
  const raw = payload.msg_cd ?? payload.error_code ?? payload.rt_cd ?? payload.error;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function getKisErrorMessage(payload: Record<string, unknown>): string | undefined {
  const raw = payload.msg1 ?? payload.msg ?? payload.error_description ?? payload.error;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function formatKisErrorDetail(payload: Record<string, unknown>, fallback: string): string {
  const code = getKisErrorCode(payload);
  const message = getKisErrorMessage(payload) ?? fallback;
  return code ? `[${code}] ${message}` : message;
}

function buildPriceErrorOutput(detail: string, meta?: { code?: string; status?: number }): KISPriceOutput {
  return {
    __error_message: detail.slice(0, 200),
    __error_code: meta?.code,
    __http_status: typeof meta?.status === "number" ? String(meta.status) : undefined,
  };
}

// ─── KIS API 유틸 ───────────────────────────────
export function headers(config: KISCreds, trId: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    authorization: `Bearer ${config.token}`,
    appkey: config.appKey, appsecret: config.appSecret, tr_id: trId,
  };
}

export async function getPrice(config: EngineConfig, code: string) {
  const params = new URLSearchParams({ fid_cond_mrkt_div_code: "J", fid_input_iscd: code });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`, {
        headers: headers(config, KIS_TR.PRICE),
      });

      if (!res.ok) {
        const detail = await parseOrderError(res);
        if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
          await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
          continue;
        }
        return buildPriceErrorOutput(detail, { status: res.status });
      }

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== "object") {
        if (attempt === 0) {
          await sleep(KIS_RATE_LIMIT_DELAY_MS * 2);
          continue;
        }
        return buildPriceErrorOutput("현재가 응답 파싱 실패");
      }

      const payload = data as Record<string, unknown>;
      const output = payload.output;
      const outputRecord = output && typeof output === "object" ? output as KISPriceOutput : null;
      if (outputRecord) {
        const price = Number(outputRecord.stck_prpr) || 0;
        if (price > 0 || outputRecord.hts_kor_isnm || outputRecord.bstp_kor_isnm) return outputRecord;
      }

      const detail = formatKisErrorDetail(payload, "현재가 응답에 유효한 시세가 없음");
      if (attempt === 0) {
        await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }

      return {
        ...(outputRecord ?? {}),
        ...buildPriceErrorOutput(detail, { code: getKisErrorCode(payload) }),
      };
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "현재가 조회 네트워크 오류";
      if (attempt === 0) {
        await sleep(KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }
      return buildPriceErrorOutput(detail);
    }
  }

  return buildPriceErrorOutput("현재가 재조회 실패");
}

export async function getDailyCandles(config: EngineConfig, code: string): Promise<DailyCandle[]> {
  const params = new URLSearchParams({
    fid_cond_mrkt_div_code: "J", fid_input_iscd: code,
    fid_input_date_1: "", fid_input_date_2: "",
    fid_period_div_code: "D", fid_org_adj_prc: "0",
  });
  const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`, {
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
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  const params = new URLSearchParams({
    CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: "N", OFL_YN: "", INQR_DVSN: "02", UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N", FNCG_AMT_AUTO_RDPT_YN: "N", PRCS_DVSN: "00",
    CTX_AREA_FK100: "", CTX_AREA_NK100: "",
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`, {
      headers: headers(config, KIS_TR.BALANCE),
    });
    if (res.ok) return res.json();

    const detail = await parseOrderError(res);
    if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
      await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
      continue;
    }
    return null;
  }

  return null;
}

export async function executeOrder(config: EngineConfig, trId: string, code: string, qty: number): Promise<OrderResult> {
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
        method: "POST", headers: headers(config, trId),
        body: JSON.stringify({ CANO: cano, ACNT_PRDT_CD: acntPrdtCd, PDNO: code, ORD_DVSN: "01", ORD_QTY: String(qty), ORD_UNPR: "0" }),
      });

      if (!res.ok) {
        const detail = await parseOrderError(res);
        if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
          await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
          continue;
        }
        return { success: false, msg: detail };
      }

      const data = await res.json();
      const rtCd = data.rt_cd;  // "0" = 성공
      const msg = data.msg1 || data.msg || "응답 없음";

      if (rtCd === "0") {
        return { success: true, msg, ordNo: data.output?.ODNO, raw: data };
      }

      const detail = `[${rtCd}] ${msg}`;
      if (attempt === 0 && shouldRetryKisRequest(detail)) {
        await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }
      return { success: false, msg: detail, raw: data };
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "네트워크 오류";
    return { success: false, msg: errMsg };
  }

  return { success: false, msg: "주문 재시도 실패" };
}

export async function sellOrder(config: EngineConfig, code: string, qty: number): Promise<OrderResult> {
  return executeOrder(config, KIS_TR.SELL, code, qty);
}

export async function buyOrder(config: EngineConfig, code: string, qty: number): Promise<OrderResult> {
  return executeOrder(config, KIS_TR.BUY, code, qty);
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

// ─── 지정가 매수 (현재가 -0.2%) ─────────────────
export async function limitBuyOrder(config: EngineConfig, code: string, qty: number, currentPrice: number): Promise<OrderResult & { limitPrice: number }> {
  const limitPrice = roundToTick(currentPrice * 0.998);
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  try {
    // Current-price lookup often happens immediately before the order call.
    await sleep(KIS_RATE_LIMIT_DELAY_MS);
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
        method: "POST", headers: headers(config, KIS_TR.BUY),
        body: JSON.stringify({
          CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
          PDNO: code, ORD_DVSN: "00",          // 지정가
          ORD_QTY: String(qty), ORD_UNPR: String(limitPrice),
        }),
      });
      if (!res.ok) {
        const detail = await parseOrderError(res);
        if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
          await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
          continue;
        }
        return { success: false, msg: detail, limitPrice };
      }

      const data = await res.json();
      if (data.rt_cd === "0") {
        return { success: true, msg: data.msg1 || "성공", ordNo: data.output?.ODNO, raw: data, limitPrice };
      }

      const msg = `[${data.rt_cd}] ${data.msg1 || data.msg}`;
      if (attempt === 0 && shouldRetryKisRequest(msg)) {
        await sleep(shouldRetryRateLimit(msg) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }
      return { success: false, msg, raw: data, limitPrice };
    }
  } catch (e: unknown) {
    return { success: false, msg: e instanceof Error ? e.message : "네트워크 오류", limitPrice };
  }

  return { success: false, msg: "주문 재시도 실패", limitPrice };
}

// ─── 주문 체결 여부 확인 ─────────────────────────
export async function checkOrderFill(
  config: EngineConfig,
  orderNo: string,
  stockCode: string,
): Promise<PendingOrderFillStatus> {
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  try {
    const params = new URLSearchParams({
      CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
      INQR_STRT_DT: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
      INQR_END_DT: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
      SLL_BUY_DVSN_CD: "02",   // 매수
      INQR_DVSN: "00",
      PDNO: stockCode,
      CCLD_DVSN: "01",          // 체결
      ORD_GNO_BRNO: "", ODNO: orderNo,
      INQR_DVSN_3: "", INQR_DVSN_1: "",
      CTX_AREA_FK100: "", CTX_AREA_NK100: "",
    });
    const res = await fetch(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/trading/inquire-ccnl?${params}`,
      { headers: headers(config, "VTTC8001R") },
    );
    if (!res.ok) {
      return { status: "error", filledQty: 0, remainingQty: 0, filledPrice: 0, detail: await parseOrderError(res) };
    }
    const data = await res.json();
    const output = (data.output || []) as Record<string, string>[];
    const matched = output.filter((o) => o.odno === orderNo || o.orgn_odno === orderNo);
    const totalFilled = matched.reduce((s, o) => s + (Number(o.tot_ccld_qty) || Number(o.ccld_qty) || 0), 0);
    const filledPrice = matched.length > 0 ? (Number(matched[0].avg_prvs) || Number(matched[0].ccld_unpr) || 0) : 0;
    const openOrders = await getOpenBuyOrders(config);
    const openOrder = openOrders.find((order) => order.odno === orderNo || order.orgn_odno === orderNo);
    const remainingQty = Number(openOrder?.rmn_qty) || 0;
    if (totalFilled > 0 && remainingQty > 0) {
      return {
        status: "partial",
        filledQty: totalFilled,
        remainingQty,
        filledPrice,
        detail: `부분체결 ${totalFilled}주, 잔여 ${remainingQty}주`,
      };
    }
    if (totalFilled > 0) {
      return {
        status: "filled",
        filledQty: totalFilled,
        remainingQty: 0,
        filledPrice,
        detail: `전량체결 ${totalFilled}주`,
      };
    }
    if (remainingQty > 0) {
      return {
        status: "open",
        filledQty: 0,
        remainingQty,
        filledPrice: 0,
        detail: `미체결 잔여 ${remainingQty}주`,
      };
    }
    return {
      status: "not_found",
      filledQty: 0,
      remainingQty: 0,
      filledPrice: 0,
      detail: "체결/미체결 조회 결과 없음",
    };
  } catch {
    return { status: "error", filledQty: 0, remainingQty: 0, filledPrice: 0, detail: "체결 조회 실패" };
  }
}

// ─── 분봉 조회 (VWAP / Volume Profile 계산용) ────
export async function getMinuteCandles(config: EngineConfig, code: string): Promise<MinuteCandle[]> {
  const params = new URLSearchParams({
    fid_cond_mrkt_div_code: "J",
    fid_input_iscd: code,
    fid_input_hour_1: "090000",
    fid_etc_cls_code: "",
    fid_pw_data_incu_yn: "Y",
  });
  const res = await fetch(
    `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice?${params}`,
    { headers: headers(config, KIS_TR.MINUTE_CHART) },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.output2 || []) as Record<string, string>[])
    .map((d) => ({
      time:   d.stck_cntg_hour ?? "",
      close:  Number(d.stck_prpr)  || 0,
      high:   Number(d.stck_hgpr)  || 0,
      low:    Number(d.stck_lwpr)  || 0,
      volume: Number(d.cntg_vol)   || 0,
    }))
    .filter((c) => c.close > 0 && c.volume > 0);
}

// ─── 미체결 매수 주문 조회 ───────────────────────
export async function getOpenBuyOrders(config: KISCreds): Promise<OpenOrder[]> {
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  try {
    const params = new URLSearchParams({
      CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
      CTX_AREA_FK100: "", CTX_AREA_NK100: "",
      INQR_DVSN_1: "", INQR_DVSN_2: "0",
      PRDT_TYPE_CD: "300", SLL_BUY_DVSN_CD: "02",  // 02=매수
    });
    const res = await fetch(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl?${params}`,
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
export async function cancelOpenBuyOrders(config: KISCreds): Promise<{ cancelled: number; failed: number }> {
  const orders = await getOpenBuyOrders(config);
  let cancelled = 0, failed = 0;
  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);

  for (const ord of orders) {
    const rmn = Number(ord.rmn_qty || 0);
    if (rmn <= 0) continue;
    try {
      const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/trading/order-rvsecncl`, {
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
    await new Promise((r) => setTimeout(r, KIS_RATE_LIMIT_DELAY_MS));
  }
  return { cancelled, failed };
}

export async function cancelBuyOrder(
  config: KISCreds,
  orderNo: string,
): Promise<OrderResult & { remainingQty?: number | null }> {
  const orders = await getOpenBuyOrders(config);
  const target = orders.find((ord) => ord.odno === orderNo || ord.orgn_odno === orderNo);
  if (!target) {
    return { success: false, msg: "취소 대상 미체결 주문 없음", remainingQty: 0 };
  }

  const rmn = Number(target.rmn_qty || 0);
  if (rmn <= 0) {
    return { success: false, msg: "잔여 수량 없음", remainingQty: 0 };
  }

  const { cano, productCode: acntPrdtCd } = resolveKisAccountParts(config.accountNo, config.accountProductCode);
  try {
    const res = await fetch(`${KIS_API_BASE}/uapi/domestic-stock/v1/trading/order-rvsecncl`, {
      method: "POST",
      headers: headers(config, KIS_TR.CANCEL),
      body: JSON.stringify({
        CANO: cano,
        ACNT_PRDT_CD: acntPrdtCd,
        KRX_FWDG_ORD_ORGNO: target.ord_gno_brno,
        ORGN_ODNO: target.odno,
        ORD_DVSN: "00",
        RVSE_CNCL_DVSN_CD: "02",
        ORD_QTY: String(rmn),
        ORD_UNPR: "0",
        QTY_ALL_ORD_YN: "Y",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data as Record<string, string>).rt_cd === "0") {
      return { success: true, msg: String((data as Record<string, string>).msg1 || "취소 성공"), ordNo: target.odno, raw: data, remainingQty: rmn };
    }
    return {
      success: false,
      msg: formatKisErrorDetail(data as Record<string, unknown>, "취소 실패"),
      raw: data as Record<string, unknown>,
      remainingQty: rmn,
    };
  } catch (error: unknown) {
    return {
      success: false,
      msg: error instanceof Error ? error.message : "취소 네트워크 오류",
      remainingQty: rmn,
    };
  }
}
