// Europe/Bucharest business-hours gate, independent of any scheduler.
// Window: Mon–Fri 10:00 (inclusive) to 18:00 (exclusive) Europe/Bucharest.
// Computed via Intl so it's correct under both EET (UTC+2, winter) and
// EEST (UTC+3, summer) without bundling a tz database.

export interface GateResult {
  ok: boolean;
  localTime: string;
  reason?: string;
}

export function inBusinessHours(now: Date = new Date()): GateResult {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bucharest",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  ) as { weekday: string; hour: string; minute: string };

  const dowMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const dow = dowMap[parts.weekday] ?? 0;
  const hour = Number(parts.hour);
  const localTime = `${parts.weekday} ${parts.hour}:${parts.minute} Europe/Bucharest`;

  if (dow === 0) return { ok: false, localTime, reason: "unknown weekday" };
  if (dow > 5) return { ok: false, localTime, reason: "weekend" };
  if (hour < 10 || hour >= 18) {
    return { ok: false, localTime, reason: "outside 10:00–18:00" };
  }
  return { ok: true, localTime };
}
