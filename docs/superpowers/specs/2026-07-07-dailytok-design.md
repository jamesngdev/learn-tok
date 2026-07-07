# DailyTok — Design Spec

**Date:** 2026-07-07
**Status:** Approved (brainstorming) → ready for implementation planning
**Author:** trinv

---

## 1. Summary

DailyTok is a **personal, mobile-first English-learning news feed**. It presents
VnExpress front-page news as a TikTok-style vertical, text-only, snap-scrolling
feed. Each card's primary content is an **English** summary (written by DeepSeek);
**any word is tappable** for live pronunciation + Vietnamese meaning, and the full
Vietnamese summary is one tap away for comprehension checking. Words the user taps
or saves accumulate into a personal **"My Words"** list — the seed for future card
types (word-of-the-day, vocabulary review, daily knowledge).

The app crawls VnExpress **hourly**, summarizes new articles with DeepSeek, and
serves them from a local database. Single user, no authentication.

**Interactive reference mockup:** the approved UX is captured in a clickable
mockup (feed scroll, word bottom-sheet, VI reveal, My Words counter, themes).

## 2. Goals & non-goals

**Goals**
- A daily reading ritual that improves English while keeping up with the news.
- English-first cards; Vietnamese as a comprehension aid, never the default.
- Tap-any-word learning with real audio, IPA, and Vietnamese meaning.
- A card-type system that makes adding future card types (word, knowledge) cheap.
- Resilient: always serve cached content even when a crawl or an API call fails.

**Non-goals (this phase)**
- Multiple users, accounts, or authentication.
- Card types other than `news` (the data model supports them; they are not built).
- Personalized ranking / recommendation. Feed is reverse-chronological.
- Spaced-repetition review UI for My Words (list only for now).
- Crawling categories beyond the VnExpress front page.

## 3. Users & platform

- **Audience:** single user (the author). No login.
- **Platform:** mobile web, installable as a PWA (add to home screen, offline feed cache).
- **Stack:** Next.js (App Router) on the author's own VPS.
- **Datastore:** SQLite (single file on the VPS).
- **Content language:** English summaries primary; Vietnamese summary secondary.

## 4. Content language & summary format

Per article, DeepSeek produces one structured object:

| Field | Description |
|-------|-------------|
| `title_en` | English rewrite of the headline |
| `summary_en` | 2–3 sentence English summary (the card hero text) |
| `summary_vi` | Vietnamese summary of equivalent meaning (reveal-on-tap) |
| `category` | One of the front-page categories, normalized (e.g. World, Business, Science, Life) |
| `cefr` | Estimated reading difficulty: `A2` / `B1` / `B2` / `C1` |

Summaries are short by design — they must fit one card without scrolling on a phone.

## 5. Architecture

Four units, each independently understandable and testable:

### 5.1 Crawler + summarizer (hourly job)
- Triggered hourly by a cron on the VPS.
- Fetch the VnExpress **front-page RSS** feed (RSS, not HTML scraping).
- For each item, **dedup by GUID/link** against the `articles` table; skip known items.
- For each new item, fetch the article page and extract the main body text.
- Call **DeepSeek once** per article → structured JSON (§4). JSON output mode.
- Insert the resulting row into `articles`.
- **Failure handling:** a failed fetch or a failed/invalid DeepSeek response for one
  article is logged and skipped; it does not abort the run and the item stays
  un-summarized so the next run can retry it. The run summarizes what it can.

### 5.2 Feed API
- `GET /api/feed?cursor=<published_at|id>&limit=<n>` → page of cards,
  newest-first, each card shaped as a **discriminated union** with `type: "news"`
  and the fields from §4 plus `source_url`, `published_at`.
- Serves purely from the database — never blocks on a live crawl.

### 5.3 Word lookup API
- `GET /api/word?w=<word>` → `{ word, ipa, audio_url, pos, meaning_vi, example }`.
- **Live lookup** composed from:
  - a free dictionary API for IPA + native audio + part of speech, and
  - a translation source for the Vietnamese meaning.
