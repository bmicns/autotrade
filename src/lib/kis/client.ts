// 클라이언트에서 Next.js API Routes를 통해 KIS 데이터 조회

import type { KISConfig } from "@/lib/store";

interface StockPrice {
  code: string;
  name: string;
  market: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

interface BalanceItem {
  code: string;
  name: string;
  market: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlRate: number;
}

interface BalanceResult {
  holdings: BalanceItem[];
  totalEval: number;
  totalPnl: number;
  totalPnlRate: number;
  cashBalance: number;
}

// 현재가 조회
export async function fetchPrice(config: KISConfig, stockCode: string): Promise<StockPrice | null> {
  try {
    const res = await fetch("/api/kis/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: stockCode,
        appKey: config.appKey,
        appSecret: config.appSecret,
        token: config.token || "",
        accountNo: config.accountNo,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const o = data.output;
    if (!o) return null;
    return {
      code: stockCode,
      name: o.hts_kor_isnm || stockCode,
      market: o.rprs_mrkt_kor_name || "KOSPI",
      price: Number(o.stck_prpr) || 0,
      change: Number(o.prdy_vrss) || 0,
      changeRate: Number(o.prdy_ctrt) || 0,
      volume: Number(o.acml_vol) || 0,
      high: Number(o.stck_hgpr) || 0,
      low: Number(o.stck_lwpr) || 0,
      open: Number(o.stck_oprc) || 0,
    };
  } catch {
    return null;
  }
}

// 여러 종목 시세 일괄 조회
export async function fetchPrices(config: KISConfig, codes: string[]): Promise<Map<string, StockPrice>> {
  const map = new Map<string, StockPrice>();
  // KIS API는 초당 호출 제한이 있어서 순차 호출 + 딜레이
  for (const code of codes) {
    const p = await fetchPrice(config, code);
    if (p) map.set(code, p);
    // 초당 20회 제한 방지
    if (codes.length > 1) await new Promise((r) => setTimeout(r, 100));
  }
  return map;
}

// 잔고 조회
export async function fetchBalance(config: KISConfig): Promise<BalanceResult | null> {
  try {
    const res = await fetch("/api/kis/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appKey: config.appKey,
        appSecret: config.appSecret,
        token: config.token || "",
        accountNo: config.accountNo,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const output1 = data.output1 || []; // 보유 종목 리스트
    const output2 = data.output2?.[0] || {}; // 계좌 요약

    const holdings: BalanceItem[] = output1.map((item: Record<string, string>) => ({
      code: item.pdno || "",
      name: item.prdt_name || "",
      market: "KOSPI",
      quantity: Number(item.hldg_qty) || 0,
      avgPrice: Number(item.pchs_avg_pric) || 0,
      currentPrice: Number(item.prpr) || 0,
      pnl: Number(item.evlu_pfls_amt) || 0,
      pnlRate: Number(item.evlu_pfls_rt) || 0,
    })).filter((h: BalanceItem) => h.quantity > 0);

    const cash = Number(output2.dnca_tot_amt) || Number(output2.nxdy_excc_amt) || 0;
    // tot_evlu_amt = 주식+예수금 합계. 장 마감 후 0일 수 있으므로 nass_amt → cash 순으로 fallback
    const totalAsset = Number(output2.tot_evlu_amt) || Number(output2.nass_amt) || cash;
    const pnlTotal = Number(output2.evlu_pfls_smtl_amt) || 0;
    const assetChangeRate = Number(output2.asst_icdc_erng_rt) || 0;

    return {
      holdings,
      totalEval: totalAsset,
      totalPnl: pnlTotal,
      totalPnlRate: assetChangeRate,
      cashBalance: cash,
    };
  } catch {
    return null;
  }
}
