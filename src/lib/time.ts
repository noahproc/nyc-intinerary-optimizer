import type { Minutes, Place, TimeWindow } from "./types";

export const NYC_TZ = "America/New_York";

export const hm = (h: number, m = 0): Minutes => h * 60 + m;

/** "13:05" -> 785 */
export function parseClock(s: string): Minutes {
  const [h, m] = s.split(":").map(Number);
  return hm(h, m || 0);
}

/** 785 -> "1:05 PM" */
export function formatClock(min: Minutes): string {
  const total = Math.round(min);
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** 785 -> "13:05" (for <input type="time">) */
export function toClockInput(min: Minutes): string {
  const t = Math.round(min);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function formatDuration(min: Minutes): string {
  const t = Math.round(min);
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD date. Calendar dates have no tz. */
export function weekday(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** Offset of `timeZone` from UTC in minutes at a given instant. */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** NYC wall-clock time on `date` -> absolute Date (handles DST). */
export function nycToDate(date: string, min: Minutes): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, 0, Math.round(min));
  // Two passes so times near a DST switch settle on the right offset.
  let guess = naiveUtc - tzOffsetMinutes(NYC_TZ, new Date(naiveUtc)) * 60000;
  guess = naiveUtc - tzOffsetMinutes(NYC_TZ, new Date(guess)) * 60000;
  return new Date(guess);
}

/** Opening windows for a place on a date; undefined hours = open all day. */
export function windowsOn(place: Place, date: string): TimeWindow[] {
  if (!place.hours) return [{ start: 0, end: hm(24) }];
  return place.hours[weekday(date)] ?? [];
}

/**
 * A short note when the visitor's home timezone differs from NYC, e.g.
 * "Your 9:00 AM start is 2:00 PM back home in London (+5 h)".
 */
export function timezoneNote(homeTz: string | undefined, date: string, dayStart: Minutes): string | undefined {
  if (!homeTz || homeTz === NYC_TZ) return undefined;
  try {
    const at = nycToDate(date, dayStart);
    const home = tzOffsetMinutes(homeTz, at);
    const nyc = tzOffsetMinutes(NYC_TZ, at);
    const diff = home - nyc;
    if (diff === 0) return undefined;
    const homeClock = formatClock((((dayStart + diff) % 1440) + 1440) % 1440);
    const sign = diff > 0 ? "+" : "−";
    const hours = Math.abs(diff) / 60;
    const city = homeTz.split("/").pop()?.replace(/_/g, " ");
    const tip =
      Math.abs(diff) >= 300
        ? diff > 0
          ? " Expect an early-evening energy dip; front-load the must-sees."
          : " You'll likely be up early; consider an earlier start."
        : "";
    return `All times are New York time. Your ${formatClock(dayStart)} start is ${homeClock} back home in ${city} (${sign}${hours} h).${tip}`;
  } catch {
    return undefined;
  }
}
