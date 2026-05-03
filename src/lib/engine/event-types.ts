export const ENGINE_EVENT_TYPES = [
  "position_opened",
  "position_closed",
  "position_phase_changed",
  "partial_exit_recorded",
  "pending_order_saved",
  "pending_order_deleted",
  "pending_signal_resolved",
  "trade_memory_recorded",
  "trade_memory_closed",
] as const;

export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number];
