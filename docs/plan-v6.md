# NEXIO v6.0 미구현 기능 순차 구현 계획서

> **Summary**: v5.9 기준 미구현 기능 9건의 우선순위별 순차 구현 로드맵 및 engine/route.ts 분리 계획
>
> **Project**: NEXIO 자동매매 시스템
> **Version**: v5.9.0 → v6.0.0
> **Author**: Product Manager
> **Date**: 2026-04-17
> **Status**: Draft

---

## 1. 개요

### 1.1 목적

NEXIO v5.9는 핵심 매매 엔진, 시그널 분석, 자가학습까지 완성된 상태다. 그러나 운영 안정성에 직결되는 알림/비상정지/한도제어 기능이 미구현 상태이며, 이는 실거래 운영 시 리스크 요소가 된다. v6.0에서 이 미구현 기능들을 우선순위에 따라 순차적으로 완결한다.

### 1.2 현재 위반 사항

`src/app/api/engine/route.ts`가 **524줄**로 500줄 제한을 초과 중이다. 이는 플랫폼 개발 원칙 위반으로, 기능 구현과 병행하여 반드시 해소한다.

### 1.3 관련 문서

- 기존 계획서: `docs/01-plan/features/adaptive-engine.plan.md`
- 엔진 위키: `wiki/CONTEXT.md`
- 엔진 본체: `src/app/api/engine/route.ts`

---

## 2. 전체 로드맵

```
v5.9.0 (현재)
  │
  ├─ v5.9.1 ─── [긴급] engine/route.ts 500줄 초과 분리
  │
  ├─ v5.10.0 ── F1: 실시간 매매 알림 (텔레그램)
  │
  ├─ v5.11.0 ── F2: 일일 매매 리포트 (텔레그램)
  │
  ├─ v5.12.0 ── F3: 비상 정지 스위치 (DB 플래그)
  │
  ├─ v5.13.0 ── F4: 최대 포지션 수 제한
  │
  ├─ v6.0.0 ─── F5: 백테스트 UI (lib/backtest.ts 연동)
  │             F6: 엔진 실행 로그 뷰어
  │             F7: 장 종료 자동 정산 (15:20)
  │
  └─ v6.1.0 ─── F8: ABCompareCard
                F9: 섹터별 분산 제한
```

**버전 정책 기준**: 알림/정지/한도는 운영 안전성 기능이므로 소수점 첫째 자리(중간 기능)로 각각 올린다. 백테스트 UI/로그/정산은 기능 묶음으로 한 번에 정수(v6.0.0) 올림.

---

## 3. 사전 작업: engine/route.ts 분리

### 개요

현재 `src/app/api/engine/route.ts`는 524줄로 500줄 제한 초과 상태다. 기능 추가 전에 반드시 분리한다.

### 분리 방향

현재 `runEngine()` 함수 내부에 알림 호출이 추가될 예정이므로, 분리 경계를 미리 잡아 두는 것이 효율적이다.

| 분리 파일 | 역할 | 이동할 내용 |
|-----------|------|-------------|
| `src/lib/engine/steps.ts` | STEP별 실행 함수 분리 | `runStep0()`, `runStep1()`, `runStep15()`, `runStep2()`, `runStep3()` |
| `src/lib/engine/notify.ts` | 알림 전송 헬퍼 (신규) | F1/F2에서 작성할 텔레그램 함수 위치 |
| `src/app/api/engine/route.ts` | 오케스트레이터만 유지 | GET/POST 핸들러 + `runEngine()` 호출 구조만 (~150줄 목표) |

**예상 결과 줄 수**: route.ts ~150줄, steps.ts ~320줄, notify.ts ~80줄 (F1/F2 구현 후)

---

## 4. 기능별 상세 계획

---

### F1. 실시간 매매 알림

**우선순위**: 높음 | **버전**: v5.10.0 | **공수**: 중

#### 목적
매수/매도/손절 발생 시 텔레그램 봇으로 즉시 알림을 보내, 엔진 실행 결과를 실시간으로 모니터링한다.

