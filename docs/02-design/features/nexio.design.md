# NEXIO 신뢰 시스템 완성 설계서 (v7.1)

> 기반 기획서: `docs/01-plan/features/nexio.plan.md`
> 작성일: 2026-05-02
> 구현 범위: P0~P2 전체 설계 (구현 코드 없음)

---

## 1. 아키텍처 및 컴포넌트 구조

### 1.1 변경 원칙

| 원칙 | 적용 방향 |
|------|---------|
| 보안 우선 | 민감 자격증명(appSecret)을 URL 쿼리에서 Request Body로 이동 |
| 자가진단 | 엔진 가동 전 환경변수 검증을 단일 지점에서 수행 |
| 안정성 | 중복 실행 방지 / 고립 데이터 정리 / 네트워크 재시도를 엔진 입구에서 처리 |
| 단일 책임 | 재시도 로직은 독립 유틸로 분리, 검증 로직은 별도 파일로 분리 |

### 1.2 파일 분리 계획

#### 신규 생성

```
src/lib/config-validator.ts        — 필수 환경변수 검증 (P0)
src/lib/engine/retry.ts            — 지수 백오프 재시도 래퍼 (P1)
tests/core.spec.ts                 — Playwright E2E 핵심 경로 테스트 (P2)
playwright.config.ts               — Playwright 설정 (P2)
```

#### 수정 대상

```
src/app/api/kis/balance/route.ts   — GET → POST 전환, 바디에서 자격증명 수신 (P0)
src/app/api/kis/price/route.ts     — GET → POST 전환, 바디에서 자격증명 수신 (P0)
src/lib/kis/client.ts              — fetchBalance / fetchPrice POST 방식으로 변경 (P0)
src/app/api/engine/route.ts        — 환경변수 검증 + 중복 실행 방지 + 고립 정리 추가 (P0/P1)
src/lib/engine/db.ts               — cleanupStalePendingOrders() 추가 (P1)
```

### 1.3 모듈 의존성 다이어그램 (변경 후)

```
[클라이언트]
  src/lib/kis/client.ts
    ├── fetchBalance()  →  POST /api/kis/balance  (body에 자격증명)
    └── fetchPrice()   →  POST /api/kis/price     (body에 자격증명)

[서버 — 엔진 진입점]
  GET /api/engine
    ├── 1. validateRequiredEnv()        ← src/lib/config-validator.ts
    ├── 2. 엔진 락 확인 (app_config)    ← supabase
    ├── 3. cleanupStalePendingOrders()  ← src/lib/engine/db.ts
    ├── 4. resolveKisCredentials()
    │     └── withRetry(issueKisToken)  ← src/lib/engine/retry.ts
    └── 5. runEngine()

[서버 — KIS 프록시]
  POST /api/kis/balance
    └── Request Body: { appKey, appSecret, token, accountNo }
  POST /api/kis/price
    └── Request Body: { code, appKey, appSecret, token, accountNo? }
```

---

## 2. 데이터 모델

### 2.1 신규 타입 (`src/lib/config-validator.ts`)

```typescript
// 환경변수 그룹별 필수 목록
const REQUIRED_ENV_GROUPS = {
  supabase:  ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  auth:      ['CRON_SECRET', 'ADMIN_SECRET', 'ADMIN_PASSWORD'],
  telegram:  ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
} as const;

// KIS 환경변수는 DB 설정(kis_config)으로 대체 가능 → 별도 경고(warn) 그룹
const WARN_ENV_GROUPS = {
  kis: ['KIS_APP_KEY', 'KIS_APP_SECRET', 'KIS_ACCOUNT_NO'],
} as const;

interface ConfigValidationResult {
  ok: boolean;            // required 그룹 전부 통과 시 true
  missing: string[];      // 누락된 환경변수 이름 목록
  warnings: string[];     // warn 그룹 누락 (오류 아님, 로그만)
}
```

**`validateRequiredEnv()` 반환 규칙:**
- `missing`에 항목이 하나라도 있으면 `ok = false`
- `ok = false` 시 호출부에서 Telegram 알림 + 즉시 종료

### 2.2 신규 타입 (`src/lib/engine/retry.ts`)

