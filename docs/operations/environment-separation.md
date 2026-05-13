# Environment Separation

`NEXIO`를 `dev / paper / prod` 3계층으로 분리해 운영하는 기준 문서.

## 목적

- 구조 개편과 전략 실험이 운영 주문 경로에 섞이지 않게 한다.
- 테스트와 실운영의 DB, 브로커, 알림, 크론을 분리한다.
- 배포 승인 전까지는 운영 앱과 운영 데이터에 영향이 없도록 한다.

## 원칙

- `dev`는 로컬 전용이다.
- `paper`는 실제 브로커 모의투자 검증용이다.
- `prod`는 승인된 변경만 반영한다.
- `dev`와 `paper`에서 검증되지 않은 변경은 `prod`에 올리지 않는다.
- 운영 계좌, 운영 DB, 운영 알림 채널은 테스트 환경과 공유하지 않는다.

## 계층 정의

### 1. `dev`

구조 개편과 자산군 분기 설계를 위한 로컬 작업선.

- 배포 금지
- 운영 DB 연결 금지
- 운영 KIS 계정 연결 금지
- 로컬 mock 데이터 또는 테스트 전용 DB 사용
- 새 경로는 `engine-v2`, `adapters/*`, `simulators/*`처럼 기존 운영 코드와 분리

권장 작업:

- `국내주식 / 해외주식 / 국내ETF / 해외ETF` 공통 인터페이스 정의
- 포지션 모델, 주문 모델, 심볼 모델 정규화
- 리스크 정책 분리
- 테스트 더블과 fixture 기반 단위 테스트

### 2. `paper`

운영과 최대한 비슷한 구조로 모의투자를 돌리는 검증선.

- 별도 배포 URL 사용
- 모의투자 계정 사용
- 운영 DB와 분리된 스테이징 DB 사용
- 운영 텔레그램과 분리된 테스트 알림 채널 사용
- 스테이징 전용 크론만 허용

검증 목표:

- 토큰 발급
- 잔고 조회
- 현재가 조회
- 수동 매수/매도
- 자동 청산
- 브로커-DB reconcile
- preflight / rehearsal / pnl audit

### 3. `prod`

실제 운영선.

- 승인된 변경만 반영
- 실계좌 또는 현재 운영 계정만 연결
- 운영 DB만 사용
- 운영 알림 채널만 사용
- 배포 전 체크리스트와 롤백 절차 필요

## 분리 대상

환경을 나눌 때는 아래 항목을 각각 분리한다.

- 배포 URL
- 환경변수 세트
- Supabase 프로젝트 또는 최소한 스키마/DB
- KIS 계정과 토큰
- 텔레그램 채널
- 크론 시크릿
- 관리자 계정과 세션 시크릿
- 로그/리포트 저장 위치

## 최소 환경 변수 규칙

권장 공통 키:

- `NEXIO_ENV=dev|paper|prod`
- `KIS_RUNTIME_MODE=paper|live`
- `APP_BASE_URL`
- `CRON_SECRET`
- `SESSION_SECRET`

권장 분리 규칙:

- `dev`: 로컬 파일 기반 `.env.local`
- `paper`: 스테이징 배포 환경변수
- `prod`: 운영 배포 환경변수

## 운영 보호 규칙

`dev` 또는 `paper`에서 아래 작업은 금지한다.

- 운영 DB 마이그레이션 실행
- 운영 `kis_config` 덮어쓰기
- 운영 알림 채널 사용
- 운영 크론 시크릿 사용
- 운영 URL로 테스트 주문 실행

## 권장 저장소 구조

```text
src/
  app/
    api/
      engine/
      preflight/
  lib/
    engine/          # 현재 운영선
    engine-v2/       # 구조 개편용 로컬/스테이징 선
    market/
      adapters/
        kr-stock.ts
        us-stock.ts
        kr-etf.ts
        us-etf.ts
      contracts.ts
      types.ts
tests/
  unit/
  integration/
  paper/
docs/
  operations/
```

## 배포 승격 규칙

변경은 아래 순서로만 승격한다.

1. `dev`에서 구조와 테스트 통과
2. `paper`에서 모의주문, 리컨실, 알림, 감사 로그 확인
3. `preflight`와 체크리스트 통과
4. 승인 후 `prod` 반영

## 현재 프로젝트 적용안

지금 `NEXIO`에는 아래 방식이 가장 안전하다.

- 현재 운영 경로 `src/lib/engine/*`는 유지
- 새 자산군 분기 구조는 `src/lib/engine-v2/*` 아래에서만 시작
- `paper` 검증 전까지는 `vercel` 운영 배포에 반영하지 않음
- 운영 테이블 재설계는 보류하고, 먼저 읽기 모델과 adapter 계층부터 분리

## 체크리스트

- `dev`에서만 구조 개편 작업 중인가
- 새 코드가 운영 엔진 import 체인에 들어가지 않았는가
- 운영 DB/운영 계좌/운영 알림을 건드리지 않는가
- `paper`에서 주문 경로 리허설을 끝냈는가
- `prod` 배포 전 문서와 롤백 절차가 준비됐는가

추가 승격 기준은 [paper-promotion-checklist.md](paper-promotion-checklist.md) 문서를 따른다.
