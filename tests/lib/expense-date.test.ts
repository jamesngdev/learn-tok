import { describe, it, expect } from "vitest";
import {
  addDays,
  isValidDay,
  monthEnd,
  monthStart,
  resolvePeriod,
  todayInVN,
  weekStart,
  weekdayVN,
} from "@/lib/expense-date";

describe("todayInVN", () => {
  it("uses Vietnam time, so late-evening UTC is already tomorrow", () => {
    // 2026-07-26T17:30:00Z is 2026-07-27 00:30 in Hanoi.
    expect(todayInVN(new Date("2026-07-26T17:30:00Z"))).toBe("2026-07-27");
    expect(todayInVN(new Date("2026-07-26T16:59:00Z"))).toBe("2026-07-26");
  });
});

describe("day arithmetic", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("finds month bounds, including February", () => {
    expect(monthStart("2026-07-27")).toBe("2026-07-01");
    expect(monthEnd("2026-07-27")).toBe("2026-07-31");
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(monthEnd("2024-02-10")).toBe("2024-02-29");
  });

  it("starts weeks on Monday", () => {
    // 2026-07-27 is a Monday; 2026-07-26 the Sunday before it.
    expect(weekStart("2026-07-27")).toBe("2026-07-27");
    expect(weekStart("2026-07-26")).toBe("2026-07-20");
    expect(weekdayVN("2026-07-27")).toBe("Thứ hai");
    expect(weekdayVN("2026-07-26")).toBe("Chủ nhật");
  });

  it("rejects malformed and impossible days", () => {
    expect(isValidDay("2026-07-27")).toBe(true);
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("27/07/2026")).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
  });
});

describe("resolvePeriod", () => {
  const today = "2026-07-27"; // a Monday

  it("resolves the named periods the model can pick", () => {
    expect(resolvePeriod("today", today)).toMatchObject({ from: today, to: today });
    expect(resolvePeriod("yesterday", today)).toMatchObject({
      from: "2026-07-26",
      to: "2026-07-26",
    });
    expect(resolvePeriod("this_week", today)).toMatchObject({ from: "2026-07-27", to: today });
    expect(resolvePeriod("last_week", today)).toMatchObject({
      from: "2026-07-20",
      to: "2026-07-26",
    });
    expect(resolvePeriod("this_month", today)).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(resolvePeriod("last_month", today)).toMatchObject({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(resolvePeriod("last_7_days", today)).toMatchObject({ from: "2026-07-21", to: today });
    expect(resolvePeriod("last_30_days", today)).toMatchObject({ from: "2026-06-28", to: today });
    expect(resolvePeriod("this_year", today)).toMatchObject({ from: "2026-01-01", to: today });
  });

  it("labels last_month with its own month, not today's", () => {
    expect(resolvePeriod("last_month", "2026-01-15").label).toBe("tháng 12/2025");
  });

  it("falls back to the current month for anything unknown", () => {
    expect(resolvePeriod("since_i_was_born", today)).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });
});