```typescript
interface RetryOptions {
  maxAttempts: number;    // default: 3
  baseDelayMs: number;    // default: 1000 (ms)
  maxDelayMs?: number;    // default: 10000 (ms)
}

// 시그니처
async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T>
```

**백오프 계산식:**
```
delay = min(baseDelayMs × 2^(attempt - 1), maxDelayMs)
```
- attempt 1 → 즉시 실행
- attempt 2 → 1초 후 재시도
- attempt 3 → 2초 후 재시도
- (maxDelayMs = 10초 상한)
- 모든 시도 실패 시 마지막 에러를 throw

### 2.3 DB 스키마 변경

#### pending_orders — 컬럼 추가 없음, 기존 구조 그대로 활용

고립 정리(Stale State Cleanup)는 기존 `created_at` 컬럼으로 30분 컷오프 적용:

```sql
DELETE FROM pending_orders
WHERE created_at < now() - INTERVAL '30 minutes';
```

#### app_config — 엔진 락 키 추가 (스키마 변경 없음)

| key | value 타입 | 용도 |
|-----|-----------|------|
| `engine_lock` | ISO 8601 string (lock 시각) or null | 중복 실행 방지 |

**락 로직:**
- 엔진 시작 시: `engine_lock` 값이 존재하고 설정 시각이 5분 이내 → skip (already running)
- 락 획득: `engine_lock = new Date().toISOString()` upsert
- 엔진 종료 시: `engine_lock = null` upsert (정상 완료 / 에러 모두)
- 5분 TTL은 비정상 종료(Vercel timeout) 시 자동 만료 보장

> **선택 근거:** `engine_runs`에 status 컬럼 추가 없이, `app_config`의 기존 key-value 패턴 재사용. 스키마 마이그레이션 불필요.

### 2.4 `src/lib/engine/db.ts` — 신규 함수 시그니처

```typescript
// 30분 이상 경과한 pending_orders 일괄 삭제
export async function cleanupStalePendingOrders(
  cutoffMinutes = 30
): Promise<void>
```

---

## 3. API 스펙

### 3.1 변경 엔드포인트

---

#### `POST /api/kis/balance` ← GET에서 변경

**설명:** KIS 계좌 잔고 조회. 자격증명을 Request Body로 수신하여 URL 로그 노출 방지.
**인증:** 필요 (미들웨어 세션 검증)

**Request Body:**
```json
{
  "appKey":    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "appSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token":     "eyJ...",
  "accountNo": "50123456-01"
}
```

**Response — 200 (성공):**
```json
{
  "holdings": [
    {
      "code":         "005930",
      "name":         "삼성전자",
      "market":       "KOSPI",
      "quantity":     10,
      "avgPrice":     72000,
      "currentPrice": 75000,
      "pnl":          30000,
      "pnlRate":      4.17
    }
  ],
  "totalEval":    10750000,
  "totalPnl":     30000,
  "totalPnlRate": 0.28,
  "cashBalance":  5000000
}
```

**Response — 400 (필수 파라미터 누락):**
```json
{ "error": "appKey, appSecret, token, accountNo 필수" }
```

**Response — 401 (KIS 토큰 만료):**
```json
{ "error": "토큰이 만료되었습니다", "kisCode": "EGW00201" }
```

**Response — 500 (KIS 오류 / 서버 오류):**
```json
{ "error": "잔고 조회 실패", "kisCode": "...", "kisMessage": "..." }
```

**변경 포인트:**
- 핸들러 메서드: `GET` → `POST`
- 자격증명 추출: `req.nextUrl.searchParams.get(...)` → `await req.json()`
- 기존 에러 핸들링(`sendKISApiErrorAlert`) 그대로 유지

---

#### `POST /api/kis/price` ← GET에서 변경

**설명:** 종목 현재가 조회. balance와 동일하게 자격증명을 바디로 수신.
**인증:** 필요

**Request Body:**
```json
{
  "code":      "005930",
  "appKey":    "xxxxxxxx",
  "appSecret": "xxxxxxxx",
  "token":     "eyJ...",
  "accountNo": ""
}
```