- Results are **cached in a `words` table** keyed by the lowercased word, so
  repeated words (common across articles) resolve instantly and build a corpus.
- **Failure handling:** if the dictionary/translation source is unavailable, the
  API returns whatever it has; the client always has browser TTS as a fallback for
  pronunciation.

### 5.4 Frontend (Next.js App Router)
- **Feed view:** full-viewport cards, CSS `scroll-snap-type: y mandatory`,
  `scroll-snap-stop: always`; infinite scroll loads older pages via the cursor.
- **Card renderer registry:** a map from `card.type` → component. Only `news` is
  implemented; the registry is the extension point for future types.
- **Word interaction:** every word in the title/summary is a tappable target.
  Tapping opens a **bottom sheet** with the word, IPA, a 🔊 button, part of speech,
  Vietnamese meaning, and an example. 🔊 uses the browser `SpeechSynthesis` API
  (works with no network) and prefers the dictionary's native audio when present.
- **Comprehension reveal:** a "🇻🇳 Tiếng Việt" toggle expands `summary_vi` inline.
- **My Words:** tapping or explicitly saving a word records it to the user's word
  list; a header counter shows words added today. A simple My Words list view
  displays saved words (no review scheduling yet).
- **Chrome:** category tag + accent color, relative time, estimated read time,
  CEFR badge. Dark-first, theme-aware (light/dark), text-premium (no images).
- **PWA:** manifest + service worker; installable, caches the last feed page for
  offline reading.

## 6. Data model (SQLite)

**`articles`**
- `id` INTEGER PK
- `guid` TEXT UNIQUE — VnExpress RSS GUID/link, dedup key
- `source_url` TEXT
- `title_en` TEXT
- `summary_en` TEXT
- `summary_vi` TEXT
- `category` TEXT
- `cefr` TEXT
- `published_at` DATETIME — from RSS
- `crawled_at` DATETIME

**`words`** (lookup cache + corpus)
- `word` TEXT PK (lowercased)
- `ipa` TEXT
- `audio_url` TEXT
- `pos` TEXT
- `meaning_vi` TEXT
- `example` TEXT
- `created_at` DATETIME

**`my_words`** (personal collection)
- `word` TEXT PK (references `words.word`)
- `saved_at` DATETIME
- `source_article_id` INTEGER NULL — where it was first tapped

Read/seen state for the feed is kept client-side (localStorage); it is not required
server-side for a single user.

## 7. DeepSeek integration

- Model `deepseek-chat`, OpenAI-compatible endpoint (`https://api.deepseek.com`).
- **JSON output** mode; one call per article returning the §4 object.
- **API key lives only in server-side environment variables**, never shipped to the
  browser or committed. (The key pasted during brainstorming must be rotated.)
- Retry with backoff on transient errors; on repeated failure, skip the article.

## 8. Error handling & resilience (summary)

| Failure | Behavior |
|---------|----------|
| RSS fetch fails | Log; skip this run's crawl; feed still serves cached rows |
| Article body fetch fails | Log; skip that article; retried next run |
| DeepSeek fails/invalid JSON | Retry w/ backoff; skip article on repeated failure |
| Dictionary/translate API down | Return partial word data; client falls back to browser TTS |
| Client offline | PWA serves last cached feed page |

## 9. Testing strategy

- **Crawler/summarizer:** unit-test RSS parsing and dedup against fixture feeds;
  test DeepSeek response parsing with recorded/mocked JSON (valid + malformed).
- **Feed API:** test cursor pagination and newest-first ordering against a seeded DB.
- **Word API:** test cache-hit vs. live-lookup paths with a mocked dictionary source.
- **Frontend:** component test the card renderer registry (news type) and the
  word bottom-sheet open/populate/save flow.

## 10. Future phases (out of scope now, enabled by this design)

- New card types via the registry: `word` (word-of-the-day from My Words),
  `knowledge` (daily fact), etc.
- Spaced-repetition review over My Words.
- Difficulty/category filtering of the feed.
- Additional VnExpress categories.
