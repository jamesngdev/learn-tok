import { describe, it, expect } from "vitest";
import { relativeTime, readTimeSeconds } from "@/utils/format";

describe("relativeTime", () => {
  const now = new Date("2026-07-07T05:00:00Z");
  it("formats hours", () => {
    expect(relativeTime("2026-07-07T03:00:00Z", now)).toBe("2h ago");
  });
  it("formats minutes", () => {
    expect(relativeTime("2026-07-07T04:30:00Z", now)).toBe("30m ago");
  });
});

describe("readTimeSeconds", () => {
  it("estimates from word count", () => {
    expect(readTimeSeconds("one two three four five six")).toBeGreaterThan(0);
  });
});
