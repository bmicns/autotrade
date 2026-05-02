# NEXIO DB Schema 레퍼런스

> 컴파일 날짜: 2026-05-02
> Supabase 프로젝트: bcxjyxfflcgmyltnxben

---

## trade_memory

매수 진입 시 지표 스냅샷 + 청산 결과를 기록하는 경험 데이터 테이블. 학습의 원자료.

| 컬럼 | 타입 | 설명 | 기본값 |
|------|------|------|--------|
| id | uuid | PK | gen_random_uuid() |
| created_at | timestamptz | 생성 시각 | now() |
| stock_code | text | 종목 코드 | NOT NULL |
| stock_name | text | 종목명 | |
| rsi_value | numeric | RSI 수치 (예: 27.4) | |
| macd_histogram | numeric | MACD 히스토그램 값 | |
| ma_cross | text | 'golden' \| 'dead' \| 'none' | |
| bb_position | text | 'below' \| 'middle' \| 'above' | |
| volume_ratio | numeric | 거래량/20일평균 배수 | |
| adx_value | numeric | ADX 추세 강도 | |
| candle_pattern | text | 캔들 패턴명 | |
| regime | text | 'trending' \| 'ranging' | |
| base_score | int | 기본 가중치 점수 (A/B 비교) | |
| learned_score | int | 학습 가중치 점수 (A/B 비교) | |
| total_score | int | 보정 포함 최종 점수 | |
| market_bonus | int | 시장 모멘텀 보정 | |
| investor_bonus | int | 기관/외국인 보정 | |
| snapshot_bonus | int | 장초반 스냅샷 보너스 | |
| weights_source | text | 'learned' \| 'default' | |
| atr_value | numeric | 진입 시 ATR | |
| position_size | int | 실제 투자금액 (원) | |
| pnl_percent | numeric | 손익률 (청산 시 UPDATE) | |
| pnl_amount | numeric | 손익금액 (청산 시 UPDATE) | |
| hold_days | int | 보유 기간 (청산 시 UPDATE) | |
| exit_reason | text | 'stop_loss' \| 'take_profit' \| 'trailing_stop' \| 'max_hold' | |
| is_win | boolean | 수익 여부 (청산 시 UPDATE) | |
| closed_at | timestamptz | 청산 시각 (NULL = 보유 중) | |

**주의**: `bb_position` 값은 코드 기준 `below`/`above` 사용 (계획서 표기 `lower`/`upper`와 다름)

---

## learning_snapshots

학습 결과를 영속화하는 테이블. 엔진은 읽기 전용.

| 컬럼 | 타입 | 설명 | 기본값 |
|------|------|------|--------|
| id | uuid | PK | gen_random_uuid() |
| created_at | timestamptz | | now() |
| sample_size | int | 학습에 사용된 거래 건수 | |
| confidence | text | 'none' \| 'low' \| 'medium' \| 'high' | |
| weights_trending | jsonb | 추세장 지표 가중치 { RSI: N, ... } | |
| weights_ranging | jsonb | 횡보장 지표 가중치 | |
| weights_source | text | | |
| atr_mult_stop | numeric | 손절 ATR 배수 | 2.0 |
| atr_mult_profit | numeric | 익절 ATR 배수 | 3.0 |
| atr_mult_trailing | numeric | 트레일링 ATR 배수 | 1.5 |
| target_risk_amount | int | 매매당 목표 손실 한도 (원) | 30000 |
| win_rate | numeric | 학습 기간 승률 | |
| avg_win | numeric | 평균 수익률 | |
| avg_loss | numeric | 평균 손실률 | |
| pattern_stats | jsonb | RSI범위별·MACD조합별 세부 성과 | |
| is_active | boolean | 현재 활성 스냅샷 여부 | false |
| expires_at | timestamptz | 만료 시각 (7일) | |

**활성 스냅샷**: `is_active = true`인 레코드가 현재 적용 중. 항상 1개만 존재.  
**만료 폴백**: `expires_at` 초과 시 `loadLatestLearning()`이 가장 최신 활성 스냅샷을 반환.

---

## 신뢰도 임계값

| confidence | sample_size 조건 | 학습 적용 범위 |
|-----------|-----------------|---------------|
| none | < 10 | 기본값 전체 |
| low | 10 ~ 29 | ATR 배수 + 포지션 사이징 |
| medium | 30 ~ 49 | 가중치 + ATR + takeProfitRatio |
| high | ≥ 50 | 전체 적용 |

---

## AtrMultipliers (인터페이스)

`src/lib/kis/indicators.ts`:

```typescript
export interface AtrMultipliers {
  stop: number;      // 기본 2.0
  profit: number;    // 기본 3.0
  trailing: number;  // 기본 1.5
}

export const DEFAULT_ATR_MULTIPLIERS: AtrMultipliers = {
  stop: 2.0,
  profit: 3.0,
  trailing: 1.5,
};
```

하한 가드: `stopLoss <= -2, takeProfit >= 3, trailingStop <= -1.5`

