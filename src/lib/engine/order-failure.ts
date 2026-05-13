import type { EngineAction } from "@/lib/engine/types";
import { recordEngineEvent } from "@/lib/engine/event-log";

export type OrderFailureCategory =
  | "account"
  | "capacity"
  | "retryable"
  | "unknown";

function normalizeMessage(message: string): string {
  return String(message ?? "").trim();
}

function extractKisCode(message: string): string | null {
  const normalized = normalizeMessage(message);
  const matched = normalized.match(/^\[([A-Z0-9_]+)\]/);
  return matched?.[1] ?? null;
}

export function classifyOrderFailure(message: string): {
  category: OrderFailureCategory;
  tag: string;
  blocksTrading: boolean;
} {
  const normalized = normalizeMessage(message);

  if (
    normalized.includes("계좌번호와 요청 계좌번호") ||
    normalized.includes("계좌번호") && normalized.includes("불일치") ||
    normalized.includes("주문 계좌 인증")
  ) {
    return { category: "account", tag: "계좌불일치", blocksTrading: true };
  }

  if (
    normalized.includes("주문가능") ||
    normalized.includes("잔고") ||
    normalized.includes("예수금") ||
    normalized.includes("가능수량") ||
    normalized.includes("수량이 부족")
  ) {
    return { category: "capacity", tag: "잔고/한도", blocksTrading: false };
  }

  if (
    normalized.includes("초당 거래건수를 초과") ||
    normalized.includes("EGW00201") ||
    normalized.includes("timeout") ||
    normalized.includes("타임아웃") ||
    normalized.includes("네트워크 오류") ||
    normalized.includes("HTTP 408") ||
    normalized.includes("HTTP 429") ||
    normalized.includes("HTTP 500") ||
    normalized.includes("HTTP 502") ||
    normalized.includes("HTTP 503") ||
    normalized.includes("HTTP 504")
  ) {
    return { category: "retryable", tag: "재시도가능", blocksTrading: false };
  }

  return { category: "unknown", tag: "주문실패", blocksTrading: false };
}

export function buildOrderFailureAction(params: {
  defaultType: string;
  code: string;
  name?: string;
  message: string;
  prefix?: string;
}): EngineAction {
  const classified = classifyOrderFailure(params.message);
  const type =
    classified.category === "account"
      ? "order_account_error"
      : classified.category === "capacity"
        ? "order_capacity_error"
        : classified.category === "retryable"
          ? "order_retryable_failure"
          : params.defaultType;
  const prefix = params.prefix ? `${params.prefix}: ` : "";
  return {
    type,
    code: params.code,
    name: params.name,
    detail: `${prefix}[${classified.tag}] ${params.message}`,
  };
}

export async function recordOrderFailureEvent(params: {
  stockCode: string;
  stockName?: string;
  side: "buy" | "sell";
  message: string;
  strategyKey?: string | null;
  orderQty?: number | null;
  limitPrice?: number | null;
  context?: string;
}): Promise<void> {
  const classified = classifyOrderFailure(params.message);
  await recordEngineEvent({
    eventType: "order_failure_recorded",
    stockCode: params.stockCode,
    entityTable: "operations",
    entityId: null,
    payload: {
      side: params.side,
      stock_name: params.stockName ?? null,
      strategy_key: params.strategyKey ?? null,
      category: classified.category,
      tag: classified.tag,
      blocks_trading: classified.blocksTrading,
      kis_code: extractKisCode(params.message),
      order_qty: params.orderQty ?? null,
      limit_price: params.limitPrice ?? null,
      context: params.context ?? null,
      reason: params.message,
    },
  });
}