**Response — 200 (성공):**
```json
{
  "output": {
    "stck_prpr":     "75000",
    "hts_kor_isnm":  "삼성전자",
    "prdy_vrss":     "1000",
    "prdy_ctrt":     "1.35",
    "acml_vol":      "12345678",
    "stck_hgpr":     "76000",
    "stck_lwpr":     "74000",
    "stck_oprc":     "74500"
  }
}
```

**Response — 400 (필수 파라미터 누락):**
```json
{ "error": "code, appKey, appSecret, token 필수" }
```

**Response — 500 (KIS 오류):**
```json
{ "error": "시세 조회 실패" }
```

---

### 3.2 기존 엔드포인트 — 동작 변경 (인터페이스 불변)

---

#### `GET /api/engine` ← 동작 확장 (요청/응답 형태 동일)

**설명:** 매매 엔진 실행. 기존 인터페이스 그대로 유지하되, 진입부에 검증 + 안전장치 추가.
**인증:** 필요 (CRON_SECRET 기반, middleware 처리)

**Request:** 없음 (기존과 동일)

**Response — 200 (정상 실행, 기존과 동일):**
```json
{
  "timestamp":   "2026-05-02T10:30:00.000Z",
  "tradeCount":  2,
  "scannedCount": 25,
  "durationMs":  8421,
  "actions": [...]
}
```

**Response — 200 (건너뜀 — 이미 실행 중):**
```json
{ "skipped": true, "reason": "engine_lock: 이미 실행 중 (since: 2026-05-02T10:25:00.000Z)" }
```

**Response — 500 (환경변수 누락):**
```json
{ "error": "환경변수 검증 실패", "missing": ["TELEGRAM_BOT_TOKEN", "CRON_SECRET"] }
```

**진입부 실행 순서 (변경 후):**
```
1. validateRequiredEnv()               ← 신규. 실패 시 Telegram 알림 + 즉시 500 반환
2. app_config 'engine_lock' 확인       ← 신규. 5분 이내 락 존재 시 skipped 반환
3. app_config 'engine_lock' 획득       ← 신규. ISO timestamp upsert
4. cleanupStaleSignals()               ← 기존 유지
5. cleanupStalePendingOrders()         ← 신규. 30분 초과 pending_orders 삭제
6. getEngineSkipReason() 확인          ← 기존 유지 (장 휴장 등)
7. resolveKisCredentials()
   └── withRetry(issueKisToken, { maxAttempts: 3, baseDelayMs: 1000 })  ← 기존 2회→3회 + 지수백오프
8. runEngine()
9. [finally] app_config 'engine_lock' = null  ← 신규. 정상/오류 모두 락 해제
```

---

### 3.3 클라이언트 함수 변경 (`src/lib/kis/client.ts`)

인터페이스(함수 시그니처)는 변경 없음. 내부 HTTP 방식만 변경.

| 함수 | 변경 전 | 변경 후 |
|------|---------|---------|
| `fetchBalance(config)` | `fetch('/api/kis/balance?' + params)` GET | `fetch('/api/kis/balance', { method: 'POST', body: JSON.stringify(creds) })` |
| `fetchPrice(config, code)` | `fetch('/api/kis/price?' + params)` GET | `fetch('/api/kis/price', { method: 'POST', body: JSON.stringify({ code, ...creds }) })` |
| `fetchPrices(config, codes)` | `fetchPrice()` 루프 | 동일 (`fetchPrice` 수정되면 자동 반영) |

---

## 4. 구현 순서

### Phase 1 — P0-①: 환경변수 검증 (백엔드)

**목적:** 런타임 `undefined` 오류 → 시작 전 조기 감지

1. **`src/lib/config-validator.ts`** 신규 생성
   - `REQUIRED_ENV_GROUPS` 정의 (supabase / auth / telegram)
   - `validateRequiredEnv(): ConfigValidationResult` 구현

2. **`src/app/api/engine/route.ts`** 진입부 수정
   - `GET()` 핸들러 최상단에서 `validateRequiredEnv()` 호출
   - `ok = false` 시: Telegram 알림(`sendEngineErrorAlert`) 발송 후 500 반환
   - 단, Telegram 자체 env가 누락인 경우 console.error 로깅으로 폴백

