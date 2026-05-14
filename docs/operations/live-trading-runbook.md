# Live Trading Runbook

실거래 또는 소액 리허설 단계에서 `NEXIO`를 매일 운영할 때 보는 기준 문서.

## 목적

- 실거래 트랙레코드를 일관되게 누적한다.
- 코드 완성도와 별개로 운영 실수를 줄인다.
- 실전 승격 전후의 일일 루틴을 고정한다.

## 일일 시작 전

1. `/api/preflight` 확인
2. `engine_state`에서 `engineEnabled`, `engineLocked`, `healthStatus`, `brokerMismatchCount` 확인
3. `pending_orders`, `pending_signals` stale 여부 확인
4. `KIS` 토큰/계좌 상태 확인
5. 오늘 리허설 목표 정리

## 장중 확인

- 첫 엔진 실행 시각
- 자동 진입 발생 여부
- 수동 개입 발생 여부
- 주문 실패 / 부분체결 / timeout / stale cleanup 여부
- 텔레그램 알림 수신 여부

## 장 마감 후

1. `engine-log` 최근 실행 확인
2. `trade_memory` 닫힌 거래 수와 손익 확인
3. `rehearsal_checklist` 갱신
4. `pnl_audit` 불일치 여부 확인
5. 브로커-DB 정합성 재확인

## 실거래 트랙레코드 기준

- 최소 5거래:
  주문, 체결, 포지션 반영, 청산 기록이 모두 안정적으로 이어지는지 확인
- 최소 10거래:
  수동/자동 진입과 청산이 섞인 상태에서도 정합성이 유지되는지 확인
- 최소 20거래:
  재진입, 부분청산, timeout, stale cleanup 같은 예외 흐름까지 운영 로그에 남는지 확인

## 판단 기준

- `trade_memory`와 `positions` 손익 대사 불일치가 반복되면 실전 확대 금지
- stale lock, stale pending order가 반복되면 cron/배포/실행 타이밍부터 재점검
- 주문 실패가 누적되면 전략 조정보다 계좌/한도/토큰 상태를 먼저 점검

## 참고 API

- `/api/preflight`
- `/api/engine-state`
- `/api/engine-log`
- `/api/pnl-audit`
- `/api/rehearsal-checklist`
- `/api/live-track-record`
