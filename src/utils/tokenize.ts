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
    const core = part.toLowerCase().replace(/[^a-z]/g, "");
    tokens.push({ text: part, word: core.length > 0 ? core : null });
  }
  return tokens;
}
