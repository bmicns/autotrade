# DB Contract

## 목적

`NEXIO` 런타임이 기대하는 실사용 테이블/컬럼/상태값 계약을 고정한다.

## 핵심 테이블

### `app_config`

- 목적: 엔진 실행 설정의 단일 진실 소스
- 주요 key:
  - `engine_enabled`
  - `max_positions`
  - `max_per_sector`
  - `max_amount_per_trade`
  - `max_trades_per_day`
  - `stop_loss`
  - `take_profit`
  - `take_profit_ratio`
  - `trailing_stop`
  - `daily_loss_limit`
  - `max_hold_days`
  - `market_crash_threshold`
  - `market_holidays`
  - `strategy_alloc_watchlist_pullback`
  - `strategy_alloc_surge_momentum`
  - `strategy_alloc_institutional_follow`

### `kis_config`

- 목적: KIS 런타임 자격증명과 토큰 저장
- 단일 row: `id = 'default'`

### `positions`

- 목적: 현재/과거 포지션 상태 저장
- 상태값:
  - `status`: `open`, `closed`
  - `phase`: `initial`, `full`, `partial_tp`, `final_tp`
- 중요 컬럼:
  - `entry_signal`
  - `partial_exit_price`
  - `partial_exit_qty`
  - `exit_reason`
  - `pnl_amount`
  - `pnl_percent`

### `pending_orders`

- 목적: 주문 접수 이후 체결 확인 전 상태 저장
- 중요 컬럼:
  - `order_no`
  - `order_qty`
  - `limit_price`
  - `signal_score`
  - `strategy_key`

### `pending_signals`

- 목적: 약한 신호 승인/거부/재처리 상태 저장
- 상태값:
  - `pending`, `approved`, `processing`, `expired`, `rejected`, `failed`

### `trade_memory`

- 목적: 학습용 진입/청산 데이터 저장
- 중요 컬럼:
  - `base_score`
  - `learned_score`
  - `total_score`
  - `stop_price`
  - `profit_price`
  - `closed_at`

### `engine_runs`

- 목적: 엔진 한 사이클 실행 결과 기록
- 중요 컬럼:
  - `run_at`
  - `trade_count`
  - `scanned_count`
  - `duration_ms`
  - `actions`
  - `error`

### `portfolio_snapshots`

- 목적: 자산 추이 스냅샷

### `learning_snapshots`

- 목적: 자가 학습 결과 버전 저장

### `engine_state_events`

- 목적: 상태 전이 이벤트 저널
- 이벤트 타입:
  - `position_opened`
  - `position_closed`
  - `position_phase_changed`
  - `partial_exit_recorded`
  - `pending_order_saved`
  - `pending_order_deleted`
  - `pending_signal_resolved`
  - `trade_memory_recorded`
  - `trade_memory_closed`

## 원칙

- 실행 설정의 진실 소스는 `app_config`
- KIS 자격증명의 진실 소스는 `kis_config`
- 포지션 상태의 진실 소스는 `positions`
- 체결 대기 상태의 진실 소스는 `pending_orders`
- 운영 추적의 진실 소스는 `engine_runs + engine_state_events`