#### 구현 방법

1. **텔레그램 봇 설정**
   - Vercel 환경변수에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 추가
   - 클라이언트에는 절대 노출하지 않음 (서버 전용)

2. **notify.ts 신규 작성** (`src/lib/engine/notify.ts`)
   ```
   sendTradeAlert(type: "buy" | "sell" | "stop_loss" | "take_profit" | "max_hold_sell", params)
   sendDailyReport(params)  — F2에서 사용
   ```
   - 텔레그램 `sendMessage` API 직접 호출 (외부 라이브러리 불필요)
   - 전송 실패 시 `try/catch` 무시 처리 (알림 실패로 엔진 중단 금지)

3. **engine/route.ts 연동**
   - STEP 1 (손절/익절/max_hold_sell) 성공 시 `sendTradeAlert` 호출
   - STEP 1.5 (승인 매수) 성공 시 호출
   - STEP 2/3 (watchlist/급등주 매수) 성공 시 호출

#### 알림 메시지 형식
```
[NEXIO] 매수 체결
종목: 삼성전자 (005930)
수량: 10주 @ 75,000원
점수: 72점 (learned)
포지션: 750,000원
```

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/lib/engine/notify.ts` | 신규 생성 |
| `src/app/api/engine/route.ts` | `sendTradeAlert` 호출 추가 |
| Vercel 환경변수 | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 추가 |

#### DB 변경

없음

#### 성공 기준

- 매수/매도/손절 각 시나리오에서 텔레그램 메시지 수신 확인
- 알림 전송 실패 시 엔진이 계속 실행됨 확인

---

### F2. 일일 매매 리포트

**우선순위**: 높음 | **버전**: v5.11.0 | **공수**: 중

#### 목적
장 종료 후 당일 수익/손실/포지션 요약을 텔레그램으로 자동 발송하여 일일 성과를 추적한다.

#### 구현 방법

1. **리포트 API 엔드포인트 신규 작성** (`src/app/api/daily-report/route.ts`)
   - GitHub Actions 또는 Vercel Cron에서 15:30 KST에 트리거
   - Supabase `positions` 테이블에서 당일 closed 포지션 집계
   - `engine_runs` 테이블에서 당일 실행 횟수/스캔 종목 수 집계

2. **GitHub Actions cron 추가** (`.github/workflows/engine-cron.yml`)
   - 기존 4회 크론과 별개로 15:30 KST 리포트 크론 추가
   - `GET /api/daily-report` 호출

3. **notify.ts `sendDailyReport()` 함수**
   - F1에서 작성한 notify.ts에 함수 추가

#### 리포트 메시지 형식
```
[NEXIO] 일일 리포트 — 2026-04-17
────────────────
거래: 3건 (매수 2 / 매도 1)
실현손익: +12,500원 (+1.8%)
보유중: 2종목
엔진실행: 4회 / 스캔: 32종목
────────────────
손익 상세:
  삼성전자: +8,200원 (+1.2%) [익절]
  카카오: -3,100원 (-0.8%) [손절]
```

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/app/api/daily-report/route.ts` | 신규 생성 |
| `src/lib/engine/notify.ts` | `sendDailyReport()` 추가 |
| `.github/workflows/engine-cron.yml` | 15:30 크론 추가 |

#### DB 변경

없음 (기존 `positions`, `engine_runs` 테이블 조회만)

#### 성공 기준

- 15:30 KST에 텔레그램 리포트 수신 확인
- 당일 거래가 없는 날에도 "거래 없음" 리포트 발송 확인

---

### F3. 비상 정지 스위치

**우선순위**: 높음 | **버전**: v5.12.0 | **공수**: 소

#### 목적
예상치 못한 시장 충격이나 엔진 오작동 시, 설정 탭 UI에서 즉시 엔진을 중단할 수 있는 킬 스위치를 제공한다.

#### 구현 방법

