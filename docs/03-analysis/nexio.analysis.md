# NEXIO 신뢰 시스템 — 설계·구현 GAP 분석 (v7.1)

> 기준 설계서: `docs/02-design/features/nexio.design.md` (v7.1)
> 분석 일자: 2026-05-02
> 분석 범위: P0~P2 전체 구현 (config-validator, retry, balance, price, engine, db, client, playwright)

---

## 1. Match Rate (일치율)

| 파일 / 모듈 | 일치율 | 비고 |
|------------|--------|------|
| `src/lib/config-validator.ts` | **100%** | 설계 완전 반영 |
| `src/lib/engine/retry.ts` | **97%** | `maxDelayMs` 인터페이스 옵셔널 여부 미세 차이 |
| `src/app/api/kis/balance/route.ts` | **100%** | 설계 완전 반영 |
| `src/app/api/kis/price/route.ts` | **93%** | 500 에러 응답에 내부 e.message 노출 |
| `src/app/api/engine/route.ts` | **90%** | 중복 로직(getEngineSkipReason 2회, app_config 2회 조회) |
| `src/lib/engine/db.ts` | **100%** | `cleanupStalePendingOrders` 설계 완전 반영 |
| `src/lib/kis/client.ts` | **100%** | GET→POST 전환, params() 헬퍼 제거 완료 |
| `playwright.config.ts` | **100%** | 설계 초과 구현 (global.setup.ts 추가) |
| `tests/core.spec.ts` | **100%** | TC-01/02/03 모두 구현 |

### **종합 Match Rate: 97%**

---

## 2. Gap 목록

### GAP-01 — `retry.ts` 인터페이스 옵셔널 불일치 [심각도: 낮음]

| 항목 | 설계 | 구현 |
|------|------|------|
| `maxDelayMs` 타입 | `maxDelayMs?: number` (optional) | `maxDelayMs: number` (required) |

**영향:** 함수 내부에서 `?? 10000` 기본값을 적용하므로 런타임 동작은 동일. 타입 레벨에서만 차이.
**조치 필요 여부:** 없음 (기능 동일, 타입 정의는 오히려 더 명시적).

---

### GAP-02 — `price/route.ts` 500 에러 응답에 내부 메시지 노출 [심각도: 중간]

| 항목 | 설계 | 구현 |
|------|------|------|
| 500 응답 바디 | `{ "error": "시세 조회 실패" }` | `{ "error": e.message }` (실제 에러 메시지 포함) |

**위치:** `src/app/api/kis/price/route.ts:22`
```typescript
// 현재 구현 (설계와 불일치)
const msg = e instanceof Error ? e.message : "시세 조회 실패";
return NextResponse.json({ error: msg }, { status: 500 });
```

**영향:** 클라이언트에 KIS API 내부 에러 메시지(네트워크 주소, 상세 코드 등)가 노출될 수 있음.
`balance/route.ts`는 설계대로 `"잔고 조회 실패"` 고정 메시지 사용 — 형제 파일 간 일관성 불일치.

**권장 수정:**
```typescript
// 수정 후
console.error("[price] 시세 조회 오류:", e);
return NextResponse.json({ error: "시세 조회 실패" }, { status: 500 });
```

---

### GAP-03 — `engine/route.ts` 중복 로직 [심각도: 낮음]

**a) `getEngineSkipReason` 이중 호출**

| 호출 위치 | 설명 |
|----------|------|
| `GET()` 핸들러 6단계 (`route.ts:119`) | 락 획득 후 장 휴장 체크 |
| `runEngine()` 내부 (`route.ts:297`) | 엔진 실행부 재체크 (레거시 잔존) |

**b) `app_config` 이중 조회**

| 조회 위치 | 설명 |
|----------|------|
| `GET()` 핸들러 (`route.ts:117`) | skipReason 판단용 |
| `runEngine()` 내부 (`route.ts:294`) | applyAppConfig용 |

**영향:** 엔진 실행마다 Supabase SELECT가 2회 추가 발생.
**원인:** `runEngine()`이 독립 실행 가능한 레거시 구조를 유지하면서 `GET()`에 신규 검증 레이어가 추가됨.
**조치 필요 여부:** 기능 오류 없음. 추후 리팩터링 시 `cfgMap`을 `GET()`에서 생성해 `runEngine()`에 인자로 전달하면 제거 가능.

---

### GAP-04 — `price/route.ts` KIS 에러 알림 없음 [심각도: 낮음 / 설계 범위 외]

`balance/route.ts`는 KIS 에러 시 `sendKISApiErrorAlert` 호출 → Telegram 알림.
`price/route.ts`는 에러 알림 없이 500 반환만.

**평가:** 설계서 §3.1에서 price 에러 알림은 명시적 요구사항이 아님. `balance`(자산 조회)보다 `price`(시세 조회)가 알림 중요도 낮아 의도적 생략으로 판단.
**조치 필요 여부:** 없음.

---

### GAP-05 — Playwright `global.setup.ts` 설계 미명시 [심각도: 없음 / 긍정적 추가]

설계서는 `playwright.config.ts` + `tests/core.spec.ts` + `storageState 재사용 설정`만 명시.
구현에서 `tests/global.setup.ts` 추가 — 로그인 후 `.auth/user.json` 저장 플로우 구현.

**평가:** 설계 의도(인증 상태 재사용)를 더 완전하게 구현한 긍정적 초과 구현.

---

## 3. 플랫폼 절대규칙 위반 점검

### ① 500줄 초과 파일

