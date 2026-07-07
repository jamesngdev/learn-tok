"use client";
import { tokenize } from "@/utils/tokenize";

export function TappableText({
  text,
  onWord,
}: {
  text: string;
  onWord: (word: string) => void;
}) {
  const tokens = tokenize(text);
  return (
    <>
      {tokens.map((t, i) =>
        t.word ? (
          <button
            key={i}
            type="button"
            className="word"
            onClick={() => onWord(t.word!)}
          >
            {t.text}
          </button>
        ) : (
          <span key={i}>{t.text}</span>
        )
      )}
    </>
  );
}
