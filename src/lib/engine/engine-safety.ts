export type TradingBlocker = {
  key: "broker_reconcile" | "stale_pending_orders" | "stale_signals" | "recent_order_failures" | "sector_exposure" | "entry_pressure";
  detail: string;
};

export type RecentOrderFailureSummary = {
  account: number;
  capacity: number;
  retryable: number;
  unknown: number;
};

export function resolveRuntimeTradingBlockers(params: {
  brokerMismatchCount: number;
  stalePendingOrderCount: number;
  staleSignalCount: number;
  recentOrderFailures?: RecentOrderFailureSummary;
  sectorOverload?: { count: number; firstSector?: string | null; firstCount?: number | null; maxPerSector?: number | null };
  entryPressure?: { overflowCount: number; firstCode?: string | null; firstCount?: number | null; firstLimit?: number | null };
}): TradingBlocker[] {
  const blockers: TradingBlocker[] = [];

  if (params.brokerMismatchCount > 0) {
    blockers.push({
      key: "broker_reconcile",
      detail: `브로커-DB 정합성 불일치 ${params.brokerMismatchCount}건`,
    });
  }

  if (params.stalePendingOrderCount > 0) {
    blockers.push({
      key: "stale_pending_orders",
      detail: `stale pending order ${params.stalePendingOrderCount}건`,
    });
  }

  if (params.staleSignalCount > 0) {
    blockers.push({
      key: "stale_signals",
      detail: `오래된 pending signal ${params.staleSignalCount}건`,
    });
  }

  const recentOrderFailures = params.recentOrderFailures;
  if (recentOrderFailures) {
    if (recentOrderFailures.account > 0) {
      blockers.push({
        key: "recent_order_failures",
        detail: `최근 주문 계좌 오류 ${recentOrderFailures.account}건`,
      });
    } else if (recentOrderFailures.capacity >= 3) {
      blockers.push({
        key: "recent_order_failures",
        detail: `최근 주문 한도/잔고 오류 ${recentOrderFailures.capacity}건`,
      });
    } else if (recentOrderFailures.retryable >= 3) {
      blockers.push({
        key: "recent_order_failures",
        detail: `최근 재시도성 주문 실패 ${recentOrderFailures.retryable}건`,
      });
    }
  }

  if ((params.sectorOverload?.count ?? 0) > 0) {
    blockers.push({
      key: "sector_exposure",
      detail: params.sectorOverload?.firstSector
        ? `섹터 과집중 ${params.sectorOverload.firstSector} ${params.sectorOverload.firstCount}/${params.sectorOverload.maxPerSector}`
        : `섹터 과집중 ${params.sectorOverload?.count}건`,
    });
  }

  if ((params.entryPressure?.overflowCount ?? 0) > 0) {
    blockers.push({
      key: "entry_pressure",
      detail: params.entryPressure?.firstCode
        ? `종목 반복진입 초과 ${params.entryPressure.firstCode} ${params.entryPressure.firstCount}/${params.entryPressure.firstLimit}`
        : `종목 반복진입 초과 ${params.entryPressure?.overflowCount}건`,
    });
  }

  return blockers;
}
