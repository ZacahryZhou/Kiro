export const APP_TZ = process.env.APP_TZ || "America/Vancouver";

export type LocalDateTime = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in the given time zone. */
export function utcToLocalParts(date: Date, timeZone = APP_TZ): LocalDateTime & { second: number } {
  const v = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
  return { year: v.year, month: v.month, day: v.day, hour: v.hour, minute: v.minute, second: v.second };
}

/**
 * Converts a wall-clock time in `timeZone` to the matching UTC instant.
 * The offset is re-evaluated so DST changes are handled (code computes dates, never the model).
 */
export function zonedTimeToUtc(
  { year, month, day, hour = 0, minute = 0 }: Partial<LocalDateTime> & Pick<LocalDateTime, "year" | "month" | "day">,
  timeZone = APP_TZ,
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = utcToLocalParts(new Date(utc), timeZone);
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    utc = wallClock - (localAsUtc - utc);
  }
  return new Date(utc);
}

// ---------- calendar helpers used by tools (the model never does date or time-zone math) ----------

export type DateOnly = { year: number; month: number; day: number };
export type RangeWhen = "today" | "tomorrow" | "this_week" | "next_week";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const two = (n: number) => String(n).padStart(2, "0");

export function formatDateOnly({ year, month, day }: DateOnly): string {
  return `${year}-${two(month)}-${two(day)}`;
}

/** Parses "YYYY-MM-DD"; returns null for malformed or non-existent dates such as 2026-02-30. */
export function parseDateOnly(text: string): DateOnly | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  const valid =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  return valid ? { year, month, day } : null;
}

/** Parses "HH:mm" (24-hour); returns null when invalid. */
export function parseTimeOnly(text: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** The date of `weekday` in the Monday-to-Sunday week that contains `anchor` (all local, in code). */
export function dateInSameWeek(anchor: DateOnly, weekday: WeekdayCode): DateOnly {
  const anchorIndex = (new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day)).getUTCDay() + 6) % 7;
  return addDaysTo(anchor, WEEKDAY_CODES.indexOf(weekday) - anchorIndex);
}

export function addDaysTo(date: DateOnly, days: number): DateOnly {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function todayLocal(now = new Date(), timeZone = APP_TZ): DateOnly {
  const { year, month, day } = utcToLocalParts(now, timeZone);
  return { year, month, day };
}

/** UTC range [from, to) covering the local days startDate..endDate inclusive. */
export function localDayRange(
  startDate: DateOnly,
  endDate: DateOnly,
  timeZone = APP_TZ,
): { from: Date; to: Date } {
  return {
    from: zonedTimeToUtc(startDate, timeZone),
    to: zonedTimeToUtc(addDaysTo(endDate, 1), timeZone),
  };
}

/** Resolves a named range to a UTC range. Weeks run Monday to Sunday, like the schedule page. */
export function resolveWhen(
  when: RangeWhen,
  now = new Date(),
  timeZone = APP_TZ,
): { from: Date; to: Date } {
  const today = todayLocal(now, timeZone);
  if (when === "today") return localDayRange(today, today, timeZone);
  if (when === "tomorrow") {
    const tomorrow = addDaysTo(today, 1);
    return localDayRange(tomorrow, tomorrow, timeZone);
  }
  const dayOfWeek = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() || 7;
  const monday = addDaysTo(today, -(dayOfWeek - 1) + (when === "next_week" ? 7 : 0));
  return localDayRange(monday, addDaysTo(monday, 6), timeZone);
}

/** Local date, time and weekday of an ISO UTC instant, for text the model shows to people. */
export function describeInstant(
  iso: string,
  timeZone = APP_TZ,
): { localDate: string; localTime: string; weekday: string } {
  const date = new Date(iso);
  const p = utcToLocalParts(date, timeZone);
  return {
    localDate: formatDateOnly(p),
    localTime: `${two(p.hour)}:${two(p.minute)}`,
    weekday: WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()],
  };
}

// ---------- session scheduling (the model gives an intent; code produces the exact UTC times) ----------

export const WEEKDAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type SessionPattern = {
  time: string; // HH:mm, local
  dates?: string[]; // explicit YYYY-MM-DD dates
  weekdays?: WeekdayCode[];
  when?: "this_week" | "next_week";
  startDate?: string; // first day of the window, used with weeks
  weeks?: number;
};

export type ResolvedSession = { localDate: string; weekday: string; localTime: string; startAt: string };

const MAX_SESSIONS = 30; // contract: CreateSessionsInput allows at most 30 sessions
const MAX_WEEKS = 12;

/**
 * Expands a scheduling intent into concrete sessions. Dates, weekdays and time-zone (including
 * daylight-saving) conversion are all done here, never by the model.
 */
export function resolveSessions(
  pattern: SessionPattern,
  now = new Date(),
  timeZone = APP_TZ,
): { ok: true; sessions: ResolvedSession[] } | { ok: false; message: string } {
  const clock = parseTimeOnly(pattern.time);
  if (!clock) return { ok: false, message: "Use a 24-hour time as HH:mm." };

  const days: DateOnly[] = [];
  if (pattern.dates && pattern.dates.length > 0) {
    for (const text of pattern.dates) {
      const day = parseDateOnly(text);
      if (!day) return { ok: false, message: `${text} is not a real date (use YYYY-MM-DD).` };
      days.push(day);
    }
  } else if (pattern.weekdays && pattern.weekdays.length > 0) {
    let start: DateOnly;
    let length = 7;
    if (pattern.when) {
      const today = todayLocal(now, timeZone);
      const dayOfWeek = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() || 7;
      start = addDaysTo(today, -(dayOfWeek - 1) + (pattern.when === "next_week" ? 7 : 0));
    } else if (pattern.startDate) {
      const parsed = parseDateOnly(pattern.startDate);
      if (!parsed) return { ok: false, message: `${pattern.startDate} is not a real date (use YYYY-MM-DD).` };
      const weeks = pattern.weeks ?? 1;
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) {
        return { ok: false, message: `weeks must be a whole number from 1 to ${MAX_WEEKS}.` };
      }
      start = parsed;
      length = weeks * 7;
    } else {
      return { ok: false, message: "With weekdays, also give when (this_week or next_week) or startDate." };
    }
    const wanted = new Set<string>(pattern.weekdays);
    for (let offset = 0; offset < length; offset += 1) {
      const day = addDaysTo(start, offset);
      const code = WEEKDAY_CODES[((new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() + 6) % 7)];
      if (wanted.has(code)) days.push(day);
    }
  } else {
    return { ok: false, message: "Give either dates, or weekdays together with when or startDate." };
  }

  const unique = [...new Map(days.map((d) => [formatDateOnly(d), d])).values()].sort(
    (a, b) => Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day),
  );
  if (unique.length === 0) return { ok: false, message: "No dates match that pattern." };
  if (unique.length > MAX_SESSIONS) {
    return { ok: false, message: `That would create ${unique.length} sessions; the limit is ${MAX_SESSIONS} at a time.` };
  }
  return {
    ok: true,
    sessions: unique.map((day) => {
      const startAt = zonedTimeToUtc({ ...day, ...clock }, timeZone).toISOString();
      const { weekday } = describeInstant(startAt, timeZone);
      return { localDate: formatDateOnly(day), weekday, localTime: pattern.time, startAt };
    }),
  };
}
