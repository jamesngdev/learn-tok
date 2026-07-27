# DailyTok

Personal Vietnamese knowledge + news feed. A TikTok-style vertical feed of text
cards, all written in Vietnamese by DeepSeek:

- **Tin tức** — a Vietnamese summary of each VnExpress front-page story.
- **Kiến thức** — a generated in-depth lesson (500–900 words) on one of your
  topics of interest, with a Mermaid diagram when it helps.

English technical terms are kept in English, and those terms stay tappable for
pronunciation + meaning. Driving mode reads the whole feed aloud from
server-generated TTS audio.

> Content language: everything the model writes is Vietnamese. The DB columns
> are still named `title_en` / `summary_en` / `summary_vi` (legacy) — the two
> summary columns now hold the same Vietnamese text, and `cefr` is a fixed
> placeholder.

## Chi tiêu — `/chi-tieu`
A second screen, unrelated to the feed: an expense ledger you write to by typing
in Vietnamese. "trưa cơm 45k, gửi xe 5k" → DeepSeek splits it into items and
writes them straight to SQLite via function calling; the same box answers
questions ("tháng này ăn uống bao nhiêu?").

Every number comes from a `SUM()` in SQL and every date range is resolved
server-side in `Asia/Ho_Chi_Minh` — the model picks a named period and reads the
result, it never does arithmetic. Tap any row to fix or delete it, and `＋ thêm
tay` records spending even when DeepSeek is unreachable.

Design notes: `docs/superpowers/specs/2026-07-27-expense-chat-design.md`.

## Setup
1. `cp .env.example .env` and set `DEEPSEEK_API_KEY` + `DATABASE_PATH`.
2. `npm install`
3. `npm run build && npm start`

## Hourly crawl (system cron)
Add to crontab (`crontab -e`), adjusting the path:
```
0 * * * * cd /path/to/daily-tok && /usr/bin/env DEEPSEEK_API_KEY=... DATABASE_PATH=/path/to/dailytok.db npm run crawl >> /var/log/dailytok-crawl.log 2>&1
```
Run once manually to seed the feed: `npm run crawl`.

## Resetting generated content
After changing the generation prompts/language, wipe the old cards so they get
regenerated (saved words + topics of interest are kept):
```
npm run reset-content && npm run crawl
```

## Notes
- `better-sqlite3` is a native module. On the VPS run `npm rebuild better-sqlite3`
  if the prebuilt binary does not match the platform.
- The DeepSeek API key lives only in server-side env — never shipped to the browser.

## Tests
`npm test`
