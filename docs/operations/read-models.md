# Read Models

## 목적

운영 UI/API가 raw table을 제각각 해석하지 않도록, 조회 계약을 고정한다.

## 1. Engine State Snapshot

- 구현: `/api/engine-state`
- 소스:
  - `positions(status=open)`
  - `pending_orders`
  - `pending_signals`
  - `engine_state_events`
- 반환:
  - `openPositions`
  - `pendingOrders`
  - `pendingSignals`
  - `recentEvents`
  - `summary`

## 2. Positions API

- 구현: `/api/positions`
- 규칙:
  - raw `positions`를 직접 노출하지 않고 `engine-state`의 open position view를 사용

## 3. Pending Signals API

- 구현: `/api/pending-signals`
- 규칙:
  - raw `pending_signals`를 직접 해석하지 않고 snapshot을 scope별로 필터링
  - `active`: `pending`, `approved`, `processing`
  - `history`: `failed`, `expired`, `rejected`

## 4. Stats API

- 구현: `/api/stats`
- 규칙:
  - close type 해석은 lifecycle canonical set을 사용
  - `positions`가 없을 때만 `engine_runs.actions`를 보조 데이터로 사용

## 원칙

- UI는 raw table 의미를 직접 재구성하지 않는다
- 상태값 해석은 lifecycle/read-model 계층만 담당한다
- 새 운영 화면은 가능하면 `engine-state`를 우선 사용한다
