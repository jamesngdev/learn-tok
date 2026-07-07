import { describe, it, expect } from "vitest";
import { extractArticleBody } from "@/lib/article";
import { ARTICLE_HTML } from "../fixtures/article.html";

describe("extractArticleBody", () => {
  it("joins description and Normal paragraphs", () => {
    const body = extractArticleBody(ARTICLE_HTML);
    expect(body).toContain("phần mô tả tóm tắt");
    expect(body).toContain("Đoạn văn thứ nhất");
    expect(body).toContain("Đoạn văn thứ hai");
  });

  it("excludes non-content paragraphs like Author", () => {
    const body = extractArticleBody(ARTICLE_HTML);
    expect(body).not.toContain("Tên tác giả");
  });
});
