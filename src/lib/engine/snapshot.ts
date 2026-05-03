import { supabase } from "@/lib/supabase/api-client";
import type { PendingOrder } from "@/lib/engine/db";
import {
  buildEngineStateSnapshotFromRows,
  selectPendingSignalsForScope,
  type EngineStateSnapshot,
} from "@/lib/engine/snapshot-model";

export async function readEngineStateSnapshot(): Promise<EngineStateSnapshot> {
  const [positionsRes, ordersRes, signalsRes, eventsRes] = await Promise.all([
    supabase
      .from("positions")
      .select("id, stock_code, stock_name, phase, status, entry_price, entry_qty, entry_date, entry_signal")
      .eq("status", "open")
      .order("entry_date", { ascending: true }),
    supabase
      .from("pending_orders")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("pending_signals")
      .select("id, stock_code, stock_name, status, signal_score, signal_comment, source, created_at, resolved_at, signal_data")
      .in("status", ["pending", "approved", "processing", "failed", "expired", "rejected"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("engine_state_events")
      .select("id, event_type, stock_code, entity_table, entity_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return buildEngineStateSnapshotFromRows({
    positions: (positionsRes.data ?? []) as Array<Record<string, unknown>>,
    orders: (ordersRes.data ?? []) as PendingOrder[],
    signals: (signalsRes.data ?? []) as Array<Record<string, unknown>>,
    events: (eventsRes.data ?? []) as Array<Record<string, unknown>>,
  });
}

export { buildEngineStateSnapshotFromRows, selectPendingSignalsForScope, type EngineStateSnapshot };
