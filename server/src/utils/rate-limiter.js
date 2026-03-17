/**
 * rate-limiter.js
 * KIS API 호출 속도 제한 (초당 2회, 최소 500ms 간격)
 */

let lastCall = 0;
const MIN_INTERVAL = 500; // ms

export async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < MIN_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastCall = Date.now();
}

/**
 * 재시도 래퍼 (지수 백오프)
 */
export async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await rateLimit();
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = Math.pow(2, i) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
