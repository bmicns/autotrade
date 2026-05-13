import type { PendingOrderFillStatus } from "@/lib/engine/types";

export type PendingOrderLifecycleDecision =
  | "filled"
  | "partial_observed"
  | "timeout"
  | "error"
  | "noop";

export const DEFAULT_PENDING_ORDER_STALE_MINUTES = 30;

export function resolvePendingOrderLifecycleDecision(
  status: PendingOrderFillStatus["status"],
  ageMinutes: number,
  staleMinutes = DEFAULT_PENDING_ORDER_STALE_MINUTES,
): PendingOrderLifecycleDecision {
  if (status === "filled") return "filled";
  if (status === "error") return "error";
  if (ageMinutes >= staleMinutes && (status === "partial" || status === "open" || status === "not_found")) {
    return "timeout";
  }
  if (status === "partial") return "partial_observed";
  return "noop";
}