---

### Phase 2 — P0-②: balance/price POST 전환 (백엔드 → 클라이언트)

**목적:** appSecret URL 노출 제거

3. **`src/app/api/kis/balance/route.ts`**
   - `GET` → `POST` 핸들러
   - `req.nextUrl.searchParams` → `await req.json()` (타입 검증 포함)

4. **`src/app/api/kis/price/route.ts`**
   - 동일 패턴 적용

5. **`src/lib/kis/client.ts`**
   - `params()` 헬퍼 제거 (URLSearchParams 빌더 불필요)
   - `fetchBalance`, `fetchPrice` → POST + Content-Type: application/json

---

### Phase 3 — P1: 엔진 자가복구 (백엔드)

**목적:** 중복 실행 방지, 고립 상태 정리, 네트워크 재시도

6. **`src/lib/engine/retry.ts`** 신규 생성
   - `withRetry<T>(fn, options?)` 구현
   - 지수 백오프 + maxDelayMs 상한 적용

7. **`src/lib/engine/db.ts`**
   - `cleanupStalePendingOrders(cutoffMinutes = 30)` 추가
   - Supabase DELETE where `created_at < now() - cutoffMinutes`

8. **`src/app/api/engine/route.ts`** 자가복구 로직 추가
   - 엔진 락 체크/획득/해제 로직 구현 (`app_config` key: `engine_lock`)
   - `cleanupStalePendingOrders()` 호출 추가
   - `issueKisToken` → `withRetry(issueKisToken, { maxAttempts: 3 })` 래핑
   - try-finally 블록으로 락 해제 보장

---

### Phase 4 — P2: 핵심 경로 E2E 테스트

**목적:** 코드 수정 후 핵심 흐름 회귀 자동 감지

9. **`playwright.config.ts`** 신규 생성
   - `baseURL`: `http://localhost:3000`
   - `testDir`: `./tests`
   - `use.storageState`: 인증 상태 재사용 설정

10. **`tests/core.spec.ts`** 신규 생성
    - **TC-01 Login**: 관리자 로그인 성공 → 대시보드 리다이렉트 확인
    - **TC-02 Dashboard**: 잔고 / 포트폴리오 영역 렌더링 확인 (데이터 없어도 UI 깨지지 않음)
    - **TC-03 Settings**: KIS 설정 섹션 표시 확인 (appKey 입력 폼 존재 여부)

---

## 5. 절대규칙 준수 체크리스트

---

### ① 페이지 500줄 제한

| 파일 | 현재 | 변경 후 예상 | 판정 |
|------|------|------------|------|
| `src/app/api/engine/route.ts` | 368줄 | ~420줄 (락/검증/정리 추가) | ✅ 500줄 미만 |
| `src/app/api/kis/balance/route.ts` | 47줄 | ~50줄 (GET→POST) | ✅ |
| `src/app/api/kis/price/route.ts` | 23줄 | ~26줄 (GET→POST) | ✅ |
| `src/lib/kis/client.ts` | 124줄 | ~110줄 (params() 헬퍼 제거) | ✅ |
| `src/lib/config-validator.ts` | 신규 | ~40줄 | ✅ |
| `src/lib/engine/retry.ts` | 신규 | ~35줄 | ✅ |
| `src/lib/engine/db.ts` | 327줄 | ~345줄 (함수 1개 추가) | ✅ |
| `tests/core.spec.ts` | 신규 | ~80줄 | ✅ |

---

### ② 단일 책임

| 파일 | 책임 |
|------|------|
| `config-validator.ts` | 환경변수 검증만 담당 |
| `retry.ts` | 재시도/백오프 로직만 담당 |
| `balance/route.ts` | KIS 잔고 조회 프록시만 담당 |
| `price/route.ts` | KIS 시세 조회 프록시만 담당 |
| `client.ts` | 클라이언트→API Route 호출 어댑터만 담당 |
| `db.ts` | Supabase DB 헬퍼 전담 (신규 함수도 동일 파일 내 DB 책임 범위) |

