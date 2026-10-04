import { describeInstant, zonedTimeToUtc } from "../core/time";

// The runtime's time zone database decides Vancouver's winter offset: older data says UTC-8 after Nov 1,
// newer data (B.C.'s permanent-time change) says UTC-7. The code must be correct under either, so these
// helpers check consistency rather than a hard-coded offset.

/** Describes the winter offset this runtime uses, for information only. */
export function vancouverWinterRule(): string {
  const wallClock = zonedTimeToUtc({ year: 2026, month: 12, day: 15, hour: 12 }, "America/Vancouver");
  const offsetHours = (Date.UTC(2026, 11, 15, 12) - wallClock.getTime()) / 3_600_000;
  return `winter offset UTC${offsetHours >= 0 ? "+" : ""}${offsetHours} (node ${process.version}, tz ${process.versions.tz ?? "unknown"})`;
}

/**
 * Returns a problem description if converting wall-clock times to UTC and back does not round-trip
 * around the autumn change (which would mean a broken Node/ICU build), otherwise null.
 */
export function timeZoneDataProblem(): string | null {
  try {
    for (let day = 20; day <= 40; day += 1) {
      const date = new Date(Date.UTC(2026, 9, day)); // Oct 20 .. Nov 9
      const parts = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
      for (const hour of [0, 9, 16, 23]) {
        const utc = zonedTimeToUtc({ ...parts, hour }, "America/Vancouver");
        const back = describeInstant(utc.toISOString(), "America/Vancouver");
        const expectedDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        if (back.localDate !== expectedDate || back.localTime !== `${String(hour).padStart(2, "0")}:00`) {
          return `Local time ${expectedDate} ${hour}:00 did not round-trip through UTC (got ${back.localDate} ${back.localTime}) on node ${process.version}, tz ${process.versions.tz ?? "unknown"}.`;
        }
      }
    }
    return null;
  } catch (error) {
    return `America/Vancouver is not usable on this Node build: ${(error as Error).message}`;
  }
}
