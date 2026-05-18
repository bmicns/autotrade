import type { KISApiErrorContext } from "@/lib/engine/types";
import { supabase } from "@/lib/supabase/api-client";
import { shouldSendAlert } from "@/lib/engine/alert-dedupe";
import { getStrategyLabel } from "@/lib/nexio-display";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TG_URL = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` : "";
const TELEGRAM_FETCH_TIMEOUT_MS = 8_000;

async function sendMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_FETCH_TIMEOUT_MS);
    try {
      await fetch(TG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch { /* 알림 실패가 엔진 실행에 영향 주지 않음 */ }
}

export function priorityTag(priority: "P1" | "P2" | "P3"): string {
  if (priority === "P1") return "🔴 P1";
  if (priority === "P2") return "🟠 P2";
  return "🔵 P3";
}

export interface TradeAlertParams {
  type: "buy" | "sell" | "stop_loss" | "trailing_stop" | "max_hold_sell" | "surge_buy";
  code: string;
  name: string;
  qty: number;
  price: number;
  score?: number;
  pnlPct?: number;
  strategyKey?: string;
  regime?: string;
}

const REGIME_LABELS: Record<string, string> = {
  trending: "추세장",
  ranging: "횡보장",
};

export async function sendTradeAlert(params: TradeAlertParams): Promise<void> {
  const { type, code, name, qty, price, score, pnlPct, strategyKey, regime } = params;

  const typeLabel: Record<string, string> = {
    buy: "🟢 매수 체결",
    surge_buy: "🚀 급등주 매수",
    sell: "🔵 매도 체결",
    stop_loss: "🔴 손절 매도",
    trailing_stop: "📉 트레일링 청산",
    max_hold_sell: "⏱ 비수익 기간청산",
  };

  const lines = [
    `<b>[NEXIO] ${priorityTag(type === "stop_loss" ? "P1" : type === "trailing_stop" || type === "max_hold_sell" ? "P2" : "P3")} ${typeLabel[type] ?? type}</b>`,
    `종목: ${name} (${code})`,
    `수량: ${qty}주 @ ${price.toLocaleString()}원`,
  ];
  if (score !== undefined) lines.push(`점수: ${score}점`);
  if (pnlPct !== undefined) lines.push(`손익: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`);
  const tags: string[] = [];
  if (strategyKey) tags.push(getStrategyLabel(strategyKey));
  if (regime) tags.push(REGIME_LABELS[regime] ?? regime);
  if (tags.length > 0) lines.push(`태그: ${tags.join(" · ")}`);

  await sendMessage(lines.join("\n"));
}

export async function sendManualBuyQueuedAlert(params: {
  items: Array<{ code: string; name: string; qty: number }>;
  skippedCodes?: string[];
}): Promise<void> {
  if (params.items.length === 0) return;

  const lines = [
    `<b>[NEXIO] ${priorityTag("P3")} 강제매수 등록</b>`,
    `등록 종목: ${params.items.length}건`,
  ];
  for (const item of params.items.slice(0, 5)) {
    lines.push(`• ${item.name} (${item.code}) · ${item.qty.toLocaleString()}주`);
  }
  if (params.items.length > 5) {
    lines.push(`외 ${params.items.length - 5}건`);
  }
  if ((params.skippedCodes?.length ?? 0) > 0) {
    lines.push(`중복/보유로 제외: ${params.skippedCodes!.join(", ")}`);
  }

  await sendMessage(lines.join("\n"));
}

export async function sendBulkBuyAlert(params: {
  approved: Array<{ code: string; name: string; qty: number }>;
  failed: Array<{ code: string; name: string; detail: string }>;
}): Promise<void> {
  const total = params.approved.length + params.failed.length;
  if (total === 0) return;

  const lines = [
    `<b>[NEXIO] ${priorityTag(params.failed.length > 0 ? "P2" : "P3")} 일괄매수 실행</b>`,
    `성공: ${params.approved.length}건 / 재시도대기: ${params.failed.length}건`,
  ];
  for (const item of params.approved.slice(0, 5)) {
    lines.push(`🟢 ${item.name} (${item.code}) · ${item.qty.toLocaleString()}주`);
  }
  for (const item of params.failed.slice(0, 3)) {
    lines.push(`🟠 ${item.name} (${item.code}) · ${item.detail.slice(0, 60)}`);
  }
  if (params.approved.length > 5) {
    lines.push(`성공 추가 ${params.approved.length - 5}건`);
  }
  if (params.failed.length > 3) {
    lines.push(`재시도대기 추가 ${params.failed.length - 3}건`);
  }

  await sendMessage(lines.join("\n"));
}

export async function sendBulkApproveAlert(params: {
  approved: Array<{ code: string; name: string; qty: number }>;
}): Promise<void> {
  if (params.approved.length === 0) return;

  const lines = [
    `<b>[NEXIO] ${priorityTag("P3")} 일괄 승인 완료</b>`,
    `승인 종목: ${params.approved.length}건`,
  ];
  for (const item of params.approved.slice(0, 5)) {
    lines.push(`• ${item.name} (${item.code}) · ${item.qty.toLocaleString()}주`);
  }
  if (params.approved.length > 5) {
    lines.push(`외 ${params.approved.length - 5}건`);
  }
  lines.push("→ 다음 엔진 사이클에서 승인 매수 흐름으로 처리됩니다.");

  await sendMessage(lines.join("\n"));
}

export interface DailyReportParams {
  date: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  realizedPnlAmt: number;
  realizedPnlPct: number;
  openPositions: number;
  engineRuns: number;
  scannedCount: number;
  details: Array<{ name: string; code: string; pnlAmt: number; pnlPct: number; reason: string }>;
}

export async function sendDailyReport(params: DailyReportParams): Promise<void> {
  const { date, tradeCount, buyCount, sellCount, realizedPnlAmt, realizedPnlPct, openPositions, engineRuns, scannedCount, details } = params;

  const sign = realizedPnlAmt >= 0 ? "+" : "";
  const lines = [
    `<b>[NEXIO] ${priorityTag("P3")} 일일 리포트 — ${date}</b>`,
    `━━━━━━━━━━━━━━━━`,
    `거래: ${tradeCount}건 (매수 ${buyCount} / 매도 ${sellCount})`,
    `실현손익: ${sign}${realizedPnlAmt.toLocaleString()}원 (${sign}${realizedPnlPct.toFixed(2)}%)`,
    `보유중: ${openPositions}종목`,
    `엔진실행: ${engineRuns}회 / 스캔: ${scannedCount}종목`,
  ];

  if (details.length > 0) {
    lines.push(`━━━━━━━━━━━━━━━━`);
    for (const d of details) {
      const s = d.pnlAmt >= 0 ? "+" : "";
      lines.push(`${d.name}: ${s}${d.pnlAmt.toLocaleString()}원 (${s}${d.pnlPct.toFixed(1)}%) [${d.reason}]`);
    }
  }

  if (tradeCount === 0) lines.push(`\n오늘 거래 없음`);

  await sendMessage(lines.join("\n"));
}

async function sendDedupedMessage(params: {
  dedupeKey: string;
  text: string;
  cooldownMinutes: number;
}): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;

  try {
    const appKey = `alert_dedupe:${params.dedupeKey}`;
    const { data } = await supabase.from("app_config").select("value").eq("key", appKey).maybeSingle();
    const lastSentAt = typeof data?.value === "string" ? data.value : null;
    if (!shouldSendAlert({ lastSentAt, cooldownMinutes: params.cooldownMinutes })) return;

    await sendMessage(params.text);
    const now = new Date().toISOString();
    await supabase.from("app_config").upsert({
      key: appKey,
      value: now,
      updated_at: now,
    });
  } catch {
    await sendMessage(params.text);
  }
}

export async function sendEngineErrorAlert(msg: string, durationMs: number, topAlert?: { priority?: "P1" | "P2" | "P3" | null; headline?: string | null }): Promise<void> {
  const kstNow = new Date(Date.now() + 9 * 3600000);
  const timeStr = kstNow.toISOString().slice(11, 16);
  const lines = [
    `<b>[NEXIO] ${priorityTag("P1")} 엔진 오류 발생</b>`,
    `시각: ${timeStr} KST`,
    `오류: ${msg.slice(0, 200)}`,
    `실행시간: ${(durationMs / 1000).toFixed(1)}s`,
  ];
  if (topAlert?.headline) {
    lines.push(`최우선 위험: ${topAlert.headline}`);
  }
  lines.push(`→ 다음 크론에서 자동 재시도`);
  await sendDedupedMessage({
    dedupeKey: `engine-error:${(topAlert?.headline ?? msg).slice(0, 80)}`,
    text: lines.join("\n"),
    cooldownMinutes: 15,
  });
}

export async function sendMarketCloseAlert(cancelled: number, failed: number, mismatches: string[]): Promise<void> {
  const lines = [
    `<b>[NEXIO] ${priorityTag("P2")} 장 마감 정산</b>`,
    `미체결 취소: ${cancelled}건 완료${failed > 0 ? ` / ${failed}건 실패` : ""}`,
  ];
  if (mismatches.length > 0) {
    lines.push(`⚠️ 포지션 불일치: ${mismatches.join(", ")}`);
  } else {
    lines.push(`포지션 정합: 이상 없음`);
  }
  await sendMessage(lines.join("\n"));
}

// KIS API 에러 발생 시 — 서버 API route에서만 호출. 비밀키/토큰 절대 포함 금지.
export async function sendKISApiErrorAlert(ctx: KISApiErrorContext): Promise<void> {
  const opLabel: Record<string, string> = {
    token: "토큰 발급", balance: "잔고 조회", order: "주문", price: "시세 조회",
  };
  const kstNow = new Date(Date.now() + 9 * 3600000);
  const timeStr = kstNow.toISOString().slice(11, 16);
  const lines = [
    `<b>[NEXIO] ${priorityTag(ctx.operation === "order" || ctx.operation === "token" ? "P1" : "P2")} KIS API 오류</b>`,
    `작업: ${opLabel[ctx.operation] ?? ctx.operation}`,
    `시각: ${timeStr} KST`,
  ];
  if (ctx.httpStatus !== undefined) lines.push(`HTTP: ${ctx.httpStatus}`);
  if (ctx.kisCode) lines.push(`코드: ${ctx.kisCode}`);
  if (ctx.kisMessage) lines.push(`메시지: ${ctx.kisMessage.slice(0, 200)}`);
  await sendDedupedMessage({
    dedupeKey: `kis-api:${ctx.operation}:${ctx.kisCode ?? ctx.httpStatus ?? "unknown"}`,
    text: lines.join("\n"),
    cooldownMinutes: 10,
  });
}

// 연결 상태 변화 시 — /api/kis/health에서만 호출
export async function sendKISConnectionAlert(type: "disconnected" | "reconnected"): Promise<void> {
  const kstNow = new Date(Date.now() + 9 * 3600000);
  const timeStr = kstNow.toISOString().slice(11, 16);
  const label = type === "disconnected" ? "🔴 KIS 연결 끊김" : "🟢 KIS 재연결";
  await sendDedupedMessage({
    dedupeKey: `kis-connection:${type}`,
    text: [`<b>[NEXIO] ${priorityTag(type === "disconnected" ? "P1" : "P2")} ${label}</b>`, `시각: ${timeStr} KST`].join("\n"),
    cooldownMinutes: type === "disconnected" ? 15 : 5,
  });
}

export async function sendHoldingNewsRiskAlert(params: {
  items: Array<{ code: string; name: string; headlines: string[] }>;
  noteWarnings?: Array<{
    note: string;
    completionRate: number;
    residualExposure: number;
    recentStocks?: Array<{ stockCode: string; market: string; side: string; runAt: string }>;
  }>;
}): Promise<void> {
  if (params.items.length === 0 && (params.noteWarnings?.length ?? 0) === 0) return;
  const lines = [
    `<b>[NEXIO] ${priorityTag("P2")} 보유 종목 뉴스 리스크</b>`,
    `감지 종목: ${params.items.length}개`,
  ];
  for (const item of params.items.slice(0, 5)) {
    lines.push(`${item.name} (${item.code})`);
    for (const headline of item.headlines.slice(0, 2)) {
      lines.push(`• ${headline}`);
    }
  }
  if ((params.noteWarnings?.length ?? 0) > 0) {
    lines.push("");
    lines.push("직접 주문 메모 경고");
    for (const warning of (params.noteWarnings ?? []).slice(0, 3)) {
      lines.push(`• ${warning.note} · 완결도 ${(warning.completionRate * 100).toFixed(0)}% · 잔류 ${Math.round(warning.residualExposure).toLocaleString("ko-KR")}`);
      for (const stock of (warning.recentStocks ?? []).slice(0, 2)) {
        lines.push(`  - ${stock.stockCode} · ${stock.market.toUpperCase()} · ${stock.side === "buy" ? "매수" : "매도"}`);
      }
    }
  }
  const dedupeKey = `holding-news:${params.items.map((item) => item.code).sort().join(",").slice(0, 120) || "notes-only"}`;
  await sendDedupedMessage({
    dedupeKey,
    text: lines.join("\n"),
    cooldownMinutes: 30,
  });
}