1. **DB 플래그 추가** (`engine_config` 테이블 또는 `app_config` 신규 테이블)
   - 컬럼: `engine_enabled BOOLEAN DEFAULT true`
   - 엔진 실행 최상단에서 이 플래그 조회 후 `false`이면 즉시 반환

2. **API 엔드포인트** (`src/app/api/engine-control/route.ts`)
   - `POST { enabled: boolean }` — 플래그 변경 (서버 측 업데이트만)
   - `GET` — 현재 플래그 상태 반환

3. **설정 탭 UI 추가** (`src/components/settings/settings-tab.tsx`)
   - 빨간색 "엔진 정지" / 초록색 "엔진 활성" 토글 버튼
   - 정지 시 확인 다이얼로그 표시 (실수 방지)

4. **engine/route.ts 상단에 플래그 체크 삽입**
   ```typescript
   const { data: ctrl } = await supabase.from("app_config").select("engine_enabled").single();
   if (!ctrl?.engine_enabled) {
     return NextResponse.json({ skipped: true, reason: "비상 정지 활성" });
   }
   ```

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/app/api/engine-control/route.ts` | 신규 생성 |
| `src/app/api/engine/route.ts` | 플래그 체크 추가 (5줄 내외) |
| `src/components/settings/settings-tab.tsx` | 비상 정지 토글 UI 추가 |

#### DB 변경

```sql
-- Supabase에 신규 테이블 또는 컬럼 추가
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO app_config (key, value) VALUES ('engine_enabled', 'true');
```

#### 성공 기준

- 설정 탭에서 정지 버튼 클릭 → 다음 크론 실행 시 엔진 건너뜀 확인
- UI에서 재활성화 → 정상 실행 복귀 확인

---

### F4. 최대 포지션 수 제한

**우선순위**: 높음 | **버전**: v5.13.0 | **공수**: 소

#### 목적
동시 보유 종목 수에 상한선을 두어 집중 리스크를 제어한다. 현재는 `maxDailyTrades`(1일 횟수)만 있고 동시 보유 수 제한이 없다.

#### 구현 방법

1. **EngineConfig에 `maxPositions` 필드 추가** (`src/lib/engine/types.ts`)
   ```typescript
   maxPositions?: number;  // 기본값: 5
   ```

2. **engine/route.ts STEP 1.5/2/3 매수 진입 전 체크**
   ```typescript
   const openCount = holdings.filter((h) => Number(h.hldg_qty) > 0).length;
   if (openCount >= (config.maxPositions ?? 5)) {
     // 매수 스킵, 로그 추가
     continue;
   }
   ```

3. **설정 탭 UI 추가** (`src/components/settings/settings-tab.tsx`)
   - SETTING_METAS에 `maxPositions` 항목 추가 (1~10, 기본값 5)

4. **Zustand store 추가** (`src/lib/store.ts`)
   - `tradeSettings`에 `maxPositions: number` 필드 추가

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/lib/engine/types.ts` | `maxPositions` 필드 추가 |
| `src/app/api/engine/route.ts` | 매수 진입 전 포지션 수 체크 |
| `src/lib/store.ts` | `maxPositions` 상태 추가 |
| `src/components/settings/settings-tab.tsx` | `maxPositions` 설정 항목 추가 |

#### DB 변경

없음 (KIS 잔고 `holdings` 배열 카운트로 처리)

#### 성공 기준

- 보유 종목이 `maxPositions` 이상일 때 매수 시도 없음 확인
- 설정 탭에서 값 변경 후 다음 엔진 실행에 반영 확인

---

### F5. 백테스트 UI

**우선순위**: 중간 | **버전**: v6.0.0 | **공수**: 대

#### 목적
`src/lib/backtest.ts`에 구현된 백테스트 엔진을 UI로 연결하여, 전략 파라미터 변경 전 과거 데이터로 성과를 검증할 수 있게 한다.

#### 구현 방법

