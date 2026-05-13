export function shouldSendAlert(params: {
  lastSentAt?: string | null;
  now?: Date;
  cooldownMinutes: number;
}): boolean {
  const { lastSentAt, cooldownMinutes } = params;
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt).getTime();
  if (!Number.isFinite(last)) return true;
  const now = (params.now ?? new Date()).getTime();
  return now - last >= cooldownMinutes * 60 * 1000;
}