> `engine/route.ts`는 오케스트레이터 역할로 500줄 이내라면 복수 단계를 포함해도 적절.
> 검증/재시도/정리 로직은 각각 별도 파일로 분리되어 route.ts 자체는 조합만 담당.

---

### ③ 서버 검증·보안

| 항목 | 처리 방식 |
|------|---------|
| `appSecret` URL 노출 | POST Body 이동으로 제거 (핵심 목표) |
| 요청 바디 검증 | `balance/route.ts`, `price/route.ts` 에서 필드 존재 여부 서버 검증 |
| Telegram 알림 내용 | `missing: string[]` 에 변수명만 포함 — 값(실제 secret)은 절대 포함 금지 |
| 환경변수 에러 응답 | 500 응답에 `missing` 키 이름만 노출 (값 노출 금지) |
| 인증 | 모든 KIS 프록시 API + engine route — 기존 middleware 세션 검증 그대로 유지 |
| 엔진 락 | `app_config` 쓰기는 서버 사이드에서만 발생 (클라이언트 직접 접근 불가) |

---

### ④ 성능 (중복 호출 방지)

| 항목 | 처리 방식 |
|------|---------|
| 중복 엔진 실행 | `engine_lock` 5분 TTL 락으로 중복 실행 방지 |
| 재시도 남용 | `withRetry`는 KIS 토큰 발급에만 적용. 일반 조회 API는 적용 안 함 |
| pending_orders 누적 | 30분 초과 레코드 정리로 테이블 비대화 방지 |
| `fetchBalance` 변경 | GET→POST 전환 자체는 추가 API 호출 없음 |
| `cleanupStalePendingOrders` | 엔진 실행마다 1회 DELETE — 가벼운 인덱스 쿼리 (created_at 기반) |

---

### ⑤ 폴더 구조

| 파일 | 위치 | 준수 여부 |
|------|------|---------|
| 환경변수 검증 | `src/lib/config-validator.ts` | ✅ lib/ (공용 유틸) |
| 재시도 래퍼 | `src/lib/engine/retry.ts` | ✅ lib/engine/ (엔진 전용 유틸) |
| DB 헬퍼 확장 | `src/lib/engine/db.ts` (기존 파일) | ✅ 기존 책임 범위 내 확장 |
| API 라우트 수정 | `src/app/api/kis/` (기존 구조 유지) | ✅ |
| E2E 테스트 | `tests/` (프로젝트 루트) | ✅ Playwright 표준 위치 |
| Playwright 설정 | `playwright.config.ts` (프로젝트 루트) | ✅ |

---

## 부록: 현재 보안 취약점 요약

| 위치 | 취약점 | 해결 방법 |
|------|--------|---------|
| `GET /api/kis/balance` | appSecret이 URL 쿼리로 전송 → Nginx/Vercel 엑세스 로그, 브라우저 히스토리에 노출 | POST Body 전환 |
| `GET /api/kis/price` | 동일 문제 | POST Body 전환 |
| `src/lib/kis/client.ts` `params()` | URLSearchParams에 appSecret 포함 | POST + JSON body로 교체 |
| `GET /api/engine` | 환경변수 누락 시 런타임 중반에 실패 (운영자가 늦게 인지) | 진입부 즉시 검증 |

---

## 부록: E2E 테스트 케이스 상세

| TC | 이름 | 전제 조건 | 검증 항목 | 통과 기준 |
|----|------|---------|---------|---------|
| TC-01 | 로그인 | 앱 실행 중 | 관리자 ID/PW 입력 → 제출 | 대시보드 페이지(`/`) URL + 주요 UI 요소 1개 이상 표시 |
| TC-02 | 대시보드 렌더링 | TC-01 완료 | 잔고 영역, 포지션 영역 표시 | 에러 바운더리 미발동 + 영역 DOM 존재 |
| TC-03 | 설정 표시 | TC-01 완료 | 설정 탭 또는 섹션 진입 | KIS 설정 폼(appKey 입력) DOM 존재 |

> **환경 분리 원칙:** E2E 테스트는 staging/local 환경에서만 실행. `PLAYWRIGHT_BASE_URL` 환경변수로 대상 URL을 주입받는다. 프로덕션 KIS 계정을 테스트에 사용하지 않는다.