1. **백테스트 API 개선** (`src/app/api/backtest/route.ts` — 이미 존재 확인 필요)
   - 입력: 종목코드, 기간, 손절/익절/트레일링 파라미터
   - KIS `/uapi/domestic-stock/v1/quotations/inquire-daily-price`로 과거 캔들 수집
   - `runBacktest()` 실행 후 결과 반환

2. **백테스트 UI 컴포넌트** (`src/components/stats/backtest-section.tsx` — 파일 존재, 내용 확인 필요)
   - 종목 검색 + 기간 선택 입력
   - 결과: 총 수익률, 승률, 최대 낙폭, 월별 수익 차트
   - `Sparkline` 컴포넌트 재사용

3. **stats-tab.tsx에 백테스트 섹션 통합**

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/app/api/backtest/route.ts` | 내용 확인 후 보완 |
| `src/components/stats/backtest-section.tsx` | UI 구현 (현재 stub 가능성) |
| `src/components/stats/stats-tab.tsx` | 백테스트 섹션 연결 |

#### DB 변경

없음 (KIS API 실시간 조회 + 클라이언트 계산)

#### 성공 기준

- 종목코드 + 기간 입력 → 백테스트 결과(수익률, 승률, 낙폭) 표시 확인
- 파라미터 변경 → 결과 재계산 확인

---

### F6. 엔진 실행 로그 뷰어

**우선순위**: 중간 | **버전**: v6.0.0 | **공수**: 중

#### 목적
`engine_runs` 테이블에 쌓이는 실행 로그를 UI에서 확인하여, 엔진이 언제 어떤 액션을 취했는지 투명하게 보여 준다.

#### 구현 방법

1. **API 개선** (`src/app/api/engine-log/route.ts` — 이미 존재)
   - 현재는 최근 5건에서 `market_context` + `filter` 로그만 추출
   - 전체 actions 배열을 페이지네이션으로 반환하도록 확장
   - 쿼리 파라미터: `?page=1&limit=20`

2. **로그 뷰어 컴포넌트 신규 작성** (`src/components/stats/engine-log-section.tsx`)
   - 실행 시각, 거래 수, 스캔 수, 소요 시간 카드
   - 액션 목록: 타입별 아이콘(매수/매도/손절/필터탈락/오류) + 상세 텍스트
   - 무한 스크롤 또는 페이지네이션

3. **stats-tab.tsx에 로그 뷰어 탭/섹션 추가**

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/app/api/engine-log/route.ts` | 페이지네이션 + 전체 actions 반환 확장 |
| `src/components/stats/engine-log-section.tsx` | 신규 생성 |
| `src/components/stats/stats-tab.tsx` | 로그 섹션 추가 |

#### DB 변경

없음 (기존 `engine_runs` 테이블 활용)

#### 성공 기준

- 최근 20건 엔진 실행 로그 표시 확인
- 매수/매도/필터탈락 각 액션 타입 구분 표시 확인

---

### F7. 장 종료 자동 정산

**우선순위**: 중간 | **버전**: v6.0.0 | **공수**: 중

#### 목적
15:20 이후 남은 미체결 주문을 자동 취소하고 포지션 상태를 정리하여, 당일 데이터 불일치를 방지한다.

#### 구현 방법

1. **정산 API 신규 작성** (`src/app/api/market-close/route.ts`)
   - KIS `cancelOpenBuyOrders()` 전체 실행 (STEP 0과 동일 로직, 단 전량 취소)
   - `positions` 테이블에서 status="open"인 종목 목록 조회
   - KIS 잔고 조회 후 실제 보유와 DB 포지션 불일치 감지 → `status="mismatch"` 마킹
   - `app_config`에 `last_close_at` 기록

2. **GitHub Actions 크론 추가**
   - 15:25 KST 실행 (장 종료 후 5분)
   - F2 일일 리포트(15:30) 이전에 정산 완료

