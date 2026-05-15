@AGENTS.md

## Development Rules

세션 시작 시 `DEVELOPMENT_RULES.md`를 먼저 읽고, 이후 `NEXT_SESSION.md`와 작업 관련 위키/문서를 확인합니다.
개발, 검증, 배포는 `DEVELOPMENT_RULES.md`의 절대규칙을 우선합니다.

## Knowledge Base (Wiki)

컴파일된 지식 위키가 `wiki/` 폴더에 있습니다.

**세션 시작 시:** `wiki/CONTEXT.md` 먼저 읽고, 현재 작업 관련 토픽 아티클 확인.

**토픽 목록:** platform-overview, trading-engine, signal-system, adaptive-engine, order-management, database, deployment

**coverage 태그 활용:**
- `[coverage: high]` — 위키 신뢰, 원본 파일 불필요
- `[coverage: medium]` — 개요 파악 후 필요 시 원본 확인
- `[coverage: low]` — Sources 링크의 원본 파일 직접 읽기

**wiki 파일 직접 수정 금지** — `/wiki-compile` 로만 갱신.
