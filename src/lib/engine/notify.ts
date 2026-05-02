import type { KISApiErrorContext } from "@/lib/engine/types";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TG_URL = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` : "";

async function sendMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(TG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch { /* 알림 실패가 엔진 실행에 영향 주지 않음 */ }
}

export interface TradeAlertParams {
  type: "buy" | "sell" | "stop_loss" | "take_profit" | "max_hold_sell" | "surge_buy";
  code: string;
  name: string;
  qty: number;
  price: number;
  score?: number;
  pnlPct?: number;
  strategyKey?: string;
  regime?: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  watchlist_pullback: "관심종목",
  surge_momentum: "급등모멘텀",
  institutional_follow: "기관추종",
};

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
    take_profit: "✅ 익절 매도",
    max_hold_sell: "⏱ 기간초과 청산",
  };

  const lines = [
    `<b>[NEXIO] ${typeLabel[type] ?? type}</b>`,
    `종목: ${name} (${code})`,
    `수량: ${qty}주 @ ${price.toLocaleString()}원`,
  ];
  if (score !== undefined) lines.push(`점수: ${score}점`);
  if (pnlPct !== undefined) lines.push(`손익: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`);
  const tags: string[] = [];
  if (strategyKey) tags.push(STRATEGY_LABELS[strategyKey] ?? strategyKey);
  if (regime) tags.push(REGIME_LABELS[regime] ?? regime);
  if (tags.length > 0) lines.push(`태그: ${tags.join(" · ")}`);

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
    `<b>[NEXIO] 일일 리포트 — ${date}</b>`,
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

export async function sendEngineErrorAlert(msg: string, durationMs: number): Promise<void> {
  const kstNow = new Date(Date.now() + 9 * 3600000);
  const timeStr = kstNow.toISOString().slice(11, 16);
  const lines = [
    `<b>[NEXIO] ⚠️ 엔진 오류 발생</b>`,
    `시각: ${timeStr} KST`,
    `오류: ${msg.slice(0, 200)}`,
    `실행시간: ${(durationMs / 1000).toFixed(1)}s`,
    `→ 다음 크론에서 자동 재시도`,
  ];
  await sendMessage(lines.join("\n"));
}

export async function sendMarketCloseAlert(cancelled: number, failed: number, mismatches: string[]): Promise<void> {
  const lines = [
    `<b>[NEXIO] 장 마감 정산</b>`,
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
    `<b>[NEXIO] ⚠️ KIS API 오류</b>`,
    `작업: ${opLabel[ctx.operation] ?? ctx.operation}`,
    `시각: ${timeStr} KST`,
  ];
  if (ctx.httpStatus !== undefined) lines.push(`HTTP: ${ctx.httpStatus}`);
  if (ctx.kisCode) lines.push(`코드: ${ctx.kisCode}`);
  if (ctx.kisMessage) lines.push(`메시지: ${ctx.kisMessage.slice(0, 200)}`);
  await sendMessage(lines.join("\n"));
}

// 연결 상태 변화 시 — /api/kis/health에서만 호출
export async function sendKISConnectionAlert(type: "disconnected" | "reconnected"): Promise<void> {
  const kstNow = new Date(Date.now() + 9 * 3600000);
  const timeStr = kstNow.toISOString().slice(11, 16);
  const label = type === "disconnected" ? "🔴 KIS 연결 끊김" : "🟢 KIS 재연결";
  await sendMessage([`<b>[NEXIO] ${label}</b>`, `시각: ${timeStr} KST`].join("\n"));
}
