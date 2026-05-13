export interface OrderTimelineEventRow {
  event_type?: string | null;
  stock_code?: string | null;
  entity_id?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface OrderTimelineSummary {
  orderNo: string;
  stockCode: string;
  stockName: string | null;
  status: string;
  source: "auto" | "manual";
  side: "buy" | "sell";
  market: string | null;
  filledQty: number;
  remainingQty: number;
  orderQty: number;
  limitPrice: number | null;
  lastEventAt: string;
  events: string[];
}

export interface OrderTimelineRiskSummary {
  manualOrderCount: number;
  partialCount: number;
  timeoutCount: number;
  staleCleanupCount: number;
  lifecycleRiskCount: number;
}

export interface ManualIntentSummary {
  queuedCount: number;
  pendingCount: number;
  blockedCount: number;
  rejectedCount: number;
  failedCount: number;
  expiredCount: number;
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getSignalContext(payload: Record<string, unknown>): Record<string, unknown> | null {
  return payload.signal_context && typeof payload.signal_context === "object"
    ? (payload.signal_context as Record<string, unknown>)
    : null;
}

function resolveTimelineKey(row: OrderTimelineEventRow, payload: Record<string, unknown>): string {
  const signalContext = getSignalContext(payload);
  if (typeof payload.pending_signal_id === "string" && payload.pending_signal_id.trim()) return payload.pending_signal_id.trim();
  if (typeof signalContext?.pending_signal_id === "string" && signalContext.pending_signal_id.trim()) return signalContext.pending_signal_id.trim();
  if (typeof payload.order_no === "string" && payload.order_no.trim()) return payload.order_no.trim();
  if (typeof row.entity_id === "string" && row.entity_id.trim()) return row.entity_id.trim();
  return "";
}

function resolveSide(row: OrderTimelineEventRow, payload: Record<string, unknown>): "buy" | "sell" {
  if (payload.side === "sell" || row.event_type === "manual_sell_executed") return "sell";
  return "buy";
}

function resolveSource(row: OrderTimelineEventRow): "auto" | "manual" {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  const signalContext = getSignalContext(payload);
  const signalSource = typeof payload.signal_source === "string"
    ? payload.signal_source
    : typeof signalContext?.signal_source === "string"
      ? signalContext.signal_source
      : null;
  if (signalSource === "manual" || String(row.event_type ?? "").startsWith("manual_")) return "manual";
  return "auto";
}

function mapResolvedSignalStatus(status: string): string {
  if (status === "rejected") return "rejected";
  if (status === "failed") return "failed";
  if (status === "expired") return "expired";
  return status || "closed";
}

export function summarizeOrderLifecycle(events: OrderTimelineEventRow[]): OrderTimelineSummary[] {
  const orderedEvents = [...events].sort(
    (a, b) => new Date(String(a.created_at ?? "")).getTime() - new Date(String(b.created_at ?? "")).getTime(),
  );
  const timelines = new Map<string, OrderTimelineSummary>();

  for (const row of orderedEvents) {
    const payload = (row.payload as Record<string, unknown> | null) ?? {};
    const timelineKey = resolveTimelineKey(row, payload);
    if (!timelineKey) continue;
    const signalContext = getSignalContext(payload);

    const current = timelines.get(timelineKey) ?? {
      orderNo: "",
      stockCode: String(row.stock_code ?? ""),
      stockName: typeof payload.stock_name === "string" ? payload.stock_name : null,
      status: "pending",
      source: resolveSource(row),
      side: resolveSide(row, payload),
      market: typeof payload.market === "string" ? payload.market : null,
      filledQty: 0,
      remainingQty: 0,
      orderQty: toNumber(payload.order_qty ?? payload.qty),
      limitPrice: payload.limit_price == null && payload.price == null ? null : toNumber(payload.limit_price ?? payload.price),
      lastEventAt: String(row.created_at ?? ""),
      events: [],
    };

    if (row.event_type === "manual_buy_queued") {
      current.status = "queued";
      current.source = "manual";
      current.side = "buy";
      current.orderQty = toNumber(payload.qty) || current.orderQty;
      current.events.push("수동매수등록");
    }
    if (row.event_type === "pending_signal_resolved") {
      const resolvedStatus = mapResolvedSignalStatus(String(payload.status ?? ""));
      current.source = current.source === "manual" ? "manual" : resolveSource(row);
      current.side = current.side ?? "buy";
      if (!["pending", "partial", "filled", "timeout", "stale_cleanup"].includes(current.status)) {
        current.status = resolvedStatus;
      }
      if (resolvedStatus === "rejected") current.events.push("신호거절");
      else if (resolvedStatus === "failed") current.events.push("신호실패");
      else if (resolvedStatus === "expired") current.events.push("신호만료");
      else current.events.push("신호종결");
    }
    if (row.event_type === "pending_order_saved") {
      current.status = "pending";
      current.side = resolveSide(row, payload);
      current.source = resolveSource(row);
      current.orderNo = typeof payload.order_no === "string" && payload.order_no.trim() ? payload.order_no.trim() : current.orderNo;
      current.events.push("저장");
    }
    if (row.event_type === "pending_order_partially_filled") {
      current.status = "partial";
      current.side = resolveSide(row, payload);
      current.source = resolveSource(row);
      current.orderNo = typeof payload.order_no === "string" && payload.order_no.trim() ? payload.order_no.trim() : current.orderNo;
      current.filledQty = toNumber(payload.filled_qty) || current.filledQty;
      current.remainingQty = toNumber(payload.remaining_qty) || current.remainingQty;
      current.events.push("부분체결");
    }
    if (row.event_type === "pending_order_deleted") {
      current.side = resolveSide(row, payload);
      current.source = resolveSource(row);
      current.orderNo = typeof payload.order_no === "string" && payload.order_no.trim() ? payload.order_no.trim() : current.orderNo;
      const resolution = String(payload.resolution ?? "");
      current.status = resolution || "closed";
      if (resolution === "filled") {
        current.filledQty = Math.max(current.filledQty, current.orderQty);
        current.remainingQty = 0;
        current.events.push("전량체결");
      } else if (resolution === "timeout") {
        current.events.push(payload.cancel_succeeded === true ? "시간초과후취소" : "시간초과정리");
      } else if (resolution === "stale_cleanup") {
        current.events.push("stale정리");
      } else {
        current.events.push("삭제");
      }
    }
    if (row.event_type === "manual_buy_executed" || row.event_type === "manual_sell_executed") {
      if (payload.success === false) continue;
      current.status = "filled";
      current.source = "manual";
      current.side = resolveSide(row, payload);
      current.orderNo = typeof payload.order_no === "string" && payload.order_no.trim() ? payload.order_no.trim() : current.orderNo;
      current.market = typeof payload.market === "string" ? payload.market : current.market;
      current.orderQty = toNumber(payload.qty) || current.orderQty;
      current.filledQty = toNumber(payload.qty) || current.filledQty;
      current.remainingQty = 0;
      current.limitPrice = payload.price == null ? current.limitPrice : toNumber(payload.price);
      current.events.push(current.side === "buy" ? "수동매수체결" : "수동매도체결");
    }

    if (String(row.created_at ?? "") >= current.lastEventAt) {
      current.lastEventAt = String(row.created_at ?? "");
      current.stockCode = String(row.stock_code ?? current.stockCode);
      current.stockName = typeof payload.stock_name === "string" ? payload.stock_name : current.stockName;
      current.market = typeof payload.market === "string" ? payload.market : current.market;
      current.orderQty = toNumber(payload.order_qty ?? payload.qty) || current.orderQty;
      const latestPrice = payload.limit_price ?? payload.price;
      current.limitPrice = latestPrice == null ? current.limitPrice : toNumber(latestPrice);
      if (typeof payload.order_no === "string" && payload.order_no.trim()) current.orderNo = payload.order_no.trim();
      current.side = resolveSide(row, payload);
      current.source = current.source === "manual" ? "manual" : resolveSource(row);
    }

    if (!current.orderNo && typeof signalContext?.pending_signal_id === "string") {
      current.orderNo = current.orderNo;
    }
    timelines.set(timelineKey, current);
  }

  return Array.from(timelines.values())
    .sort((a, b) => new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime())
    .slice(0, 8);
}

export function summarizeOrderTimelineRisk(timelines: OrderTimelineSummary[]): OrderTimelineRiskSummary {
  return timelines.reduce<OrderTimelineRiskSummary>((summary, item) => {
    if (item.source === "manual") summary.manualOrderCount += 1;
    if (item.status === "partial") summary.partialCount += 1;
    if (item.status === "timeout") summary.timeoutCount += 1;
    if (item.status === "stale_cleanup") summary.staleCleanupCount += 1;
    summary.lifecycleRiskCount = summary.partialCount + summary.timeoutCount + summary.staleCleanupCount;
    return summary;
  }, {
    manualOrderCount: 0,
    partialCount: 0,
    timeoutCount: 0,
    staleCleanupCount: 0,
    lifecycleRiskCount: 0,
  });
}

export function summarizeManualIntentHealth(timelines: OrderTimelineSummary[]): ManualIntentSummary {
  return timelines.reduce<ManualIntentSummary>((summary, item) => {
    if (item.source !== "manual" || item.side !== "buy") return summary;
    if (item.status === "queued") summary.queuedCount += 1;
    if (item.status === "pending" || item.status === "partial") summary.pendingCount += 1;
    if (item.status === "rejected") {
      summary.rejectedCount += 1;
      summary.blockedCount += 1;
    }
    if (item.status === "failed") {
      summary.failedCount += 1;
      summary.blockedCount += 1;
    }
    if (item.status === "expired") summary.expiredCount += 1;
    return summary;
  }, {
    queuedCount: 0,
    pendingCount: 0,
    blockedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    expiredCount: 0,
  });
}
