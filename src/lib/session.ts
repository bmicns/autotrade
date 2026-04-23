import { createHmac, timingSafeEqual } from "crypto";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export function generateSessionToken(secret: string): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", secret).update(ts).digest("hex");
  return `${ts}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!ts || !sig) return false;

  const expected = createHmac("sha256", secret).update(ts).digest("hex");
  // 길이 차이 노출 방지: 길이가 다르면 timingSafeEqual이 throw하므로 먼저 체크
  if (expected.length !== sig.length) return false;
  try {
    if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) return false;
  } catch {
    return false;
  }

  const age = Date.now() - Number(ts);
  return age >= 0 && age <= SESSION_MAX_AGE_MS;
}
