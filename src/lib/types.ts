export type Cefr = "A2" | "B1" | "B2" | "C1";

export interface Summary {
  title_en: string;
  summary_en: string;
  summary_vi: string;
  category: string;
  cefr: Cefr;
}

export interface Article extends Summary {
  id: number;
  guid: string;
  source_url: string;
  published_at: string;
  crawled_at: string;
}

export interface NewsCard extends Summary {
  type: "news";
  id: number;
  source_url: string;
  published_at: string;
}

export type Card = NewsCard;

export interface WordEntry {
  word: string;
  ipa: string | null;
  audio_url: string | null;
  pos: string | null;
  meaning_vi: string | null;
  example: string | null;
}
