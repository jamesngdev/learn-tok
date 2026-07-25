export interface Token {
  text: string;
  word: string | null;
}

export function tokenize(text: string): Token[] {
  // Split on whitespace boundaries, keeping the whitespace as its own tokens.
  const parts = text.split(/(\s+)/);
  const tokens: Token[] = [];
  for (const part of parts) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      tokens.push({ text: part, word: null });
      continue;
    }
    // Cards are Vietnamese; only the English terms kept inside them are worth
    // looking up in the (English) dictionary. A token carrying Vietnamese
    // letters (diacritics) is rendered as plain text, not a lookup button —
    // stripping its diacritics would query a mangled word.
    const core = /[^\x00-\x7F]/.test(part)
      ? ""
      : part.toLowerCase().replace(/[^a-z]/g, "");
    tokens.push({ text: part, word: core.length > 0 ? core : null });
  }
  return tokens;
}
