import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewsCard } from "@/components/NewsCard";
import type { NewsCard as T } from "@/lib/types";

const card: T = {
  type: "news",
  id: 1,
  title_en: "Big News Today",
  summary_en: "Something happened.",
  summary_vi: "Có chuyện đã xảy ra.",
  category: "World",
  cefr: "B1",
  source_url: "https://x/1",
  published_at: new Date().toISOString(),
};

describe("NewsCard", () => {
  it("renders English summary and calls onWord when a word is tapped", () => {
    const onWord = vi.fn();
    render(<NewsCard card={card} onWord={onWord} />);
    fireEvent.click(screen.getByText("Something"));
    expect(onWord).toHaveBeenCalledWith("something");
  });

  it("reveals the Vietnamese summary on toggle", () => {
    render(<NewsCard card={card} onWord={() => {}} />);
    const block = screen.getByText("Có chuyện đã xảy ra.").closest(".vi-block")!;
    expect(block.className).not.toContain("open");
    fireEvent.click(screen.getByText(/Tiếng Việt/));
    expect(block.className).toContain("open");
  });
});
