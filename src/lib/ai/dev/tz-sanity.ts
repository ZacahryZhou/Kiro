// Sanity check that the runtime applies B.C.'s permanent UTC-7 rule after Nov 1, 2026.
export function timeZoneDataProblem(): string | null {
  const local = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Vancouver",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  const summer = local("2026-10-13T23:00:00.000Z"); // 16:00 at UTC-7
  const winter = local("2026-11-04T23:00:00.000Z"); // also 16:00 at UTC-7 after the transition
  if (summer === "16:00" && winter === "16:00") return null;
  return `This Node build's time zone data does not apply permanent UTC-7 in B.C.: expected 16:00 at both instants, got "${summer}" and "${winter}" (node ${process.version}, tz ${process.versions.tz ?? "unknown"}).`;
}
