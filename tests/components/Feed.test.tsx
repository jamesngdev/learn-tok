import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Feed } from "@/components/Feed";
import type { FeedPage } from "@/lib/feed";

const page: FeedPage = {
  cards: [
    {
      type: "news", id: 1, title_en: "First Story", summary_en: "Body one.",
      summary_vi: "Thân một.", category: "World", cefr: "B1",
      source_url: "https://x/1", published_at: new Date().toISOString(),
    },
  ],
  nextCursor: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("Feed", () => {
  it("renders initial cards", () => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {} disconnect() {} unobserve() {}
    });
    render(<Feed initial={page} />);
    // The headline is tokenized into per-word buttons, so match a single word.
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Story")).toBeInTheDocument();
    expect(screen.getByText(/words today/)).toBeInTheDocument();
  });
});