3. **정산 후 텔레그램 알림** (F1 notify.ts 활용)
   - "미체결 N건 취소 완료" 메시지

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/app/api/market-close/route.ts` | 신규 생성 |
| `.github/workflows/engine-cron.yml` | 15:25 크론 추가 |
| `src/lib/engine/notify.ts` | 정산 알림 함수 추가 |

#### DB 변경

`positions` 테이블에 `status="mismatch"` 값 추가 (기존 체크 제약 확인 필요)

#### 성공 기준

- 15:25에 미체결 취소 실행 확인
- positions 테이블 불일치 감지 로그 확인

---

### F8. ABCompareCard

**우선순위**: 낮음 | **버전**: v6.1.0 | **공수**: 소

#### 목적
`base_score`(기본 가중치)와 `learned_score`(학습 가중치) 차이를 카드 UI로 시각화하여, 자가학습 효과를 직관적으로 확인한다.

#### 구현 방법

1. **ABCompareCard 컴포넌트 신규 작성** (`src/components/stats/ab-compare-card.tsx`)
   - `trade_memory` 테이블의 `base_score`, `learned_score` 컬럼 활용
   - 최근 N건의 평균 비교 + 시계열 차트

2. **learning-section.tsx에 카드 통합**

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/components/stats/ab-compare-card.tsx` | 신규 생성 |
| `src/components/stats/learning-section.tsx` | ABCompareCard 삽입 |

#### DB 변경

없음 (기존 `trade_memory` 테이블 활용)

---

### F9. 섹터별 분산 제한

**우선순위**: 낮음 | **버전**: v6.1.0 | **공수**: 대

#### 목적
동일 섹터(예: 반도체, 2차전지) 종목이 포트폴리오의 일정 비중 이상이 되면 추가 매수를 차단하여 섹터 집중 리스크를 제어한다.

#### 구현 방법

1. **섹터 데이터 소스 결정**
   - KIS API에 섹터 코드 제공 여부 확인 필요 (`/uapi/domestic-stock/v1/quotations/inquire-stock-info`)
   - 없을 경우: `watchlist` 테이블에 `sector` 컬럼 수동 입력 방식으로 대체

2. **섹터 체크 함수** (`src/lib/engine/filters.ts`에 추가)
   ```typescript
   checkSectorLimit(holdingCodes: string[], newCode: string, maxSectorRatio: number): boolean
   ```

3. **EngineConfig에 `maxSectorRatio` 필드 추가** (`src/lib/engine/types.ts`)

4. **설정 탭 UI 추가**

#### 영향 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/lib/engine/filters.ts` | `checkSectorLimit()` 추가 |
| `src/lib/engine/types.ts` | `maxSectorRatio` 필드 추가 |
| `src/app/api/engine/route.ts` | 섹터 체크 호출 |
| `src/components/settings/settings-tab.tsx` | 설정 항목 추가 |

#### DB 변경

`watchlist` 테이블에 `sector TEXT` 컬럼 추가 (선택적)

---

## 5. 기능별 요약표

| # | 기능 | 우선순위 | 버전 | 공수 | DB 변경 | 의존성 |
|---|------|:--------:|------|:----:|:-------:|--------|
| 사전 | engine/route.ts 분리 | 긴급 | v5.9.1 | 소 | 없음 | 없음 |
| F1 | 실시간 매매 알림 | 높음 | v5.10.0 | 중 | 없음 | engine 분리 완료 후 |
| F2 | 일일 매매 리포트 | 높음 | v5.11.0 | 중 | 없음 | F1 notify.ts 완료 후 |
| F3 | 비상 정지 스위치 | 높음 | v5.12.0 | 소 | 있음 | 없음 |
| F4 | 최대 포지션 수 제한 | 높음 | v5.13.0 | 소 | 없음 | 없음 |
| F5 | 백테스트 UI | 중간 | v6.0.0 | 대 | 없음 | 없음 |
| F6 | 엔진 실행 로그 뷰어 | 중간 | v6.0.0 | 중 | 없음 | 없음 |
| F7 | 장 종료 자동 정산 | 중간 | v6.0.0 | 중 | 있음 | F1 notify.ts 완료 후 |
| F8 | ABCompareCard | 낮음 | v6.1.0 | 소 | 없음 | 없음 |
| F9 | 섹터별 분산 제한 | 낮음 | v6.1.0 | 대 | 있음 | 없음 |

