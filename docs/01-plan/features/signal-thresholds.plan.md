# 신호 임계값 동적 설정 및 자동 최적화 Planning Document

> **Summary**: 하드코딩된 RSI 매수/매도 기준 및 신호 강도 점수 임계값을 app_config 테이블에서 관리하고, 과거 trade_memory 데이터를 역산해 최적값을 자동 추천하는 기능 추가
>
> **Project**: NEXIO (nexio.vercel.app)
> **Version**: v5.2.1
> **Author**: Product Manager Agent
> **Date**: 2026-04-20
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

현재 신호 판단 임계값 4종(RSI 매수 기준, RSI 매도 기준, 강한 신호 점수, 약한 신호 점수)이 `src/lib/kis/indicators.ts` 소스에 하드코딩되어 있다. 시장 환경이 바뀌거나 운용 전략을 수정하려면 코드를 직접 수정하고 재배포해야 한다. 이 기능은 임계값을 DB로 이관해 런타임에 변경할 수 있게 하고, 과거 매매 실적 데이터를 역산해 최적 임계값을 자동 추천함으로써 전략 조정 비용을 줄이고 수익률을 개선한다.

### 1.2 Background

- NEXIO 신호 시스템은 7종 기술 지표 가중치 점수제를 사용한다.
- `analyzeSignal()` 함수 내부에서 RSI 조건(`rsi <= 30` / `rsi >= 70`)과 신호 강도 분기(`score >= 70` → strong, `score >= 40` → weak)가 리터럴로 고정되어 있다.
- `trade_memory` 테이블에는 진입 시 `rsi_value`, `total_score`와 청산 결과 `is_win`, `closed_at`이 모두 저장된다. 이 데이터로 RSI·점수 구간별 승률을 계산하는 역산이 가능하다.
- `app_config` 테이블이 이미 존재하므로(`key TEXT PK`, `value JSONB`) 키 4개만 추가하면 된다. 추가 마이그레이션 비용이 작다.

### 1.3 Related Documents

- 신호 시스템 위키: `wiki/topics/signal-system.md`
- DB 스키마 위키: `wiki/topics/database.md`
- app_config 마이그레이션: `supabase/migrations/20260417000000_app_config.sql`
- 기존 전략 탭 UI: `src/components/strategy/strategy-tab.tsx`

---

## 2. Scope

### 2.1 In Scope

- [ ] `app_config` 테이블에 4개 키 초기값 INSERT 마이그레이션 작성
- [ ] 엔진(`indicators.ts`) 런타임 임계값 동적 로드 — app_config 조회 후 fallback으로 기존 하드코딩 값 유지
- [ ] 전략 탭 UI — "신호 기준" 섹션을 읽기 전용에서 편집 가능 항목으로 전환 (바텀시트 방식, 0~100 제한 없음)
- [ ] `app_config` 저장 API 엔드포인트 — `PATCH /api/app-config` 구현 (인증 필수)
- [ ] "자동 최적화" 버튼 및 `POST /api/optimize-thresholds` 엔드포인트 구현
- [ ] 최적화 알고리즘 — `trade_memory` 닫힌 매매(closed_at IS NOT NULL) 대상 그리드 서치로 win rate 최대화
- [ ] 추천값 확인 모달(바텀시트) — 현재값 vs. 추천값 비교 + 적용/취소

### 2.2 Out of Scope

