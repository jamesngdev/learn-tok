/**
 * Convert lesson Markdown into clean text for text-to-speech:
 * drop code blocks (noisy to read aloud), unwrap links/formatting, and make
 * headings read as sentences.
 */
export function markdownToSpeech(md: string): string {
  let t = md;
  t = t.replace(/```[\s\S]*?```/g, " "); // fenced code blocks
  t = t.replace(/`([^`]+)`/g, "$1"); // inline code -> keep text
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " "); // images
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links -> text
  t = t.replace(/^\s{0,3}#{1,6}\s*(.+?)\s*#*\s*$/gm, "$1."); // headings -> "Text."
  t = t.replace(/^\s*>+\s?/gm, ""); // blockquotes
  t = t.replace(/^\s*([-*+]|\d+\.)\s+/gm, ""); // list markers
  t = t.replace(/\|/g, " "); // table pipes
  t = t.replace(/[*_~]{1,3}/g, ""); // bold/italic/strike markers
  t = t.replace(/^\s*[-=]{3,}\s*$/gm, " "); // rules
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{2,}/g, ". "); // paragraph breaks -> sentence break
  t = t.replace(/\n/g, " ");
  t = t.replace(/\s*\.\s*\./g, "."); // collapse double periods
  return t.replace(/\s+/g, " ").trim();
}
