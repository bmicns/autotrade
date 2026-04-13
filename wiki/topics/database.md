# Database — DB 스키마 및 구조

[coverage: high -- 3 sources]

## Purpose

NEXIO는 Supabase(PostgreSQL)를 사용. 주요 테이블은 매매 포지션, 경험 데이터 수집, 학습 결과 영속화를 담당한다.

## 연결 정보

- **Supabase 프로젝트 ID**: bcxjyxfflcgmyltnxben
- **클라이언트**: `src/lib/supabase/`
- **KIS 통합**: `src/lib/kis/`

## 핵심 테이블

### positions (기존)

매매 포지션 이력. 매수/매도 기록의 원본 데이터.

### trade_memory (v5.9.0 신규)

매수 진입 시 지표 스냅샷을 포함한 경험 데이터 저장 테이블. 학습의 원자료.

```sql
-- 22개 컬럼
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
base_score      int           -- 기본 가중치 점수 (A/B 비교)
learned_score   int           -- 학습 가중치 점수 (A/B 비교)
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
closed_at       timestamptz   -- NULL이면 보유 중
```

**백필**: 기존 `positions` 테이블 → `trade_memory` 마이그레이션 SQL 존재 (수동 실행).

### learning_snapshots (v5.9.0 신규)

학습 결과를 영속화하는 테이블. 엔진은 이 테이블을 읽기만 함 (재계산 없음).

```sql
-- 18개 컬럼
id                  uuid  PK
created_at          timestamptz
sample_size         int
confidence          text          -- 'none' | 'low' | 'medium' | 'high'

-- 학습 가중치
weights_trending    jsonb         -- { RSI: 18, MACD: 24, ... }
weights_ranging     jsonb
weights_source      text

-- ATR 배수 (P1 통합)
atr_mult_stop       numeric       -- 기본 2.0
atr_mult_profit     numeric       -- 기본 3.0
atr_mult_trailing   numeric       -- 기본 1.5

-- 포지션 사이징 (P2)
target_risk_amount  int           -- 매매당 목표 손실 한도 (원, 기본 30000)

-- 성과 요약
win_rate            numeric
avg_win             numeric
avg_loss            numeric
pattern_stats       jsonb         -- RSI범위별·MACD조합별 세부 성과

-- 관리
is_active           boolean DEFAULT false
expires_at          timestamptz   -- 유효기간 7일
```

**스냅샷 저장 순서** (원자성):
1. 기존 `is_active = true` 레코드 → `false` UPDATE
2. 신규 스냅샷 INSERT (`is_active = true`, `expires_at = now() + 7일`)

만료 폴백: `loadLatestLearning()`이 만료된 경우 가장 최신 활성 스냅샷 사용.

## 신뢰도 임계값

| 등급 | 샘플 수 |
|------|---------|
| none | < 10 |
| low | 10 ~ 29 |
| medium | 30 ~ 49 |
| high | ≥ 50 |

## 마이그레이션 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-11 | `trade_memory` + `learning_snapshots` 테이블 신규 생성 |

## Gotchas

- `atr_value = 0` 또는 `entry_price = 0` 레코드는 학습에서 제외 (0 나누기 방지)
- `closeTradeMemory()` 조건: `closed_at IS NULL` — 중복 업데이트 방지
- 백필 SQL은 수동 실행 (자동 실행 아님)
- `positions` 테이블과 `trade_memory` 테이블은 독립적 운영 (하위호환성 유지)

## Sources

- `docs/01-plan/features/adaptive-engine.plan.md` (Section 4: DB 스키마)
- `docs/02-design/features/adaptive-engine.design.md` (보완이력 #3, Section 2 P3)
- `docs/04-report/features/adaptive-engine.report.md` (Section 3: P3)
