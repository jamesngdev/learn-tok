import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import { getInterests, setInterests } from "@/lib/settings";

describe("interests settings", () => {
  it("defaults to empty and round-trips saved topics", () => {
    const db = openDb(":memory:");
    expect(getInterests(db)).toEqual([]);
    setInterests(db, ["  PostgreSQL indexing ", "", "Kafka"]);
    expect(getInterests(db)).toEqual(["PostgreSQL indexing", "Kafka"]);
  });

  it("overwrites on subsequent save", () => {
    const db = openDb(":memory:");
    setInterests(db, ["A"]);
    setInterests(db, ["B", "C"]);
    expect(getInterests(db)).toEqual(["B", "C"]);
  });
});
