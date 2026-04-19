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
}

export async function sendTradeAlert(params: TradeAlertParams): Promise<void> {
  const { type, code, name, qty, price, score, pnlPct } = params;

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
