// ─── 종목 필터 함수 ──────────────────────────────
import { KIS_API_BASE } from "@/lib/constants";
import { type EngineConfig, type FilterResult } from "./types";
import { headers } from "./kis";

const ONE_YEAR_MS = 366 * 86400000; // 366일 — 윤년 포함 1년 이상 보장
const EXTERNAL_FETCH_TIMEOUT_MS = 10_000;

const DANGER_KEYWORDS = [
  "유상증자", "전환사채", "신주인수권", "감사의견 거절", "감사의견 한정",
  "영업정지", "상장폐지", "횡령", "배임", "불성실공시",
];

// ─── DART 공시 필터 ──────────────────────────────
export async function hasDangerousDisclosure(code: string): Promise<{ danger: boolean; reason: string }> {
  const apiKey = process.env.DART_API_KEY;
  // DART_API_KEY 미설정 시 위험 공시 필터가 무력화됨 — Vercel 환경변수 등록 권장
  if (!apiKey) return { danger: false, reason: "" };
  try {
    // 최근 30일 공시 조회
    const endDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, "");
    const startDate = new Date(Date.now() + 9 * 3600000 - 30 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const params2 = new URLSearchParams({
      crtfc_key: apiKey,
      stock_code: code,
      bgn_de: startDate,
      end_de: endDate,
      page_count: "20",
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`https://opendart.fss.or.kr/api/list.json?${params2}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return { danger: false, reason: "" };
    const data = await res.json();
    if (data.status !== "000") return { danger: false, reason: "" };
    const disclosures: Array<{ report_nm: string }> = data.list || [];
    for (const d of disclosures) {
      const matched = DANGER_KEYWORDS.find((kw) => d.report_nm.includes(kw));
      if (matched) return { danger: true, reason: `공시: ${matched} (${d.report_nm.slice(0, 30)})` };
    }
    return { danger: false, reason: "" };
  } catch {
    return { danger: false, reason: "" };
  }
}

// ─── 종목 기본정보 (상장일) ──────────────────────
export async function getListingDate(config: EngineConfig, code: string): Promise<string> {
  try {
    const params = new URLSearchParams({ PDNO: code, PRDT_TYPE_CD: "300" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/search-stock-info?${params}`,
        { headers: headers(config, "CTPF1002R"), signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return "";
    const data = await res.json();
    return (data.output?.lstg_dt as string) || "";
  } catch {
    return "";
  }
}

// ─── 섹터 분산 필터 ──────────────────────────────
export function applySectorFilter(
  sector: string | null,
  sectorCounts: Map<string, number>,
  maxPerSector: number
): FilterResult {
  if (!sector || maxPerSector <= 0) return { passed: true, reason: "" };
  const count = sectorCounts.get(sector) ?? 0;
  if (count >= maxPerSector) {
    return { passed: false, reason: `섹터 제한 (${sector} ${count}/${maxPerSector})` };
  }
  return { passed: true, reason: "" };
}

// ─── 종목 필터 ───────────────────────────────────
export function applyStockFilter(priceData: Record<string, string>, listingDate: string): FilterResult {
  const reasons: string[] = [];

  // 1. 시장경고 정상만 허용 (00=정상, 01=주의, 02=경고, 03=위험)
  const warnCode = priceData.mrkt_warn_cls_code || "00";
  if (warnCode !== "00") {
    const warnLabel: Record<string, string> = { "01": "투자주의", "02": "투자경고", "03": "투자위험" };
    reasons.push(`시장경고(${warnLabel[warnCode] ?? warnCode})`);
  }

  // 3. 정리매매 종목 제외
  if (priceData.sltr_yn === "Y") {
    reasons.push("정리매매 종목");
  }

  // 4. 상장 1년 이상 (listingDate=YYYYMMDD, 조회 실패 시 스킵)
  if (listingDate.length === 8) {
    const listed = new Date(
      `${listingDate.slice(0, 4)}-${listingDate.slice(4, 6)}-${listingDate.slice(6, 8)}`,
    );
    const oneYearAgo = new Date(Date.now() - ONE_YEAR_MS);
    if (listed > oneYearAgo) {
      const months = Math.floor((Date.now() - listed.getTime()) / (30 * 86400000));
      reasons.push(`상장 ${months}개월 (1년 미만)`);
    }
  }

  return { passed: reasons.length === 0, reason: reasons.join(", ") };
}