---

## KISHealthStatus (v6.1 신규, src/lib/engine/types.ts)

KIS 연결 상태 표현 타입. `/api/kis/health` 응답과 `store.ts` 상태에 사용된다.

```typescript
export interface KISHealthStatus {
  connected: boolean;
  lastChecked: string;      // ISO 8601 (KST)
  latencyMs: number;
  errorCode?: string;       // KIS API error_code (예: "EGW00123")
  errorMessage?: string;    // KIS API error_description
}
```

---

## KISApiErrorContext (v6.1 신규, src/lib/engine/types.ts)

Telegram 알림 컨텍스트. `sendKISApiErrorAlert()` 호출 시 전달. 비밀키 포함 금지.

```typescript
export interface KISApiErrorContext {
  operation: "token" | "balance" | "order" | "price";
  httpStatus?: number;      // HTTP 응답 코드
  kisCode?: string;         // KIS error_code
  kisMessage?: string;      // KIS error_description (200자 이하)
  timestamp: string;        // ISO 8601
}
```

---

## ConfigValidationResult (v7.1 신규, src/lib/config-validator.ts)

`validateRequiredEnv()` 반환 타입. 엔진 진입부에서 필수 환경변수 누락 여부를 판단한다.

```typescript
interface ConfigValidationResult {
  ok: boolean;        // required 그룹 전부 통과 시 true
  missing: string[];  // 누락된 필수 환경변수 이름 목록 (값 아님)
  warnings: string[]; // warn 그룹 누락 (오류 아님, 로그만)
}
```

**필수(REQUIRED) 그룹**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CRON_SECRET`, `ADMIN_SECRET`, `ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

**경고(WARN) 그룹**: `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_ACCOUNT_NO` (DB `kis_config`로 대체 가능)

---

## RetryOptions (v7.1 신규, src/lib/engine/retry.ts)

`withRetry<T>()` 함수의 옵션 타입. KIS 토큰 발급 등 핵심 네트워크 호출에 적용.

```typescript
interface RetryOptions {
  maxAttempts: number;   // default: 3
  baseDelayMs: number;   // default: 1000 (ms)
  maxDelayMs?: number;   // default: 10000 (ms)
}

// 백오프 계산식
// delay = min(baseDelayMs × 2^(attempt - 1), maxDelayMs)
// attempt 1 → 즉시, attempt 2 → 1초, attempt 3 → 2초
```

---

## Wiki 구조

### 토픽

| 슬러그 | 파일 | 설명 |
|--------|------|------|
| platform-overview | topics/platform-overview.md | NEXIO 전체 기술 스택, 기능 영역, 버전 로드맵 |
| trading-engine | topics/trading-engine.md | 엔진 오케스트레이션, STEP 0~3, 유틸리티 모듈 14개+ |
| signal-system | topics/signal-system.md | 10종 기술 지표, 레짐 감지, 보정 3종, 동적 임계값 계획 |
| adaptive-engine | topics/adaptive-engine.md | 학습 파이프라인, 신뢰도 체계, 가중치/ATR 배수 최적화 |
| order-management | topics/order-management.md | 지정가 매수, 포지션 청산, 섹터 필터 (v6.2 설계) |
| database | topics/database.md | 11개 테이블 전체 스키마, app_config 키 목록, RLS |
| deployment | topics/deployment.md | GitHub Actions 크론, Vercel observer, 운영 런북 |

### 컨셉

| 슬러그 | 파일 | 설명 |
|--------|------|------|
| progressive-file-split | concepts/progressive-file-split.md | 파일이 500줄 한계에 근접하면 역할 단위로 분리하는 반복 패턴 |

### 진화 로그

| 날짜 | 내용 |
|------|------|
| 2026-05-02 | trading-engine, signal-system, database, platform-overview, order-management, deployment 업데이트 — 신규 유틸리티 모듈(constants.ts, intraday.ts, strategies.ts, market-calendar.ts, utils.ts, retry.ts), sector-limit.design.md, signal-thresholds.plan.md, nexio.analysis.md, plan-v6.md 반영; 컨셉 신규: progressive-file-split |
| 2026-05-02 | platform-overview, trading-engine, signal-system, order-management, deployment, database 업데이트 — v7.1 신뢰 시스템 (balance/price POST 전환, 엔진 자가복구, 환경변수 자동 감지, E2E 테스트 계획) |
| 2026-05-02 | platform-overview, trading-engine, signal-system, order-management, deployment 업데이트 — v6.1 운영 안정성 (KIS Health Check, notify.ts 강화, 훅 추출 계획) |
| 2026-04-17 | trading-engine, deployment, database 업데이트 — steps.ts 분리, notify.ts, app_config 테이블, engine-control API |
| 2026-04-17 | 6개 토픽 전면 재컴파일 — lib/engine 모듈화, GitHub Actions 크론, 보안/성능 개선 |
| 2026-04-12 | 초기 컴파일 — 7개 토픽 생성 |
