# Paper Promotion Checklist

`engine-v2` 로컬 실험선을 `paper` 검증선으로 올리기 전에 확인할 기준 문서.

## 목적

- 로컬 구조 실험과 모의투자 검증을 구분한다.
- `paper` 승격 전에 필요한 최소 품질 기준을 고정한다.
- 운영선과 섞이지 않도록 승격 경계를 명확히 한다.

## 승격 전제

아래 전제가 모두 맞아야 한다.

- 작업 대상은 여전히 `src/lib/engine-v2/*`와 로컬 검증 화면이다.
- 운영 엔진 `src/lib/engine/*` import 체인은 건드리지 않았다.
- 운영 DB, 운영 계좌, 운영 알림 채널과 연결하지 않았다.
- 로컬 `engine-v2` 실험선에서 핵심 비교 흐름이 동작한다.

## 필수 확인

### 1. 코드 경계

- `engine-v2` 경로가 운영 route handler에 연결되지 않았다.
- 새 adapter, runner, scenario UI가 운영 엔진 import 체인에 포함되지 않았다.
- 실주문 함수가 `engine-v2`에 직접 연결되지 않았다.

### 2. 로컬 검증

- `npm run test:unit` 통과
- `npm run build` 통과
- `/engine-v2` 페이지에서 아래 흐름이 동작
  - asset class 선택
  - scenario 실행
  - profile 조정
  - preset 저장/적용
  - recent runs 비교
  - asset / candidate drilldown
  - JSON / CSV / Markdown export

### 3. 데이터 경계

- 국내 자산군은 read-only 조회만 사용한다.
- 해외 자산군은 mock 또는 명시적 테스트 소스만 사용한다.
- 운영용 `kis_config`, 운영 `positions`, 운영 `trade_memory`를 변경하지 않는다.

### 4. paper 환경 준비

- `NEXIO_ENV=paper`
- `KIS_RUNTIME_MODE=paper`
- paper 전용 `APP_BASE_URL`
- paper 전용 `CRON_SECRET`
- paper 전용 `SESSION_SECRET`
- paper 전용 DB 또는 최소한 운영과 분리된 스키마
- paper 전용 텔레그램 채널

### 5. 브로커 검증 목표

paper 승격 후 아래를 순서대로 확인한다.

1. 토큰 발급
2. 잔고 조회
3. 현재가 조회
4. 수동 매수/매도
5. 자동 청산
6. reconcile
7. preflight
8. rehearsal checklist
9. pnl audit

## 승격 보류 조건

아래 중 하나라도 있으면 `paper` 승격을 미룬다.

- `engine-v2`가 운영 엔진과 import 또는 설정을 공유한다.
- 로컬 검증에서 `preset`, `drilldown`, `export` 흐름이 불안정하다.
- 미국 자산군을 실제 데이터로 올릴 계획인데 provider 경계가 아직 없다.
- 모의투자용 DB/알림/시크릿 분리가 준비되지 않았다.

## 승격 출력물

`paper`로 넘기기 전에 아래 자료를 남긴다.

- 최근 `engine-v2` Markdown report 1건
- 대표 preset 1~2개
- 현재 로컬 검증 기준 스크린샷 또는 요약 메모
- 남은 mock 의존성 목록

## 현재 판단

현재 `NEXIO` 로컬 `engine-v2`는:

- 로컬 실험선으로는 충분히 usable
- 비교/드릴다운/리포트 export까지 완료
- 아직 `paper` 승격 전 마지막 작업은 문서 기준선 확정과 실제 paper 인프라 분리

즉 지금 단계는:

- `dev` 실험선: 사실상 마감 가능
- `paper` 승격: 준비 착수 가능
