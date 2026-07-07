# DailyTok

Personal English-learning news feed from VnExpress. A TikTok-style vertical feed
of text cards: each card is an English summary of a VnExpress front-page story
(written by DeepSeek), with a Vietnamese version one tap away and every word
tappable for pronunciation + meaning.

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

## Notes
- `better-sqlite3` is a native module. On the VPS run `npm rebuild better-sqlite3`
  if the prebuilt binary does not match the platform.
- The DeepSeek API key lives only in server-side env — never shipped to the browser.

## Tests
`npm test`
