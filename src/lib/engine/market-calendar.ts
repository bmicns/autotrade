export interface KstNowParts {
  date: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  hhmm: number;
  timeLabel: string;
}

export function getKstNowParts(now = new Date()): KstNowParts {
  const kstNow = new Date(now.getTime() + 9 * 3600000);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;
  const day = kstNow.getUTCDate();
  const weekday = kstNow.getUTCDay();
  const hour = kstNow.getUTCHours();
  const minute = kstNow.getUTCMinutes();

  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    hhmm: hour * 100 + minute,
    timeLabel: `KST ${hour}:${String(minute).padStart(2, "0")}`,
  };
}

export function parseHHMM(value: unknown, fallback: string): number {
  const str = value ? String(value) : fallback;
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 100 + (m || 0);
}

export function parseMarketHolidays(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }

  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to CSV/newline parsing.
  }

  return trimmed
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

function getYearEndTradingCloseDate(year: number): string {
  for (let day = 31; day >= 28; day -= 1) {
    const utc = new Date(Date.UTC(year, 11, day));
    const weekday = utc.getUTCDay();
    if (!isWeekend(weekday)) {
      return `${year}-12-${String(day).padStart(2, "0")}`;
    }
  }
  return `${year}-12-31`;
}

export function getMarketClosureReason(cfgMap: Map<string, unknown>, now = new Date()): string | null {
  const parts = getKstNowParts(now);

  if (isWeekend(parts.weekday)) {
    return `주말 스킵 (${parts.timeLabel})`;
  }

  if (parts.month === 5 && parts.day === 1) {
    return `휴장일 스킵 - 근로자의 날 (${parts.date})`;
  }

  if (parts.date === getYearEndTradingCloseDate(parts.year)) {
    return `휴장일 스킵 - 연말 휴장 (${parts.date})`;
  }

  const configured = new Set(parseMarketHolidays(cfgMap.get("market_holidays")));
  if (configured.has(parts.date)) {
    return `휴장일 스킵 - 설정 휴장일 (${parts.date})`;
  }

  return null;
}

export function getEngineSkipReason(cfgMap: Map<string, unknown>, now = new Date()): string | null {
  const engineEnabled = cfgMap.get("engine_enabled");
  if (engineEnabled === false || engineEnabled === "false") {
    return "비상 정지 활성";
  }

  const closureReason = getMarketClosureReason(cfgMap, now);
  if (closureReason) return closureReason;

  const parts = getKstNowParts(now);
  const mStart = parseHHMM(cfgMap.get("morning_start"), "09:30");
  const mEnd = parseHHMM(cfgMap.get("morning_end"), "15:20");
  if (parts.hhmm < mStart || parts.hhmm > mEnd) {
    return `장 외 시간 (${parts.timeLabel})`;
  }

  return null;
}
