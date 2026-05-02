// 지수 백오프 재시도 래퍼
// KIS 토큰 발급처럼 네트워크 일시 장애에 취약한 단일 API 호출에만 선택적 적용.
// 모든 API에 적용 시 엔진 실행 시간 초과 위험이 있으므로 남용 금지.

interface RetryOptions {
  maxAttempts: number; // default: 3
  baseDelayMs: number; // default: 1000 (ms)
  maxDelayMs: number;  // default: 10000 (ms)
}

// 백오프 계산: min(baseDelayMs × 2^(attempt-1), maxDelayMs)
// attempt 1 → 즉시 실행, attempt 2 → 1초 후, attempt 3 → 2초 후
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs  = options?.maxDelayMs  ?? 10000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
