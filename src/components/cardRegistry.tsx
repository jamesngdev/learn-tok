import type { ReactNode } from "react";
import type { Card } from "@/lib/types";
import { NewsCard } from "./NewsCard";

export function renderCard(card: Card, onWord: (w: string) => void): ReactNode {
  switch (card.type) {
    case "news":
      return <NewsCard card={card} onWord={onWord} />;
    default:
      return null;
  }
}
