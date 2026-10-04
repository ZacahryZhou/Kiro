// Sanity check for the runtime's time zone data. If this fails, the Node/ICU build is wrong or outdated
// and every daylight-saving check below it will fail for that reason, not because of the code under test.
export function timeZoneDataProblem(): string | null {
  const local = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Vancouver",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).format(new Date(iso));
  const summer = local("2026-10-13T23:00:00.000Z"); // 16:00 PDT
  const winter = local("2026-11-04T00:00:00.000Z"); // 16:00 PST, after the Nov 1 clock change
  if (summer.startsWith("16:00") && summer.endsWith("PDT") && winter.startsWith("16:00") && winter.endsWith("PST")) {
    return null;
  }
  return `This Node build's time zone data is wrong: expected "16:00 PDT" and "16:00 PST", got "${summer}" and "${winter}" (node ${process.version}, tz ${process.versions.tz ?? "unknown"}).`;
}
