import { supabase } from "../supabase/api-client";
import { type EngineEventType } from "@/lib/engine/event-types";

export interface EngineEventRecord {
  eventType: EngineEventType;
  stockCode?: string | null;
  entityTable: "positions" | "pending_orders" | "pending_signals" | "trade_memory" | "app_config" | "operations";
  entityId?: string | null;
  payload: Record<string, unknown>;
}

// Best-effort journal for lifecycle transitions.
// If the table does not exist yet, trading flow must continue.
export async function recordEngineEvent(event: EngineEventRecord): Promise<void> {
  try {
    await supabase.from("engine_state_events").insert({
      event_type: event.eventType,
      stock_code: event.stockCode ?? null,
      entity_table: event.entityTable,
      entity_id: event.entityId ?? null,
      payload: event.payload,
    });
  } catch {
    // Ignore missing table or transient DB failures.
  }
}
