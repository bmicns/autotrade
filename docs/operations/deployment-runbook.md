# Deployment Runbook

실거래 영향이 있는 `NEXIO` 배포와 롤백 절차.

## 배포 원칙

- 장중 배포 금지
- `prod` 반영 전 `dev` 또는 `paper`에서 동일 변경 확인
- `fail` preflight 항목이 있으면 배포 보류
- 배포 전 현재 실행 상태와 최근 주문 상태를 먼저 확인

## 배포 전 체크

1. `npm run build`
2. `./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters`
3. `npm run test:unit`
4. `npm run lint`
5. `npm run check:engine`
6. `/api/preflight` 확인
7. `engine_state`, `engine_log`, `positions/reconcile` 상태 확인

## 배포 순서

1. `engine_enabled` 상태 확인
2. 필요 시 장중 아닌 시간에 `engine_enabled=false` 또는 운영 일시정지 판단
3. 환경변수 diff 확인
4. 배포 실행
5. 배포 직후 `/api/preflight` 재확인
6. `/api/engine-state`, `/api/engine-log`, `/api/kis/health` 확인
7. 첫 엔진 실행 1회 모니터링

## 롤백 조건

- 로그인 또는 관리자 API 접근 실패
- `preflight.readiness.autoTradingReady=false`
- `brokerMismatchCount > 0`가 신규 발생
- 주문 실패/토큰 오류/P1 알림이 배포 직후 반복
- 엔진 락 해제 실패 또는 stale lock 증가

## 롤백 순서

1. 신규 주문 위험이 있으면 엔진 정지
2. 직전 정상 배포 버전으로 즉시 롤백
3. `/api/preflight` 재확인
4. `/api/engine-state`와 실계좌 상태 대조
5. 필요 시 `/api/positions/reconcile` 실행
6. 원인 문서화 후 재배포 전 테스트 보강

## 배포 후 기록

- 배포 시각
- 반영 브랜치/커밋
- 환경변수 변경 여부
- 첫 엔진 실행 결과
- 이상 여부와 후속 조치
