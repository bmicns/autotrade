# Engine Runbook

## 목적

장중에 `NEXIO` 엔진이 실제로 동작하는지 빠르게 확인하는 운영 절차.

## 기준 시간

- 엔진 세션: `09:30 ~ 15:20 KST`
- 주말에는 `/api/engine`이 `주말 스킵`을 반환해야 한다.
- 휴장일에는 `/api/engine`이 `휴장일 스킵`을 반환해야 한다.
- 평일 장외에는 `/api/engine`이 `장 외 시간`으로 `skipped`를 반환해야 한다.

## 사전 조건

- `npm run build`가 통과한 상태
- `.env.local` 또는 배포 환경에 `Supabase`, `KIS`, `CRON_SECRET` 설정 완료
- `kis_config` 테이블에 유효한 KIS 자격증명 저장

## 로컬 점검

```bash
npm run check:engine
```

확인 포인트:

- `engine`:
  장중이면 `skipped`가 아니어야 한다.
- `engine-log`:
  최신 실행이 추가되어야 한다.
- `pending-signals`:
  약한 신호가 있으면 `pending` 항목이 보여야 한다.
- `positions`:
  보유 포지션이 있으면 `open` 상태 레코드가 보여야 한다.
- `stats`:
  `strategyBreakdown`에 전략별 `trades`, `winRate`, `totalPnl`이 보여야 한다.
- `engine-control`:
  `strategy_allocations` 값이 의도한 배분 비율로 내려와야 한다.

## 장중 기대 결과

- `engine` 응답 `200`
- `engine-log.runs[0]`에 최신 실행 기록 존재
- `runs[0].scanned_count > 0`
- `runs[0].actions`에 `market_context`, `signal_skip`, `approved_buy`, `surge_buy`, `stop_loss`, `take_profit` 중 일부가 기록될 수 있음

## 이상 징후

- `토큰 발급 실패`:
  `kis_config` 또는 `KIS_*` env 불일치 가능성 확인
- `fetch failed`:
  네트워크 제한 또는 외부 API 장애 가능성 확인
- `휴장일 오판정`:
  `app_config.market_holidays`에 `YYYY-MM-DD` 배열 또는 CSV 문자열로 공휴일/임시 휴장일이 반영되어 있는지 확인
- `scanned_count = 0` 반복:
  장외 실행, watchlist 비어있음, 또는 상위 단계 조기 종료 가능성 확인
- `pending-signals`만 쌓이고 체결 없음:
  주문 경로 또는 KIS 계좌/토큰 상태 확인

## 운영 순서

1. `npm run check:engine`
2. `engine-log` 최신 실행 확인
3. 필요 시 `observer` 실행 결과와 `market_snapshots` 적재 상태 확인
4. 체결/청산 발생 시 `positions`, `pending_signals`, `engine_runs.actions`를 함께 확인
5. 전략별 배분 변경 시 `/api/engine-control`과 `/api/stats`의 `strategyBreakdown`을 같이 본다
