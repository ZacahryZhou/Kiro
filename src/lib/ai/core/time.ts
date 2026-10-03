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
