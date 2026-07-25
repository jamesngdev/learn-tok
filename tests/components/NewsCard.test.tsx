import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewsCard } from "@/components/NewsCard";
import type { NewsCard as T } from "@/lib/types";

const card: T = {
  type: "news",
  id: 1,
  title_en: "Tin nóng hôm nay",
  summary_en: "Một chuyện đã xảy ra với cache hôm nay.",
  summary_vi: "Một chuyện đã xảy ra với cache hôm nay.",
  category: "World",
  cefr: "B1",
  source_url: "https://x/1",
  published_at: new Date().toISOString(),
};

describe("NewsCard", () => {
  it("renders the Vietnamese summary and calls onWord when a word is tapped", () => {
    const onWord = vi.fn();
    render(<NewsCard card={card} onWord={onWord} onIgnore={() => {}} />);
    fireEvent.click(screen.getByText("cache"));
    expect(onWord).toHaveBeenCalledWith("cache");
  });

  it("does not show a Vietnamese toggle any more (cards are Vietnamese)", () => {
    render(<NewsCard card={card} onWord={() => {}} onIgnore={() => {}} />);
    expect(screen.queryByText(/Tiếng Việt/)).toBeNull();
    expect(document.querySelector(".vi-block")).toBeNull();
    expect(document.querySelector(".cefr")).toBeNull();
  });
});
