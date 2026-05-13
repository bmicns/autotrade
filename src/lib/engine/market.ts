// ─── 시장/투자자 동향 함수 ───────────────────────
import { KIS_API_BASE, KIS_TR } from "@/lib/constants";
import { KIS_RATE_LIMIT_DELAY_MS } from "./constants";
import { shouldRetryKisRequest, shouldRetryRateLimit } from "./kis-rate-limit";
import { type EngineConfig, type MarketTrend, type InvestorTrend, type SurgeScanDiagnostic, type SurgeScanMarketDiagnostic } from "./types";
import { headers } from "./kis";
import { MARKET_BONUS_STRONG, MARKET_BONUS_MILD, MARKET_PENALTY_MILD, MARKET_PENALTY_STRONG, INVESTOR_BONUS_BOTH, INVESTOR_BONUS_ORGN, INVESTOR_BONUS_FRGN, INVESTOR_PENALTY_BOTH, INVESTOR_PENALTY_ORGN, INVESTOR_PENALTY_FRGN } from "@/lib/engine/constants";

// ─── 시장 전체 지수 모멘텀 (B안: KOSPI + KOSDAQ) ────
export async function getMarketTrend(config: EngineConfig): Promise<MarketTrend> {
  const fallback: MarketTrend = { kospiRate: 0, kosdaqRate: 0, bonus: 0, label: "" };
  try {
    const fetchIndex = async (iscd: string) => {
      const params = new URLSearchParams({ fid_cond_mrkt_div_code: "U", fid_input_iscd: iscd });
      const res = await fetch(
        `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-index-price?${params}`,
        { headers: headers(config, "FHPUP02100000") },
      );
      if (!res.ok) return 0;
      const data = await res.json();
      return Number(data.output?.prdy_ctrt || 0);
    };

    const [kospiRate, kosdaqRate] = await Promise.all([
      fetchIndex("0001"),  // KOSPI
      fetchIndex("1001"),  // KOSDAQ
    ]);

    // 두 지수 평균으로 시장 방향 판단
    const avgRate = (kospiRate + kosdaqRate) / 2;

    let bonus = 0;
    let label = "";
    if (avgRate >= 1.0) {
      bonus = MARKET_BONUS_STRONG; label = `시장 강세 (KOSPI ${kospiRate.toFixed(1)}% KOSDAQ ${kosdaqRate.toFixed(1)}%)`;
    } else if (avgRate >= 0.3) {
      bonus = MARKET_BONUS_MILD;  label = `시장 상승 (KOSPI ${kospiRate.toFixed(1)}% KOSDAQ ${kosdaqRate.toFixed(1)}%)`;
    } else if (avgRate <= -1.0) {
      bonus = MARKET_PENALTY_STRONG; label = `시장 급락 (KOSPI ${kospiRate.toFixed(1)}% KOSDAQ ${kosdaqRate.toFixed(1)}%)`;
    } else if (avgRate <= -0.3) {
      bonus = MARKET_PENALTY_MILD; label = `시장 하락 (KOSPI ${kospiRate.toFixed(1)}% KOSDAQ ${kosdaqRate.toFixed(1)}%)`;
    }

    return { kospiRate, kosdaqRate, bonus, label };
  } catch {
    return fallback;
  }
}

