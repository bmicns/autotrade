# Database — DB 스키마 및 구조

[coverage: high -- 6 sources]

## Purpose

NEXIO는 Supabase(PostgreSQL)를 영속화 레이어로 사용한다. 데이터베이스는 크게 네 가지 역할을 담당한다.

1. **포지션 관리** — 매수/매도 전체 이력 기록 (`positions`)
2. **학습 원자료 수집** — 진입 시 지표 스냅샷 + 청산 결과 연결 (`trade_memory`)
3. **학습 결과 영속화** — 주간 가중치·ATR 배수·포지션 사이징 저장 (`learning_snapshots`)
4. **시스템 운영** — 시그널 승인 큐, 감시 종목, KIS 자격증명, 엔진 실행 로그, 장 초반 스냅샷, 동적 엔진 제어

## Architecture

### 연결 구조

- **Supabase 프로젝트 ID**: `bcxjyxfflcgmyltnxben`
- 싱글턴 클라이언트 패턴을 사용한다. 이전에는 API 라우트마다 `createClient`를 개별 호출(14곳)했으나, 현재는 단일 파일에서 임포트한다.

```typescript
// src/lib/supabase/api-client.ts
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

모든 API 라우트(`/api/*`)는 이 파일에서 `supabase`를 임포트한다.

### 클라이언트 파일 구분

| 파일 | 용도 |
|------|------|
| `src/lib/supabase/api-client.ts` | API 라우트 전용 싱글턴 |
| `src/lib/supabase/client.ts` | 브라우저 클라이언트 (React 컴포넌트) |
| `src/lib/supabase/server.ts` | 서버사이드 렌더링(SSR) |

## 핵심 테이블

### positions

매매 포지션 이력. 엔진이 매수/매도를 실행할 때마다 INSERT 또는 UPDATE된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| stock_code | text | 종목코드 |
| stock_name | text | 종목명 |
| entry_price | numeric | 매수 단가 |
| entry_qty | int | 매수 수량 |
| entry_signal | jsonb | 진입 시그널 전체 객체 |
| signal_strength | numeric | 시그널 강도 |
| phase | text | `"initial"` \| `"full"` \| `"partial_tp"` \| `"final_tp"` |
| status | text | `"open"` \| `"closed"` |
| exit_price | numeric | 청산 단가 |
| exit_qty | int | 청산 수량 |
| exit_date | timestamptz | 청산 일시 |
| exit_reason | text | 청산 사유 |
| pnl_amount | numeric | 손익 금액 (원) |
| pnl_percent | numeric | 손익률 (%) |
| hold_days | int | 보유 일수 |
| entry_date | timestamptz | 매수 일시 (자동) |
| sector | text (NULL) | 업종명 (`bstp_kor_isnm`) — v6.2 추가. 기존 포지션은 NULL. NULL이면 섹터 체크 제외 |

**v6.2 섹터 제한 관련 DB 변경** (`docs/02-design/features/sector-limit.design.md`):
```sql
ALTER TABLE positions ADD COLUMN sector TEXT;
INSERT INTO app_config (key, value) VALUES ('max_per_sector', '2') ON CONFLICT (key) DO NOTHING;
```

`closePosition()`은 FIFO 방식으로 동작한다. 동일 종목코드의 가장 오래된 `open` 포지션을 조회해 청산 처리한다.

### trade_memory (v5.9.0)

학습의 원자료. 매수 진입 시 지표 스냅샷을 INSERT하고, 청산 시 결과 컬럼을 UPDATE한다. 22개 컬럼.

```sql
id              uuid     PK
created_at      timestamptz
stock_code      text     NOT NULL
stock_name      text

-- 진입 지표 스냅샷 (7종)
rsi_value       numeric
macd_histogram  numeric
ma_cross        text          -- 'golden' | 'dead' | 'none'
bb_position     text          -- 'below' | 'middle' | 'above'
volume_ratio    numeric
adx_value       numeric
candle_pattern  text

-- 진입 컨텍스트
regime          text          -- 'trending' | 'ranging'
base_score      int           -- 기본 가중치 점수
learned_score   int           -- 학습 가중치 점수
total_score     int
market_bonus    int
investor_bonus  int
snapshot_bonus  int
weights_source  text          -- 'learned' | 'default'
atr_value       numeric
position_size   int           -- 실제 투자금액 (원)

-- 결과 (청산 시 UPDATE)
pnl_percent     numeric
pnl_amount      numeric
hold_days       int
exit_reason     text          -- 'stop_loss' | 'take_profit' | 'trailing_stop' | 'max_hold'
is_win          boolean
closed_at       timestamptz   -- NULL이면 현재 보유 중
```

`closed_at IS NULL` 조건이 보유 중 레코드의 기준이다. `closeTradeMemory()`는 이 조건으로 중복 업데이트를 방지한다.

**백필**: 기존 `positions` 테이블 데이터를 `trade_memory`로 마이그레이션하는 SQL이 존재하며, 수동 실행 방식이다. 두 테이블은 독립 운영되어 하위호환성을 유지한다.

### learning_snapshots (v5.9.0)

주간 학습 결과를 영속화하는 테이블. 엔진은 이 테이블을 읽기만 하며 런타임에 재계산하지 않는다. 18개 컬럼.

```sql
id                  uuid  PK
created_at          timestamptz
sample_size         int
confidence          text   -- 'none' | 'low' | 'medium' | 'high'

-- 학습 가중치
weights_trending    jsonb  -- { RSI: 18, MACD: 24, ... }
weights_ranging     jsonb
weights_source      text

-- ATR 배수
atr_mult_stop       numeric   -- 기본 2.0
atr_mult_profit     numeric   -- 기본 3.0
atr_mult_trailing   numeric   -- 기본 1.5
atr_source          text

-- 포지션 사이징
target_risk_amount  int        -- 매매당 목표 손실 한도 (원, 기본 30000)
sizing_source       text

-- 이익실현 비율
take_profit_ratio   int        -- 기본 50 (50%)
risk_source         text

-- 성과 요약
win_rate            numeric
avg_win             numeric
avg_loss            numeric
pattern_stats       jsonb      -- RSI 범위별·MACD 조합별 세부 성과

-- 관리
is_active           boolean DEFAULT false
expires_at          timestamptz  -- 유효기간 7일
```

**스냅샷 저장 순서** (원자성 보장):
1. 기존 `is_active = true` 레코드 → `false` UPDATE
2. 신규 스냅샷 INSERT (`is_active = true`, `expires_at = now() + 7일`)

만료 폴백: `loadLatestLearning()`은 만료된 경우에도 가장 최신 활성 스냅샷을 사용한다 (완전한 학습 미보유 상태 방지).

**신뢰도 등급 기준**:

| 등급 | 샘플 수 | 동작 |
|------|---------|------|
| none | < 10 | 기본 가중치 사용 |
| low | 10 ~ 29 | 학습 가중치 사용 (낮은 신뢰) |
| medium | 30 ~ 49 | 학습 가중치 사용 |
| high | ≥ 50 | 학습 가중치 완전 신뢰 |

### pending_signals

시그널 승인 큐. 자동매매 엔진이 감지한 시그널을 대기(pending) 상태로 저장하고, 관리자 승인 후 주문이 집행된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| stock_code | text | 종목코드 |
| stock_name | text | 종목명 |
| signal_score | int | 시그널 점수 |
| signal_comment | text | 시그널 설명 |
| signal_data | jsonb | `{ indicators, raw, matchCount, bonuses }` |
| source | text | `"watchlist"` \| `"surge"` |
| status | text | `"pending"` \| `"approved"` \| `"rejected"` \| `"expired"` |
| created_at | timestamptz | 생성 일시 |
| resolved_at | timestamptz | 처리 일시 |

### watchlist

엔진 STEP 2에서 시그널 스캔 대상이 되는 종목 목록.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| code | text | 종목코드 |
| name | text | 종목명 |
| active | boolean | 활성 여부 |

### kis_config

KIS(한국투자증권) API 자격증명 단일 레코드 테이블. `id = "default"` 고정.

| 컬럼 | 설명 |
|------|------|
| id | `"default"` (단일 행) |
| app_key | KIS API 앱키 |
| app_secret | KIS API 시크릿 |
| account_no | 계좌번호 |
| token | 발급된 접근토큰 |
| token_expiry | 토큰 만료 시각 |
| updated_at | 최종 갱신 시각 |

서버사이드(`/api/kis/order`)에서만 접근한다. 클라이언트에 노출되지 않는다.

### engine_runs

엔진 실행 로그. 매 실행마다 `logEngineRun()`이 한 행을 INSERT한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| trade_count | int | 체결된 매매 건수 |
| actions | jsonb array | 실행 액션 목록 |
| scanned_count | int | 스캔한 종목 수 |
| duration_ms | int | 실행 소요시간 (ms) |
| error | text | 오류 메시지 (없으면 null) |

### market_snapshots

장 초반(09:00 KST) 스냅샷. `/api/observer`가 매일 장 시작 시 Populate한다. 엔진이 시가 대비 상승률 계산(오프닝 보너스)에 사용한다.

| 컬럼 | 설명 |
|------|------|
| date | 날짜 |
| stock_code | 종목코드 |
| open_price | 시가 |
| snapshot_price | 스냅샷 시점 가격 |
| snapshot_volume | 스냅샷 시점 거래량 |

### pending_orders

미체결 지정가 매수 주문 추적 테이블. STEP 0이 매 실행마다 이 테이블을 폴링하여 KIS API로 체결 여부를 확인한다. 30분이 경과해도 미체결이면 자동 삭제된다.

마이그레이션: `supabase/migrations/20260420000000_pending_orders.sql`

```sql
CREATE TABLE IF NOT EXISTS pending_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_code text NOT NULL,
  stock_name text,
  order_no text NOT NULL,
  order_qty integer NOT NULL,
  limit_price integer NOT NULL,
  signal_score integer,
  created_at timestamptz DEFAULT now()
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| stock_code | text | 종목코드 |
| stock_name | text | 종목명 |
| order_no | text | KIS 주문번호 |
| order_qty | integer | 주문 수량 |
| limit_price | integer | 지정가 |
| signal_score | integer | 시그널 점수 |
| created_at | timestamptz | 주문 생성 시각 (30분 경과 미체결 시 자동 삭제 기준) |

### portfolio_snapshots

일별 포트폴리오 총 평가금액 스냅샷 테이블. 엔진이 KST 15:00 이후(장 마감 후) 하루 한 번 저장한다.

마이그레이션: `supabase/migrations/20260420000001_portfolio_snapshots.sql`

```sql
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL UNIQUE,
  total_eval integer NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| snapshot_date | date | 스냅샷 날짜 (UNIQUE — 하루 1건) |
| total_eval | integer | 총 평가금액 (원) |
| created_at | timestamptz | 저장 일시 |

- **용도**: MDD, 7일 수익률, 30일 수익률 계산에 사용 (포트폴리오 UI)
- **API**: `POST /api/portfolio-snapshot` (upsert) / `GET /api/portfolio-snapshot` (최근 30일 조회)

### app_config

동적 엔진 제어용 설정 테이블. `key-value` 구조로 런타임 중 엔진 동작을 제어한다. `GET/POST /api/engine-control`로 읽기/쓰기하며, `runEngine()` 시작 시 `SELECT key, value FROM app_config`로 일괄 조회한다.

마이그레이션: `supabase/migrations/20260417000000_app_config.sql`

```sql
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO app_config (key, value) VALUES
  ('engine_enabled', 'true'::jsonb),
  ('max_positions', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| key | TEXT | PK. 설정 키 |
| value | JSONB NOT NULL | 설정 값 (boolean 또는 number) |
| updated_at | TIMESTAMPTZ | 최종 갱신 시각 |

**기본 키 목록**:

| key | 타입 | 기본값 | 설명 |
|-----|------|--------|------|
| `engine_enabled` | boolean JSONB | `true` | `false`이면 `runEngine()`이 즉시 skipped 반환 |
| `max_positions` | number JSONB | `5` | 동시 보유 가능한 최대 종목 수. 범위 1~20 |
| `engine_lock` | string JSONB (ISO 8601) or null | null | 중복 실행 방지 락 (v7.1 신규). 락 시각 저장 — 5분 이내 존재 시 skipped 반환 |
| `max_per_sector` | number JSONB | `2` | 섹터당 최대 보유 종목 수 (v6.2 신규). 0이면 비활성 |
| `rsi_buy` | number JSONB | `30` | RSI 매수 기준 임계값 (signal-thresholds 계획, v5.2.1) |
| `rsi_sell` | number JSONB | `70` | RSI 매도 기준 임계값 |
| `strong_score` | number JSONB | `70` | 즉시 매수(strong) 점수 임계값 |
| `weak_score` | number JSONB | `40` | 승인 대기(weak) 점수 임계값 |
| `market_holidays` | array JSONB | `[]` | 추가 공휴일 목록 (`YYYY-MM-DD` 형식) |
| `morning_start` | string JSONB | `"09:30"` | 엔진 운영 시작 시각 (HH:MM) |
| `morning_end` | string JSONB | `"15:20"` | 엔진 운영 종료 시각 (HH:MM) |

**engine_lock 락 로직 (v7.1)**:
- 엔진 시작 시: `engine_lock` 값이 존재하고 설정 시각이 5분 이내 → skip (already running)
- 락 획득: `engine_lock = new Date().toISOString()` upsert
- 엔진 종료 시: `engine_lock = null` upsert (try-finally로 정상 완료/에러 모두 해제)
- 5분 TTL은 비정상 종료(Vercel timeout) 시 자동 만료 보장
- 스키마 마이그레이션 불필요 — 기존 key-value 패턴 재사용

## DB Helper Functions

`src/lib/engine/db.ts`에 집중 관리된다.

| 함수 | 동작 |
|------|------|
| `openPosition(code, name, price, qty, signal, phase)` | `positions` INSERT |
| `closePosition(code, exitPrice, exitQty, exitReason)` | `positions` UPDATE (FIFO — 가장 오래된 open 포지션) |
| `recordTradeMemory(params)` | `trade_memory` INSERT |
| `closeTradeMemory(code, pnlPct, pnlAmt, holdDays, exitReason)` | `trade_memory` UPDATE (`closed_at IS NULL` 조건) |
| `getOpenPosition(code)` | `positions` SELECT WHERE `status='open'` LIMIT 1 |
| `getTodayRealizedLoss()` | 오늘 청산된 `pnl_percent` 합산 (일일 손실 한도 계산용) |
| `logEngineRun(tradeCount, actions, scannedCount, durationMs, error?)` | `engine_runs` INSERT |
| `extractCandlePattern(signal)` | 헬퍼: `SignalResult`에서 캔들패턴 지표 추출 |
| `savePendingOrder(params)` | `pending_orders` INSERT |
| `getPendingOrders()` | `pending_orders` SELECT 전체, `created_at` 오름차순 |
| `deletePendingOrder(orderId)` | `pending_orders` DELETE by id |
| `updatePositionPhase(code, phase)` | `positions` UPDATE — open 포지션의 phase 변경 |
| `cleanupStalePendingOrders(cutoffMinutes = 30)` | `pending_orders` DELETE — 생성 후 cutoffMinutes 경과한 레코드 일괄 삭제 (v7.1 신규) |

`app_config` 테이블은 `/api/engine-control` 라우트에서 upsert 방식으로 관리한다. GET 요청 시 전체 키를 SELECT, POST 요청 시 변경 키를 `ON CONFLICT (key) DO UPDATE`로 upsert한다. 엔진 진입 시점에는 일괄 SELECT 후 객체로 변환하여 사용한다.

## Migration History

| 날짜 | 내용 |
|------|------|
| 2026-04-11 | `trade_memory` + `learning_snapshots` 테이블 신규 생성 |
| 2026-04-17 | `pending_signals`, `watchlist`, `kis_config`, `engine_runs`, `market_snapshots` 운영 중 확인 |
| 2026-04-17 | `app_config` 테이블 신규 생성 (Supabase SQL Editor에서 직접 실행) |
| 2026-04-20 | `pending_orders` 테이블 신규 생성 (미체결 주문 추적) |
| 2026-04-20 | `portfolio_snapshots` 테이블 신규 생성 (일별 포트폴리오 스냅샷) |

## Key Decisions

- **싱글턴 클라이언트**: 14개 API 라우트에 분산된 `createClient` 호출을 단일 파일로 통합했다. 연결 낭비를 줄이고 자격증명 관리를 일원화한다.
- **trade_memory 독립 운영**: `positions`와 `trade_memory`는 별도 테이블로 운영된다. 기존 포지션 로직을 변경하지 않고 학습 기능을 추가할 수 있다.
- **learning_snapshots 읽기 전용 접근**: 엔진은 학습 결과를 읽기만 한다. 학습 계산은 `/api/learning/run` 엔드포인트가 전담하여 엔진 런타임 복잡도를 줄인다.
- **kis_config 서버 전용**: KIS 자격증명을 DB에 저장하고 서버사이드에서만 조회한다. 클라이언트에 키가 노출되지 않는다.
- **app_config 동적 엔진 제어**: 엔진 ON/OFF 및 최대 포지션 수 등 런타임 제어 파라미터를 `app_config` 테이블에 JSONB로 저장한다. 코드 배포 없이 `/api/engine-control`을 통해 즉시 변경 가능하며, upsert 패턴으로 키 추가가 자유롭다.

## Gotchas

- `atr_value = 0` 또는 `entry_price = 0` 레코드는 학습 계산에서 제외한다 (0 나누기 오류 방지).
- `closeTradeMemory()`의 `closed_at IS NULL` 조건은 중복 업데이트를 막는다. 같은 종목을 여러 번 청산해도 이미 처리된 레코드를 건드리지 않는다.
- `closePosition()`은 FIFO 방식이다. 동일 종목을 여러 번 매수한 경우 가장 오래된 포지션부터 청산된다.
- `pending_signals`의 `source` 필드는 `"watchlist"` (감시 종목 기반) 와 `"surge"` (급등 탐지 기반) 두 가지다. 승인 화면에서 출처 구분에 사용된다.
- `learning_snapshots`의 `expires_at` 만료 후에도 `loadLatestLearning()`은 폴백으로 가장 최신 레코드를 반환한다. 완전한 학습 미보유 상태(`weights_source = "default"`)로 즉시 전환되지 않는다.
- 백필 SQL은 자동 실행되지 않는다. 기존 `positions` 데이터를 `trade_memory`로 이관하려면 수동 실행이 필요하다.
- `app_config`의 `engine_enabled`가 `false`이면 `runEngine()`은 본문 실행 없이 즉시 반환한다. 긴급 중지 시 DB에서 직접 값을 변경해도 다음 사이클부터 즉시 반영된다.

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md` (Section 4: DB 스키마)
- `docs/02-design/features/adaptive-engine.design.md` (보완이력 #3, Section 2 P3)
- `docs/04-report/features/adaptive-engine.report.md` (Section 3: P3)
- `src/lib/engine/db.ts`, `src/lib/supabase/api-client.ts` (운영 중 확인, 2026-04-17)
- `supabase/migrations/20260417000000_app_config.sql` (app_config 테이블, 2026-04-17)
- `docs/02-design/features/sector-limit.design.md` (v6.2 — positions.sector 컬럼, app_config.max_per_sector)
- `docs/01-plan/features/signal-thresholds.plan.md` (v5.2.1 — app_config 임계값 4종 계획)
