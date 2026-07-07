import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("PWA manifest", () => {
  it("declares standalone display and a start url", () => {
    const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.icons.length).toBeGreaterThanOrEqual(1);
  });
});
