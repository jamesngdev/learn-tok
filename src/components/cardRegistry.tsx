import type { ReactNode } from "react";
import type { Card } from "@/lib/types";
import { NewsCard } from "./NewsCard";
import { KnowledgeCard } from "./KnowledgeCard";

export interface CardHandlers {
  onWord: (word: string) => void;
  onIgnore: (type: "news" | "knowledge", id: number) => void;
  onDetail: (id: number) => void;
}

export function renderCard(card: Card, h: CardHandlers): ReactNode {
  switch (card.type) {
    case "news":
      return (
        <NewsCard
          card={card}
          onWord={h.onWord}
          onIgnore={() => h.onIgnore("news", card.id)}
        />
      );
    case "knowledge":
      return (
        <KnowledgeCard
          card={card}
          onWord={h.onWord}
          onDetail={() => h.onDetail(card.id)}
          onIgnore={() => h.onIgnore("knowledge", card.id)}
        />
      );
    default:
      return null;
  }
}