- 지표 가중치 자체(RSI/MACD/볼린저 등 7종 가중치)의 편집 — 별도 adaptive-engine 기능으로 관리됨
- 실시간 A/B 테스트 실행 프레임워크 — 향후 과제
- 최적화 히스토리 저장 및 롤백 기능 — 향후 고려
- 자동 스케줄 최적화(주기적 백그라운드 실행) — 이번 범위 아님

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | `app_config`에 `rsi_buy`(기본 30), `rsi_sell`(기본 70), `strong_score`(기본 70), `weak_score`(기본 40) 키를 초기 INSERT하는 SQL 마이그레이션 작성 | Must | Pending |
| FR-02 | 엔진 실행 시 app_config에서 4개 임계값을 조회해 신호 판단에 적용. DB 조회 실패 시 하드코딩 기본값으로 fallback | Must | Pending |
| FR-03 | 전략 탭 "신호 기준" 섹션의 4개 항목을 탭 클릭 시 바텀시트 편집 모달로 수정할 수 있어야 함. 입력 범위는 정수 0~100 | Must | Pending |
| FR-04 | `PATCH /api/app-config` 엔드포인트 구현. 요청 바디 `{ key, value }` 형식. 인증된 사용자만 호출 가능 | Must | Pending |
| FR-05 | 전략 탭에 "자동 최적화" 버튼 추가. 버튼 클릭 시 `POST /api/optimize-thresholds` 호출 후 로딩 상태 표시 | Must | Pending |
| FR-06 | `POST /api/optimize-thresholds` — `trade_memory`의 닫힌 매매(closed_at IS NOT NULL) 최소 30건 이상 있을 때만 실행. 미달 시 "데이터 부족" 메시지 반환 | Must | Pending |
| FR-07 | 최적화 알고리즘: RSI 매수 기준 탐색 범위 20~40 (스텝 5), RSI 매도 기준 60~80 (스텝 5), 강한 신호 60~80 (스텝 5), 약한 신호 30~50 (스텝 5) — 그리드 서치로 win rate 최대화, 단 weak_score < strong_score 제약 유지 | Must | Pending |
| FR-08 | 최적화 결과를 바텀시트로 표시. 현재값 vs. 추천값 4개 항목 나란히 표시. "적용" 버튼 클릭 시 PATCH /api/app-config 일괄 저장 | Must | Pending |
| FR-09 | 최적화 샘플 수, 탐색 조합 수, 최고 win rate를 결과 바텀시트에 함께 표시 | Should | Pending |
| FR-10 | 최적화 도중 다른 탭으로 이동해도 실행이 취소되지 않아야 함 (API 레이어에서 처리 완결) | Should | Pending |
| FR-11 | 임계값 수정 이력을 `app_config`의 `updated_at` 컬럼으로 UI에 "마지막 수정" 표시 | Could | Pending |
| FR-12 | 최적화 실행 가능 여부(데이터 건수 30건 이상)를 버튼 렌더링 시점에 미리 판단해 비활성화 + 안내 문구 표시 | Could | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능 | `/api/optimize-thresholds` 응답 시간 10초 이내 (trade_memory 300건 기준) | 서버 응답 시간 측정 |
| 보안 | `PATCH /api/app-config`, `POST /api/optimize-thresholds` 모두 인증 미적용 시 401 반환 | 비인증 요청 테스트 |
| 안정성 | 엔진이 app_config 조회 실패 시 기존 하드코딩값으로 fallback, 매매 중단 없음 | DB 일시 장애 시나리오 검증 |
| 서버 검증 | PATCH 요청의 value 범위(0~100 정수) 서버에서 검증. 클라이언트 검증만으로 끝내지 않음 | 범위 초과 요청 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 4개 임계값이 app_config에 저장되고 엔진이 이를 읽어 신호 판단에 적용됨
- [ ] 전략 탭에서 바텀시트로 각 임계값을 수정하고 저장 후 즉시 반영됨
- [ ] "자동 최적화" 버튼 클릭 시 로딩 → 결과 바텀시트 → 적용까지 전체 흐름 완결
- [ ] 인증 없이 PATCH/POST 호출 시 401 반환 확인
- [ ] 엔진 실행 시 DB 조회 실패해도 기존 하드코딩값으로 정상 동작 확인

### 4.2 Quality Criteria

- [ ] `strategy-tab.tsx` 파일 500줄 미만 유지 (신규 섹션 추가 후 확인)
- [ ] 최적화 API는 서버 전용 파일(`app/api/optimize-thresholds/route.ts`)에 비즈니스 로직 격리
- [ ] Zero lint errors

---

## 5. Risks and Mitigation

| 위험 | 영향 | 가능성 | 대응책 |
|------|------|--------|--------|
| trade_memory 데이터 부족 (30건 미만) | 최적화 실행 불가 | 중간 — 초기 운용 단계에서 발생 가능 | 최소 건수 미달 시 명확한 안내 메시지 + 버튼 비활성화(FR-06, FR-12) |
| 그리드 서치 조합 폭발로 타임아웃 | API 10초 초과 응답 | 낮음 — 스텝 5 기준 4개 파라미터 조합 최대 5×5×5×5=625개 | 탐색 범위와 스텝 상수화, Vercel 함수 타임아웃(60s) 내 충분히 처리 가능. 필요 시 Worker 분리 고려 |
| app_config 조회 지연으로 엔진 성능 저하 | 매매 사이클 지연 | 낮음 — GitHub Actions 실행 시마다 1회 조회 | 엔진 초기화 단계에서 1회 조회 후 메모리 캐싱, 재조회 없음 |
| weak_score >= strong_score 역전 저장 | 신호 분기 오작동 | 낮음 — 사용자 실수 또는 최적화 결과 | 저장 API에서 서버 검증으로 차단 + 최적화 알고리즘 제약 조건 명시(FR-07) |
| strategy-tab.tsx 줄 수 초과 | 파일 분리 필요 | 중간 — 현재 405줄, 신규 섹션 추가 시 500줄 근접 | 구현 시작 전 파일 분리 계획 확정 필수. `SignalThresholdSection`, `OptimizeSheet` 컴포넌트 분리 방향 사전 합의 필요 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 해당 | 선택 |
|-------|------|------|:----:|
| **Starter** | 단순 구조 | — | ☐ |
| **Dynamic** | 피처 모듈, BaaS 연동 | NEXIO 현행 구조 | ☑ |
| **Enterprise** | 엄격한 레이어 분리 | — | ☐ |

