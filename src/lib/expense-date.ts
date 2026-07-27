/**
 * Date helpers for the expense screen. Everything is done in Vietnam time so
 * "hôm nay" means the user's today, not UTC's — a 23:30 dinner in Hanoi must
 * not land on tomorrow's total.
 *
 * The model never does date arithmetic: it picks a named period and these
 * functions turn it into a concrete YYYY-MM-DD range.
 */

const TZ = "Asia/Ho_Chi_Minh";

export const PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
  "this_year",
] as const;

export type Period = (typeof PERIODS)[number];

export interface DateRange {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  label: string; // Vietnamese label the model can echo back
}

/** Today in Vietnam as YYYY-MM-DD. */
export function todayInVN(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

/** Vietnamese weekday name of a YYYY-MM-DD day. */
export function weekdayVN(day: string): string {
  return WEEKDAYS[dayIndexOfWeek(day)];
}

/** 0 = Sunday … 6 = Saturday, computed from the calendar date alone. */
function dayIndexOfWeek(day: string): number {
  // Parsed as UTC midnight so the weekday depends only on the date itself.
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function isValidDay(day: unknown): day is string {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Shift a YYYY-MM-DD day by whole days, staying on the calendar grid. */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** First day of the month a day belongs to. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Last day of the month a day belongs to. */
export function monthEnd(day: string): string {
  const d = new Date(`${monthStart(day)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week a day belongs to (weeks start Monday in Vietnam). */
export function weekStart(day: string): string {
  const dow = dayIndexOfWeek(day); // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return addDays(day, -backToMonday);
}

/** `2026-07` -> `tháng 7/2026` */
function monthLabel(day: string): string {
  return `tháng ${Number(day.slice(5, 7))}/${day.slice(0, 4)}`;
}

/**
 * Turn a named period into a concrete inclusive date range, relative to today
 * in Vietnam. Unknown periods fall back to the current month.
 */
export function resolvePeriod(period: string, today: string = todayInVN()): DateRange {
  switch (period) {
    case "today":
      return { from: today, to: today, label: "hôm nay" };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y, label: "hôm qua" };
    }
    case "this_week":
      return { from: weekStart(today), to: today, label: "tuần này" };
    case "last_week": {
      const from = addDays(weekStart(today), -7);
      return { from, to: addDays(from, 6), label: "tuần trước" };
    }
    case "last_7_days":
      return { from: addDays(today, -6), to: today, label: "7 ngày gần nhất" };
    case "last_30_days":
      return { from: addDays(today, -29), to: today, label: "30 ngày gần nhất" };
    case "last_month": {
      const prev = addDays(monthStart(today), -1);
      return { from: monthStart(prev), to: monthEnd(prev), label: monthLabel(prev) };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today, label: `năm ${today.slice(0, 4)}` };
    case "this_month":
    default:
      return { from: monthStart(today), to: monthEnd(today), label: monthLabel(today) };
  }
}
