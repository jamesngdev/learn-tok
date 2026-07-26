import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import { markSeen, countSeen, MAX_SEEN_PER_CALL } from "@/lib/seen";

describe("markSeen", () => {
  it("records ids once and is idempotent", () => {
    const db = openDb(":memory:");
    expect(markSeen(db, "news", [1, 2, 2], "t")).toBe(2);
    expect(markSeen(db, "news", [2, 3], "t")).toBe(1);
    expect(countSeen(db, "news")).toBe(3);
  });

  it("ignores junk ids and separates card types", () => {
    const db = openDb(":memory:");
    expect(markSeen(db, "news", [0, -4, NaN, 1.5] as number[], "t")).toBe(0);
    markSeen(db, "news", [7], "t");
    expect(countSeen(db, "knowledge")).toBe(0);
  });

  it("caps how many ids one call can record", () => {
    const db = openDb(":memory:");
    const ids = Array.from({ length: MAX_SEEN_PER_CALL + 50 }, (_, i) => i + 1);
    expect(markSeen(db, "news", ids, "t")).toBe(MAX_SEEN_PER_CALL);
  });
});
