import { openDb } from "../src/lib/db";

/**
 * Wipe all generated feed content (news summaries + knowledge lessons) so the
 * crawler regenerates it in the current language/prompt. Saved words, my-words
 * and settings (topics of interest) are kept.
 *
 * Run once after changing the generation language:  npm run reset-content
 */
function main() {
  const db = openDb();
  const before = {
    articles: (db.prepare("SELECT COUNT(*) c FROM articles").get() as { c: number }).c,
    knowledge: (db.prepare("SELECT COUNT(*) c FROM knowledge").get() as { c: number }).c,
  };
  db.exec("DELETE FROM articles; DELETE FROM knowledge; DELETE FROM ignored;");
  console.log(
    `reset-content: deleted articles=${before.articles} knowledge=${before.knowledge} ` +
      `(ignore list cleared; words/settings kept)`
  );
  db.close();
}

main();
