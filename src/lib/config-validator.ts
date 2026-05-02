// 필수 환경변수 검증 유틸
// 엔진 진입부에서 호출되어 런타임 undefined 오류를 조기 감지한다.

const REQUIRED_ENV_GROUPS = {
  supabase: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  auth:     ["CRON_SECRET", "ADMIN_SECRET", "ADMIN_PASSWORD"],
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
} as const;

// KIS 환경변수는 DB 설정(kis_config)으로 대체 가능 → 별도 경고(warn) 그룹
const WARN_ENV_GROUPS = {
  kis: ["KIS_APP_KEY", "KIS_APP_SECRET", "KIS_ACCOUNT_NO"],
} as const;

export interface ConfigValidationResult {
  ok: boolean;       // required 그룹 전부 통과 시 true
  missing: string[]; // 누락된 환경변수 이름 목록 (값 절대 포함 금지)
  warnings: string[]; // warn 그룹 누락 (오류 아님, 로그만)
}

export function validateRequiredEnv(): ConfigValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const keys of Object.values(REQUIRED_ENV_GROUPS)) {
    for (const key of keys) {
      if (!process.env[key]) missing.push(key);
    }
  }

  for (const keys of Object.values(WARN_ENV_GROUPS)) {
    for (const key of keys) {
      if (!process.env[key]) warnings.push(key);
    }
  }

  return { ok: missing.length === 0, missing, warnings };
}
