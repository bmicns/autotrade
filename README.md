## NEXIO Autotrade

Next.js 기반 국내 주식 자동매매 대시보드 및 엔진 제어 앱입니다.

## Setup

1. 환경변수 파일 준비

```bash
cp .env.example .env.local
```

2. 필수 환경변수 입력

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `KIS_APP_KEY`
- `KIS_APP_SECRET`
- `KIS_ACCOUNT_NO`
- `CRON_SECRET`
- `ADMIN_SECRET`
- `ADMIN_ID`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

일부 부가 기능은 아래 값을 추가로 사용합니다.

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `DART_API_KEY`

## Commands

```bash
npm run dev
npm run lint
npm run build
npm run check:engine
```

`npm run check:engine`:
- `.env.local`을 읽음
- 빌드된 route handler를 직접 호출
- `engine`, `engine-log`, `pending-signals`, `positions`를 한 번에 출력
- 장중이면 실제 엔진 실행 결과, 장외면 skip 사유를 확인 가능

## Notes

- Supabase 환경변수가 없으면 관련 API 호출 시 명확한 에러를 반환하도록 되어 있습니다.
- KIS 환경변수가 없으면 엔진 및 시세 주문 관련 API는 정상 동작하지 않습니다.
- KIS 런타임 자격증명은 `kis_config` DB를 우선 사용하고, `KIS_*` env는 DB 복구용 폴백으로만 사용합니다.

## Environment Strategy

- 운영 무영향 구조 개편은 `dev / paper / prod` 3계층으로 분리해서 진행합니다.
- `dev`는 로컬 구조 개편 전용, `paper`는 모의투자 검증 전용, `prod`는 승인된 변경만 반영합니다.
- 자세한 기준은 [docs/operations/environment-separation.md](docs/operations/environment-separation.md) 문서를 따릅니다.
- `engine-v2`를 `paper`로 넘기기 전 체크는 [docs/operations/paper-promotion-checklist.md](docs/operations/paper-promotion-checklist.md) 문서를 따릅니다.
