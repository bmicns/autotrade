import type { PendingOrder } from "@/lib/engine/db";

export const ACTIVE_PENDING_SIGNAL_STATUSES = ["pending", "approved", "processing"] as const;
export const HISTORY_PENDING_SIGNAL_STATUSES = ["failed", "expired", "rejected"] as const;

export interface EngineStatePositionView {
  id: string;
  stockCode: string;
  stockName: string | null;
  phase: string | null;
  status: string;
  entryPrice: number;
  entryQty: number;
  entryDate: string;
  strategyKey: string | null;
}

export interface EngineStateSignalView {
  id: string;
  stockCode: string;
  stockName: string | null;
  status: string;
  score: number | null;
  comment: string | null;
  source: string | null;
  createdAt: string;
  resolvedAt: string | null;
  strategyKey: string | null;
  signalData: Record<string, unknown> | null;
}

export function mapOpenPositions(rows: Array<Record<string, unknown>>): EngineStatePositionView[] {
  return rows.map((row) => ({
    id: String(row.id),
    stockCode: String(row.stock_code),
    stockName: (row.stock_name as string | null) ?? null,
    phase: (row.phase as string | null) ?? null,
    status: String(row.status ?? "open"),
    entryPrice: Number(row.entry_price) || 0,
    entryQty: Number(row.entry_qty) || 0,
    entryDate: String(row.entry_date ?? ""),
    strategyKey: ((row.entry_signal as { strategyKey?: string } | null)?.strategyKey) ?? null,
  }));
}

export function mapPendingSignals(rows: Array<Record<string, unknown>>): EngineStateSignalView[] {
  return rows.map((row) => ({
    id: String(row.id),
    stockCode: String(row.stock_code),
    stockName: (row.stock_name as string | null) ?? null,
    status: String(row.status ?? "pending"),
    score: row.signal_score === null || row.signal_score === undefined ? null : Number(row.signal_score),
    comment: (row.signal_comment as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    resolvedAt: (row.resolved_at as string | null) ?? null,
    strategyKey: ((row.signal_data as { strategyKey?: string } | null)?.strategyKey) ?? null,
    signalData: (row.signal_data as Record<string, unknown> | null) ?? null,
  }));
}

export function filterSignalsByScope(
  signals: EngineStateSignalView[],
  scope: "active" | "history",
  limit = scope === "history" ? 20 : signals.length,
): EngineStateSignalView[] {
  const statusSet = new Set(scope === "history" ? HISTORY_PENDING_SIGNAL_STATUSES : ACTIVE_PENDING_SIGNAL_STATUSES);
  return signals.filter((signal) => statusSet.has(signal.status as never)).slice(0, limit);
}

export function mapPositionsApiResponse(positions: EngineStatePositionView[]) {
  return positions.map((position) => ({
    stock_code: position.stockCode,
    stock_name: position.stockName,
    phase: position.phase,
    strategy_key: position.strategyKey,
    entry_date: position.entryDate,
    entry_price: position.entryPrice,
    entry_qty: position.entryQty,
    status: position.status,
  }));
}

export function summarizeEngineState(snapshot: {
  openPositions: EngineStatePositionView[];
  pendingOrders: PendingOrder[];
  pendingSignals: EngineStateSignalView[];
}) {
  return {
    openPositionCount: snapshot.openPositions.length,
    pendingOrderCount: snapshot.pendingOrders.length,
    pendingSignalCount: snapshot.pendingSignals.filter((signal) => ACTIVE_PENDING_SIGNAL_STATUSES.includes(signal.status as never)).length,
  };
}