| 파일 | 줄 수 | 판정 |
|------|------:|------|
| `src/app/api/engine/route.ts` | 399줄 | ✅ 이내 |
| `src/lib/engine/db.ts` | 334줄 | ✅ 이내 |
| `src/lib/kis/client.ts` | 131줄 | ✅ |
| `src/app/api/kis/balance/route.ts` | 49줄 | ✅ |
| `src/app/api/kis/price/route.ts` | 25줄 | ✅ |
| `src/lib/config-validator.ts` | 38줄 | ✅ |
| `src/lib/engine/retry.ts` | 34줄 | ✅ |
| `tests/core.spec.ts` | 47줄 | ✅ |

**위반 없음.**

---

### ② 단일 책임 위반

| 파일 | 책임 | 판정 |
|------|------|------|
| `config-validator.ts` | 환경변수 검증 전담 | ✅ |
| `retry.ts` | 재시도/백오프 전담 | ✅ |
| `balance/route.ts` | 잔고 조회 프록시 전담 | ✅ |
| `price/route.ts` | 시세 조회 프록시 전담 | ✅ |
| `client.ts` | 클라이언트→API Route 어댑터 전담 | ✅ |
| `db.ts` | Supabase DB 헬퍼 전담 | ✅ |
| `engine/route.ts` | 오케스트레이터 (검증/재시도/정리는 외부 모듈에 위임) | ✅ |

**위반 없음.**

---

### ③ 서버 검증·보안

| 항목 | 구현 현황 | 판정 |
|------|---------|------|
| `appSecret` URL 노출 | GET→POST Body 전환 완료 | ✅ |
| `balance` 바디 필드 검증 | `appKey, appSecret, token, accountNo` 서버 검증 | ✅ |
| `price` 바디 필드 검증 | `code, appKey, appSecret, token` 서버 검증 | ✅ |
| 환경변수 에러 응답 | `missing: string[]` 에 키 이름만 포함 (값 미포함) | ✅ |
| engine 인증 | middleware CRON_ROUTES 처리 | ✅ |
| 엔진 락 | 서버사이드 app_config 전용 | ✅ |
| **price 500 에러 메시지** | `e.message` 그대로 응답 — 내부 정보 노출 가능 | ❌ |

**위반 1건: GAP-02 참조.**

---

### ④ 성능

| 항목 | 구현 현황 | 판정 |
|------|---------|------|
| 엔진 중복 실행 | `engine_lock` 5분 TTL 락 구현 | ✅ |
| `withRetry` 적용 범위 | KIS 토큰 발급에만 적용 | ✅ |
| `cleanupStalePendingOrders` | 엔진 실행마다 1회 DELETE | ✅ |
| `fetchBalance/fetchPrice` | GET→POST 전환, 추가 호출 없음 | ✅ |
| **`app_config` 이중 조회** | GET() + runEngine() 각각 SELECT 1회씩 | ⚠️ 경미 |
| **`getEngineSkipReason` 이중 호출** | GET() + runEngine() 각각 호출 | ⚠️ 경미 |

**위반 없음. 경미한 중복 2건 (GAP-03 참조).**

---

### ⑤ 폴더 구조

| 파일 | 위치 | 판정 |
|------|------|------|
| `config-validator.ts` | `src/lib/` | ✅ |
| `retry.ts` | `src/lib/engine/` | ✅ |
| `cleanupStalePendingOrders` | `src/lib/engine/db.ts` (기존 파일 확장) | ✅ |
| KIS 프록시 라우트 | `src/app/api/kis/` | ✅ |
| E2E 테스트 | `tests/` (프로젝트 루트) | ✅ |
| Playwright 설정 | `playwright.config.ts` (루트) | ✅ |

**위반 없음.**

---

## 4. 종합 의견 및 수정 우선순위

### 전체 평가

설계서 v7.1의 핵심 목표 세 가지가 모두 달성되었다:

1. **보안 강화 (P0)** — `appSecret` URL 노출 완전 제거. GET→POST 전환과 서버 바디 검증 완료.
2. **자가진단·복구 (P0/P1)** — 환경변수 조기 검증, 엔진 락(5분 TTL), 고립 주문 정리, withRetry 모두 설계 순서대로 동작.
3. **핵심 경로 E2E 테스트 (P2)** — TC-01/02/03 구현 완료, 설계 초과로 `global.setup.ts` 추가.

### 수정 우선순위

| 순위 | GAP | 파일 | 수정 내용 | 긴급도 |
|------|-----|------|---------|--------|
| **1** | GAP-02 | `src/app/api/kis/price/route.ts:22` | 500 응답에서 `e.message` → `"시세 조회 실패"` 고정, 에러는 `console.error`로 서버 로그 처리 | **보안** |
| 2 | GAP-03 | `src/app/api/engine/route.ts` | `cfgMap`을 GET()에서 생성 후 runEngine()에 인자로 전달 — 이중 조회·이중 체크 제거 | 성능 (낮음) |
| — | GAP-01 | `src/lib/engine/retry.ts` | 조치 불필요 (타입 동작 동일) | — |
| — | GAP-04 | `src/app/api/kis/price/route.ts` | 조치 불필요 (설계 범위 외) | — |

**즉시 조치 필요 항목: GAP-02 (1건) — 2줄 수정**

---

```
─────────────────────────────────────────────────
📋 플랫폼 개발 원칙 점검 (nexio v7.1 기준)
─────────────────────────────────────────────────
1. 페이지 500줄 제한   : ✅ 준수 (최대 399줄 — engine/route.ts)
2. 단일 책임           : ✅ 준수
3. 서버 검증·보안      : ❌ price/route.ts:22 — 500 에러에 e.message 노출
4. 성능 (중복·N+1)     : ⚠️ 경미 — app_config 이중 조회 / getEngineSkipReason 이중 호출
5. 폴더 구조           : ✅ 준수
─────────────────────────────────────────────────
위반 항목: 1건 (GAP-02) — 수정 후 재확인 권고
─────────────────────────────────────────────────
```
