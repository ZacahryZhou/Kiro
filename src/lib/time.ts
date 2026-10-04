const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

type ZonedDateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dateFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const values = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function zonedMidnightAsUtc(year: number, month: number, day: number, timeZone: string): Date {
  const wallClock = Date.UTC(year, month - 1, day);
  let utc = wallClock;

  // Re-evaluate the offset so this also handles weeks that cross a DST change.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = getZonedParts(new Date(utc), timeZone);
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    utc = wallClock - (localAsUtc - utc);
  }

  return new Date(utc);
}

export function getWeekRange(
  weekOffset = 0,
  now = new Date(),
  timeZone = process.env.APP_TZ || "America/Vancouver",
): { from: Date; to: Date } {
  const localNow = getZonedParts(now, timeZone);
  const localDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + weekOffset * 7));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  const monday = new Date(localDate);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  return {
    from: zonedMidnightAsUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), timeZone),
    to: zonedMidnightAsUtc(
      nextMonday.getUTCFullYear(),
      nextMonday.getUTCMonth() + 1,
      nextMonday.getUTCDate(),
      timeZone,
    ),
  };
}

export function getLocalDateKey(date: Date, timeZone = process.env.APP_TZ || "America/Vancouver"): string {
  const { year, month, day } = getZonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatLocalDate(date: Date, timeZone = process.env.APP_TZ || "America/Vancouver"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function formatLocalTime(date: Date, timeZone = process.env.APP_TZ || "America/Vancouver"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(date);
}

/** Converts a local date (YYYY-MM-DD) and time (HH:mm) in `timeZone` to a UTC ISO string, or null if either is invalid. */
export function localDateTimeToUtcIso(date: string, time: string, timeZone = process.env.APP_TZ || "America/Vancouver"): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  const wallClock = Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]));
  let utc = wallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = getZonedParts(new Date(utc), timeZone);
    utc = wallClock - (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - utc);
  }
  return new Date(utc).toISOString();
}
