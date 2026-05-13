// 필수 환경변수 검증 유틸
// 엔진/관리자 인증/알림 등 운영 축별 누락을 조기 감지한다.

const REQUIRED_ENV_GROUPS = {
  supabase: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  cron: ["CRON_SECRET"],
  adminAuth: ["ADMIN_ID", "ADMIN_PASSWORD", "ADMIN_SECRET", "SESSION_SECRET"],
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

type RequiredEnvGroup = keyof typeof REQUIRED_ENV_GROUPS;

function collectMissing(groups: readonly RequiredEnvGroup[]): string[] {
  const missing: string[] = [];

  for (const group of groups) {
    const keys = REQUIRED_ENV_GROUPS[group];
    for (const key of keys) {
      if (!process.env[key]) missing.push(key);
    }
  }
  return missing;
}

function collectWarnings(): string[] {
  const warnings: string[] = [];

  for (const keys of Object.values(WARN_ENV_GROUPS)) {
    for (const key of keys) {
      if (!process.env[key]) warnings.push(key);
    }
  }

  return warnings;
}

export function validateRequiredEnv(): ConfigValidationResult {
  const missing = collectMissing(["supabase", "cron", "telegram"]);
  const warnings = collectWarnings();

  return { ok: missing.length === 0, missing, warnings };
}

export function validateAdminAuthEnv(): ConfigValidationResult {
  const missing = collectMissing(["adminAuth"]);
  return { ok: missing.length === 0, missing, warnings: [] };
}