// ─── 투자자별 매매동향 조회 (기관/외국인) ───────────
export async function getInvestorTrend(config: EngineConfig, code: string): Promise<InvestorTrend> {
  const fallback: InvestorTrend = { orgn: 0, frgn: 0, bonus: 0, label: "" };
  try {
    const today = new Date(Date.now() + 9 * 3600000);
    const end = today.toISOString().slice(0, 10).replace(/-/g, "");
    const start = new Date(today.getTime() - 5 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");

    const params = new URLSearchParams({
      fid_cond_mrkt_div_code: "J",
      fid_input_iscd: code,
      fid_input_date_1: start,
      fid_input_date_2: end,
    });
    const res = await fetch(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor?${params}`,
      { headers: headers(config, KIS_TR.INVESTOR_TREND) },
    );
    if (!res.ok) return fallback;

    const data = await res.json();
    const rows: Record<string, string>[] = data.output || [];
    if (rows.length === 0) return fallback;

    // 최근 3일 합산 (단위: 백만원 → 억원)
    const recent = rows.slice(0, 3);
    const orgn = recent.reduce((s, r) => s + (Number(r.orgn_ntby_tr_pbmn) || 0), 0) / 100;
    const frgn = recent.reduce((s, r) => s + (Number(r.frgn_ntby_tr_pbmn) || 0), 0) / 100;

    // 보너스 점수 계산
    let bonus = 0;
    let label = "";

    if (orgn > 0 && frgn > 0) {
      bonus = INVESTOR_BONUS_BOTH;
      label = `기관+외국인 동반매수 (기관 ${orgn.toFixed(0)}억, 외국인 ${frgn.toFixed(0)}억)`;
    } else if (orgn > 0) {
      bonus = INVESTOR_BONUS_ORGN;
      label = `기관 순매수 ${orgn.toFixed(0)}억`;
    } else if (frgn > 0) {
      bonus = INVESTOR_BONUS_FRGN;
      label = `외국인 순매수 ${frgn.toFixed(0)}억`;
    } else if (orgn < 0 && frgn < 0) {
      bonus = INVESTOR_PENALTY_BOTH;
      label = `기관+외국인 동반매도 (기관 ${orgn.toFixed(0)}억, 외국인 ${frgn.toFixed(0)}억)`;
    } else if (orgn < 0) {
      bonus = INVESTOR_PENALTY_ORGN;
      label = `기관 순매도 ${orgn.toFixed(0)}억`;
    } else if (frgn < 0) {
      bonus = INVESTOR_PENALTY_FRGN;
      label = `외국인 순매도 ${frgn.toFixed(0)}억`;
    }

    return { orgn, frgn, bonus, label };
  } catch {
    return fallback;
  }
}

// ─── 기관 순매수 상위 종목 스캔 ──────────────────
export interface InstitutionalCandidate {
  code: string;
  name: string;
  orgn: number;  // 기관 순매수 (억원)
  frgn: number;  // 외국인 순매수 (억원)
}

export async function scanInstitutionalBuys(
  config: EngineConfig,
  minAmountBillion = 50,
): Promise<InstitutionalCandidate[]> {
  const results: InstitutionalCandidate[] = [];

  for (const mkt of ["J", "Q"]) {
    try {
      const params = new URLSearchParams({
        fid_cond_mrkt_div_code: mkt,
        fid_cond_scr_div_code: "20232",
        fid_input_iscd: mkt === "J" ? "0001" : "1001",
        fid_rank_sort_cls_code: "0",   // 0=순매수 상위
        fid_input_cnt_1: "0",
        fid_input_cnt_2: "",
        fid_div_cls_code: "0",
        fid_trgt_cls_code: "0",
        fid_trgt_exls_cls_code: "0",
        fid_vol_cnt: "",
        fid_input_date_1: "",
      });
      const res = await fetch(
        `${KIS_API_BASE}/uapi/domestic-stock/v1/ranking/investor?${params}`,
        { headers: headers(config, KIS_TR.INST_RANKING) },
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.output || []).slice(0, 20)) {
        const code = item.mksc_shrn_iscd || item.stck_shrn_iscd;
        const name = item.hts_kor_isnm || code;
        const orgn = Number(item.orgn_ntby_tr_pbmn || 0) / 100;
        const frgn = Number(item.frgn_ntby_tr_pbmn || 0) / 100;
        if (code && orgn >= minAmountBillion) {
          results.push({ code, name, orgn, frgn });
        }
      }
    } catch { /* VTS 미지원 시 빈 결과 반환 */ }

    await new Promise((r) => setTimeout(r, 200));
  }

  // orgn 내림차순 정렬
  return results.sort((a, b) => b.orgn - a.orgn);
}

// ─── #6 급등주 탐색 (KOSPI + KOSDAQ) ────────────
export interface SurgeCandidate {
  code: string;
  name: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 120) : "unknown error";
}

function getKisMessage(payload: Record<string, unknown>, fallback: string): string {
  const raw = payload.msg1 ?? payload.msg ?? payload.error_description ?? payload.error;
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

function getKisCode(payload: Record<string, unknown>): string | undefined {
  const raw = payload.msg_cd ?? payload.error_code ?? payload.rt_cd ?? payload.error;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function formatKisPayloadError(payload: Record<string, unknown>, fallback: string): string {
  const code = getKisCode(payload);
  const message = getKisMessage(payload, fallback);
  return code ? `[${code}] ${message}` : message;
}

async function fetchRankingOutput(
  config: EngineConfig,
  path: string,
  trId: string,
  params: URLSearchParams,
): Promise<{ output: Record<string, string>[]; error?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${KIS_API_BASE}${path}?${params}`, {
        headers: headers(config, trId),
      });
      const text = await res.text();
      const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
      const detail = formatKisPayloadError(payload, `HTTP ${res.status}`);

      if (!res.ok) {
        if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
          await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
          continue;
        }
        return { output: [], error: detail };
      }

      const output = Array.isArray(payload.output)
        ? payload.output.filter((item): item is Record<string, string> => Boolean(item && typeof item === "object"))
        : [];

      if (output.length > 0) {
        return { output };
      }

      if (payload.rt_cd === "0" || payload.msg_cd === "OPSQ0000") {
        return { output: [] };
      }

      if (attempt === 0 && shouldRetryKisRequest(detail, res.status)) {
        await sleep(shouldRetryRateLimit(detail) ? KIS_RATE_LIMIT_DELAY_MS * 6 : KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }

      return { output: [], error: detail };
    } catch (error: unknown) {
      const detail = truncateErrorMessage(error);
      if (attempt === 0) {
        await sleep(KIS_RATE_LIMIT_DELAY_MS * 2);
        continue;
      }
      return { output: [], error: detail };
    }
  }

  return { output: [], error: "retry exhausted" };
}

