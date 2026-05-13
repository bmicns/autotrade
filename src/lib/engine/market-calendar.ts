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

const LEGACY_MARKET_WINDOWS = {
  morningStart: "09:30",
  morningEnd: "11:30",
  afternoonStart: "13:00",
  afternoonEnd: "14:50",
} as const;

const KRX_CONTINUOUS_MARKET_WINDOWS = {
  morningStart: "09:00",
  morningEnd: "15:20",
  afternoonStart: "15:21",
  afternoonEnd: "15:21",
} as const;

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

export function resolveEffectiveMarketWindows(cfgMap: Map<string, unknown>) {
  const morningStart = String(cfgMap.get("morning_start") ?? LEGACY_MARKET_WINDOWS.morningStart);
  const morningEnd = String(cfgMap.get("morning_end") ?? LEGACY_MARKET_WINDOWS.morningEnd);
  const afternoonStart = String(cfgMap.get("afternoon_start") ?? LEGACY_MARKET_WINDOWS.afternoonStart);
  const afternoonEnd = String(cfgMap.get("afternoon_end") ?? LEGACY_MARKET_WINDOWS.afternoonEnd);

  const isLegacySplitWindow =
    morningStart === LEGACY_MARKET_WINDOWS.morningStart &&
    morningEnd === LEGACY_MARKET_WINDOWS.morningEnd &&
    afternoonStart === LEGACY_MARKET_WINDOWS.afternoonStart &&
    afternoonEnd === LEGACY_MARKET_WINDOWS.afternoonEnd;

  if (isLegacySplitWindow) {
    return KRX_CONTINUOUS_MARKET_WINDOWS;
  }

  return { morningStart, morningEnd, afternoonStart, afternoonEnd };
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
  const windows = resolveEffectiveMarketWindows(cfgMap);
  const mStart = parseHHMM(windows.morningStart, KRX_CONTINUOUS_MARKET_WINDOWS.morningStart);
  const mEnd = parseHHMM(windows.morningEnd, KRX_CONTINUOUS_MARKET_WINDOWS.morningEnd);
  const aStart = parseHHMM(windows.afternoonStart, KRX_CONTINUOUS_MARKET_WINDOWS.afternoonStart);
  const aEnd = parseHHMM(windows.afternoonEnd, KRX_CONTINUOUS_MARKET_WINDOWS.afternoonEnd);

  const inMorning = parts.hhmm >= mStart && parts.hhmm <= mEnd;
  const inAfternoon = parts.hhmm >= aStart && parts.hhmm <= aEnd;

  if (!inMorning && !inAfternoon) {
    return `장 외 시간 (${parts.timeLabel})`;
  }

  return null;
}
