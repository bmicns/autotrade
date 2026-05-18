export const ENGINE_EVENT_TYPES = [
  "position_opened",
  "position_closed",
  "position_reconciled",
  "position_phase_changed",
  "partial_exit_recorded",
  "pending_order_saved",
  "pending_order_partially_filled",
  "pending_order_deleted",
  "order_failure_recorded",
  "pending_signal_resolved",
  "trade_memory_recorded",
  "trade_memory_closed",
  "manual_buy_queued",
  "manual_buy_executed",
  "manual_sell_executed",
  "holding_news_risk_alert_sent",
  "engine_stage_marker",
  "app_config_updated",
] as const;

export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number];
