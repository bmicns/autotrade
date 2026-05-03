import type { PendingOrder } from "@/lib/engine/db";
import {
  filterSignalsByScope,
  mapOpenPositions,
  mapPendingSignals,
  summarizeEngineState,
  type EngineStatePositionView,
  type EngineStateSignalView,
} from "./read-model";

export interface EngineStateSnapshot {
  openPositions: EngineStatePositionView[];
  pendingOrders: PendingOrder[];
  pendingSignals: EngineStateSignalView[];
  recentEvents: Array<{
    id: string;
    eventType: string;
    stockCode: string | null;
    entityTable: string;
    entityId: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }>;
  summary: {
    openPositionCount: number;
    pendingOrderCount: number;
    pendingSignalCount: number;
  };
}

export function buildEngineStateSnapshotFromRows(params: {
  positions: Array<Record<string, unknown>>;
  orders: PendingOrder[];
  signals: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}): EngineStateSnapshot {
  const openPositions = mapOpenPositions(params.positions);
  const pendingOrders = params.orders;
  const pendingSignals = mapPendingSignals(params.signals);
  const recentEvents = params.events.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    stockCode: (row.stock_code as string | null) ?? null,
    entityTable: String(row.entity_table),
    entityId: (row.entity_id as string | null) ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));

  return {
    openPositions,
    pendingOrders,
    pendingSignals,
    recentEvents,
    summary: summarizeEngineState({ openPositions, pendingOrders, pendingSignals }),
  };
}

export function selectPendingSignalsForScope(snapshot: EngineStateSnapshot, scope: "active" | "history") {
  return filterSignalsByScope(snapshot.pendingSignals, scope);
}