> 공수 기준: 소 = 반나절 이내 / 중 = 1~2일 / 대 = 3일 이상

---

## 6. MoSCoW 우선순위

| 분류 | 기능 | 사유 |
|------|------|------|
| **Must** | engine 분리, F1 알림, F3 비상정지, F4 포지션한도 | 운영 안전성 필수 |
| **Should** | F2 일일리포트, F5 백테스트UI, F6 로그뷰어 | 운영 가시성/품질 향상 |
| **Could** | F7 자동정산 | 데이터 정합성 개선이나 수동 처리 가능 |
| **Won't** (v6.0) | F8 ABCompareCard, F9 섹터분산 | 학습 데이터 50건 이상 누적 후 의미 있음 |

---

## 7. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 500줄 제한 | 분리 후 route.ts 150줄 이내 |
| 단일 책임 | notify.ts, steps.ts, engine-control/route.ts 각 파일 역할 명확 분리 |
| 서버 검증 | `TELEGRAM_BOT_TOKEN`, `engine_enabled` 플래그 등 모든 민감 데이터 서버 전용 |
| 알림 실패 내성 | 텔레그램 전송 실패가 엔진 실행에 영향 주지 않음 |
| 크론 중복 방지 | 기존 4회 엔진 크론과 신규 정산/리포트 크론 시간대 겹침 없음 |

---

## 8. 환경변수 추가 목록

| 변수명 | 목적 | 추가 버전 | 노출 범위 |
|--------|------|-----------|-----------|
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 인증 | v5.10.0 | 서버 전용 |
| `TELEGRAM_CHAT_ID` | 수신 채널 ID | v5.10.0 | 서버 전용 |
| `ADMIN_SECRET` | 엔진 제어 Server Action 인증 | v5.15.0 | 서버 전용 |

---

## 8-1. 배포 전 API 보안 체크리스트

> **매 배포 전 `app/api/` 전체 폴더** 대상으로 확인 (변경 파일만 보지 않는다)

| 항목 | 확인 내용 | 위반 시 조치 |
|------|----------|-------------|
| 인증 없는 변이 핸들러 | POST/PUT/DELETE에 `CRON_SECRET` 또는 `ADMIN_SECRET` 검증 없음 | 배포 중단 → 인증 추가 후 재배포 |
| Dead code API endpoint | 클라이언트(컴포넌트/훅/Server Action)에서 호출하지 않는 핸들러 | 즉시 삭제 |

---

## 9. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 텔레그램 API 장애 | 알림 미수신 | `try/catch` 무시 처리, 엔진 독립 실행 보장 |
| `app_config` 테이블 조회 지연 | 비상정지 체크 지연 | Supabase 단일 row 조회 — 지연 최소화 |
| KIS API 과거 데이터 한도 | 백테스트 기간 제한 | 최대 100일 캔들로 제한 (KIS 일별 조회 한도 기준) |
| engine 분리 중 기능 회귀 | 매매 중단 | 분리 후 동일 시나리오 수동 테스트 (STEP별 단위 검증) |

---

## 10. 다음 단계

1. [ ] `engine/route.ts` 분리 계획 대장 확인 후 v5.9.1 배포
2. [ ] 텔레그램 봇 토큰 발급 및 Vercel 환경변수 등록
3. [ ] F1 실시간 알림 구현 → v5.10.0 배포
4. [ ] F2 일일 리포트 구현 → v5.11.0 배포
5. [ ] F3 비상 정지 DB 마이그레이션 실행 → F3 구현 → v5.12.0 배포
6. [ ] F4 최대 포지션 제한 구현 → v5.13.0 배포
7. [ ] F5/F6/F7 묶음 구현 → v6.0.0 배포

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-17 | Initial draft | Product Manager |
