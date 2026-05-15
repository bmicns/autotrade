import type { BrokerId } from "./types";
import { getBrokerAdapter } from "./adapter";
import type { BrokerManualOrderPayload } from "./adapter-contract";

const VALID_SIDES = new Set(["buy", "sell"]);
const MAX_QTY = 10_000;
const MAX_PRICE = 10_000_000;
const MAX_NOTE_LENGTH = 120;

export function validateManualOrderPayload(input: Record<string, unknown>) {
  const side = String(input.side ?? "");
  const stockCode = String(input.stockCode ?? "");
  const stockName = typeof input.stockName === "string" ? input.stockName : "";
  const marketType = input.market === "us" ? "us" : "kr";
  const normalizedProfileId = typeof input.profileId === "string" ? input.profileId : null;
  const normalizedNote = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE_LENGTH) : "";
  const normalizedStockName = stockName.trim() ? stockName.trim().slice(0, 80) : stockCode;
  const qty = Math.floor(Number(input.quantity));
  const px = Number(input.price ?? 0);
  const exchangeCode = typeof input.exchangeCode === "string" ? input.exchangeCode : undefined;
  const orderType = typeof input.orderType === "string" ? input.orderType : "00";

  if (!VALID_SIDES.has(side)) return { error: "side는 'buy' 또는 'sell'이어야 합니다" };
  if (marketType === "kr" && !/^\d{6}$/.test(stockCode)) return { error: "유효하지 않은 국내 종목코드입니다" };
  if (marketType === "us" && !/^[A-Z][A-Z0-9.-]{0,14}$/i.test(stockCode)) return { error: "유효하지 않은 해외 심볼입니다" };
  if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) return { error: `수량은 1~${MAX_QTY} 정수여야 합니다` };
  if (!Number.isFinite(px) || px < 0 || px > MAX_PRICE) return { error: "유효하지 않은 가격입니다" };
  if (typeof input.note === "string" && input.note.trim().length > MAX_NOTE_LENGTH) {
    return { error: `주문 메모는 ${MAX_NOTE_LENGTH}자 이하여야 합니다` };
  }

  return {
    side: side as "buy" | "sell",
    stockCode,
    marketType,
    normalizedProfileId,
    normalizedNote,
    normalizedStockName,
    qty,
    px,
    exchangeCode,
    orderType,
  } satisfies BrokerManualOrderPayload;
}

export async function placeBrokerManualOrder(
  brokerId: BrokerId,
  payload: ReturnType<typeof validateManualOrderPayload> & { error?: undefined },
) {
  const adapter = getBrokerAdapter(brokerId);
  return adapter.placeManualOrder(payload);
}