export async function scanSurgeStocks(config: EngineConfig): Promise<{ candidates: SurgeCandidate[]; diagnostic: SurgeScanDiagnostic }> {
  const candidates = new Map<string, string>();
  const markets = [
    { diagnosticMarket: "J" as const, inputIscd: "0001" },
    { diagnosticMarket: "Q" as const, inputIscd: "1001" },
  ];
  const marketDiagnostics: SurgeScanMarketDiagnostic[] = [];

  for (const market of markets) {
    const marketDiagnostic: SurgeScanMarketDiagnostic = {
      market: market.diagnosticMarket,
      fluctuationCount: 0,
      volumeCount: 0,
    };
    // 등락률 상위
    try {
      const params = new URLSearchParams({
        fid_cond_mrkt_div_code: "J",
        fid_cond_scr_div_code: "20170",
        fid_input_iscd: market.inputIscd,
        fid_rank_sort_cls_code: "0", fid_input_cnt_1: "0", fid_input_cnt_2: "",
        fid_prc_cls_code: "1",
        fid_rsfl_rate1: "",
        fid_rsfl_rate2: "",
        fid_div_cls_code: "0", fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0",
        fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "", fid_input_date_1: "",
      });
      const result = await fetchRankingOutput(config, "/uapi/domestic-stock/v1/ranking/fluctuation", "FHPST01700000", params);
      if (result.error) {
        marketDiagnostic.fluctuationError = result.error;
      } else {
        for (const item of result.output.slice(0, 30)) {
          const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
          const name = item.hts_kor_isnm || code;
          if (code && (Number(item.prdy_ctrt) || 0) >= 1.5) {
            candidates.set(code, name);
            marketDiagnostic.fluctuationCount += 1;
          }
        }
      }
    } catch (error: unknown) {
      marketDiagnostic.fluctuationError = truncateErrorMessage(error);
    }

    await sleep(KIS_RATE_LIMIT_DELAY_MS);

    // 거래량 상위
    try {
      const params = new URLSearchParams({
        fid_cond_mrkt_div_code: "J",
        fid_cond_scr_div_code: "20171",
        fid_input_iscd: market.inputIscd,
        fid_div_cls_code: "0",
        fid_blng_cls_code: "0",
        fid_trgt_cls_code: "111111111",
        fid_trgt_exls_cls_code: "0000000000",
        fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "", fid_input_date_1: "",
      });
      const result = await fetchRankingOutput(config, "/uapi/domestic-stock/v1/quotations/volume-rank", "FHPST01710000", params);
      if (result.error) {
        marketDiagnostic.volumeError = result.error;
      } else {
        for (const item of result.output.slice(0, 25)) {
          const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
          const name = item.hts_kor_isnm || code;
          if (code) {
            candidates.set(code, name);
            marketDiagnostic.volumeCount += 1;
          }
        }
      }
    } catch (error: unknown) {
      marketDiagnostic.volumeError = truncateErrorMessage(error);
    }

    marketDiagnostics.push(marketDiagnostic);

    await sleep(KIS_RATE_LIMIT_DELAY_MS);
  }

  return {
    candidates: Array.from(candidates, ([code, name]) => ({ code, name })),
    diagnostic: {
      totalCandidates: candidates.size,
      marketDiagnostics,
    },
  };
}
