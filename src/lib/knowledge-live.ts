import type { DB } from "./db";
import {
  generateKnowledge,
  generateKnowledgeBatch,
  countActiveKnowledge,
} from "./knowledge";
import { getInterests } from "./settings";

/** Generate `count` new knowledge cards using the real DeepSeek service. */
export function generateKnowledgeNow(db: DB, count: number): Promise<number> {
  return generateKnowledgeBatch(db, count, {
    // Read the user's interests fresh on each call so new settings take effect.
    generate: (topics) => generateKnowledge(topics, getInterests(db)),
    now: () => new Date().toISOString(),
  });
}

/**
 * Keep the pool of non-ignored knowledge cards near `target`, generating at
 * most `maxPerRun` per call so we never make a runaway number of DeepSeek calls.
 */
export async function topUpKnowledge(
  db: DB,
  target = 10,
  maxPerRun = 4
): Promise<{ generated: number; active: number }> {
  const active = countActiveKnowledge(db);
  const need = Math.min(maxPerRun, Math.max(0, target - active));
  if (need === 0) return { generated: 0, active };
  const generated = await generateKnowledgeNow(db, need);
  return { generated, active: active + generated };
}
