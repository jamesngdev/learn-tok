import { describe, it, expect } from "vitest";
import { markdownToSpeech } from "@/lib/speech-text";

describe("markdownToSpeech", () => {
  it("drops code blocks and unwraps formatting/links/headings", () => {
    const md = [
      "## The Problem",
      "Opening a **new** connection is `expensive`.",
      "```js",
      "pool.query('SELECT 1')",
      "```",
      "- Use a [pool](https://x.com)",
    ].join("\n");
    const out = markdownToSpeech(md);
    expect(out).toContain("The Problem.");
    expect(out).toContain("Opening a new connection is expensive.");
    expect(out).toContain("Use a pool");
    expect(out).not.toContain("pool.query");
    expect(out).not.toContain("```");
    expect(out).not.toContain("#");
    expect(out).not.toContain("*");
  });

  it("collapses whitespace", () => {
    expect(markdownToSpeech("a\n\n\nb")).toBe("a. b");
  });
});
