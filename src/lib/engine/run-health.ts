import {
  ENGINE_CONSECUTIVE_ERROR_HALT_COUNT,
  ENGINE_CONSECUTIVE_ORDER_FAILURE_HALT_COUNT,
  ENGINE_CONSECUTIVE_TOKEN_ERROR_HALT_COUNT,
} from "./constants";

type EngineRunLike = {
  error?: unknown;
  actions?: unknown;
};

const ORDER_FAILURE_ACTION_TYPES = new Set([
  "buy_failed",
  "approved_buy_failed",
  "surge_buy_failed",
  "sell_failed",
  "order_account_error",
  "order_capacity_error",
]);

function hasActionType(run: EngineRunLike, predicate: (type: string) => boolean): boolean {
  if (!Array.isArray(run.actions)) return false;
  return run.actions.some((action) => {
    const type = typeof action === "object" && action !== null ? String((action as { type?: unknown }).type ?? "") : "";
    return predicate(type);
  });
}

export function resolveRecentFailureHalt(runs: EngineRunLike[]): string | null {
  const consecutiveErrors = runs
    .slice(0, ENGINE_CONSECUTIVE_ERROR_HALT_COUNT)
    .filter((run) => !!run.error).length;
  if (consecutiveErrors >= ENGINE_CONSECUTIVE_ERROR_HALT_COUNT) {
    return `연속 엔진 오류 ${consecutiveErrors}회`;
  }

  const latestAccountOrderError = runs
    .slice(0, 1)
    .some((run) => hasActionType(run, (type) => type === "order_account_error"));
  if (latestAccountOrderError) {
    return "주문 계좌 오류 감지";
  }

  const consecutiveTokenErrors = runs
    .slice(0, ENGINE_CONSECUTIVE_TOKEN_ERROR_HALT_COUNT)
    .filter((run) => hasActionType(run, (type) => type === "token_error")).length;
  if (consecutiveTokenErrors >= ENGINE_CONSECUTIVE_TOKEN_ERROR_HALT_COUNT) {
    return `연속 토큰 오류 ${consecutiveTokenErrors}회`;
  }

  const consecutiveOrderFailures = runs
    .slice(0, ENGINE_CONSECUTIVE_ORDER_FAILURE_HALT_COUNT)
    .filter((run) => hasActionType(run, (type) => ORDER_FAILURE_ACTION_TYPES.has(type))).length;
  if (consecutiveOrderFailures >= ENGINE_CONSECUTIVE_ORDER_FAILURE_HALT_COUNT) {
    return `연속 주문 실패 ${consecutiveOrderFailures}회`;
  }

  return null;
}