### 6.2 Key Architectural Decisions

| 결정 | 선택 | 근거 |
|------|------|------|
| 임계값 저장소 | `app_config` 테이블 (기존) | 이미 존재하는 KV 테이블 재활용, 추가 테이블 생성 불필요 |
| 엔진 로드 방식 | GitHub Actions 실행 시 1회 조회 + 메모리 내 상수 대체 | 런타임 중 반복 DB 조회 방지 (성능 원칙) |
| 최적화 알고리즘 | 그리드 서치 (완전 탐색) | 파라미터 공간 작음(최대 625 조합), 구현 단순, 결과 해석 용이 |
| 최적화 API 위치 | `app/api/optimize-thresholds/route.ts` | Next.js API 라우트, 서버 전용 실행, 클라이언트에 비즈니스 로직 노출 없음 |
| UI 편집 패턴 | 기존 `EditSheet` 바텀시트 패턴 재사용 | `strategy-tab.tsx`의 기존 UX 패턴과 일관성 유지 |

### 6.3 파일 분리 계획 (strategy-tab.tsx 500줄 초과 방지)

현재 `strategy-tab.tsx` 405줄. 신호 기준 섹션 편집 + 최적화 바텀시트 추가 시 약 80~120줄 증가 예상 → 구현 전 아래 분리 방향 대장 확인 필요.

```
strategy-tab.tsx (현행 405줄)
  ├─ SignalThresholdSection   →  새 파일 분리 고려
  │     (신호 기준 4개 항목 + 편집 바텀시트 로직)
  └─ OptimizeSheet            →  새 파일 분리 고려
        (자동 최적화 결과 바텀시트)
```

구현 시작 전 분리 여부를 대장과 확인한다.

---

## 7. Convention Prerequisites

### 7.1 기존 컨벤션 확인

- [x] `CLAUDE.md` 코딩 컨벤션 존재 (플랫폼 개발 5대 원칙 준수)
- [x] TypeScript (`tsconfig.json`) 설정 존재
- [x] ESLint 설정 존재
- [x] Supabase 클라이언트 싱글턴 패턴 (`src/lib/supabase/api-client.ts`) 준수

### 7.2 환경 변수 (추가 불필요)

이 기능은 기존 Supabase 환경 변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)만 사용한다. 신규 환경 변수는 없다.

### 7.3 API 보안 체크리스트

| 엔드포인트 | 메서드 | 인증 | 비고 |
|-----------|--------|------|------|
| `/api/app-config` | PATCH | 필수 | value 범위 서버 검증 포함 |
| `/api/optimize-thresholds` | POST | 필수 | 데이터 최소 건수 서버 검증 포함 |

---

## 8. API Specification

### PATCH /api/app-config

```typescript
// Request
{ key: "rsi_buy" | "rsi_sell" | "strong_score" | "weak_score", value: number }

// Response 200
{ key: string, value: number, updated_at: string }

// Response 400
{ error: "value must be integer between 0 and 100" }
{ error: "weak_score must be less than strong_score" }

// Response 401
{ error: "Unauthorized" }
```

### POST /api/optimize-thresholds

```typescript
// Request  (body 없음)

// Response 200
{
  recommended: {
    rsi_buy: number,
    rsi_sell: number,
    strong_score: number,
    weak_score: number
  },
  winRate: number,          // 추천값 기준 예상 win rate (0.0~1.0)
  sampleSize: number,       // 분석에 사용된 trade_memory 건수
  searchCount: number       // 탐색 조합 수
}

// Response 422
{ error: "Insufficient data: need at least 30 closed trades", count: number }

// Response 401
{ error: "Unauthorized" }
```

---

## 9. Success Metrics

| 지표 | 기준 |
|------|------|
| 임계값 변경 후 엔진 다음 실행 시 반영 | 100% |
| 자동 최적화 API 응답 시간 | 10초 이내 (trade_memory 300건 기준) |
| strategy-tab.tsx 줄 수 | 500줄 미만 유지 |
| 인증 없는 PATCH/POST 차단 | 401 반환 100% |

---

## 10. Next Steps

1. [ ] 대장 Plan 검토 및 승인
2. [ ] `strategy-tab.tsx` 파일 분리 여부 대장과 확인 (500줄 초과 리스크)
3. [ ] Design 문서 작성 (`signal-thresholds.design.md`)
4. [ ] 구현 시작 — Supabase 마이그레이션 → 엔진 수정 → API → UI 순서

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-20 | Initial draft | Product Manager Agent |
