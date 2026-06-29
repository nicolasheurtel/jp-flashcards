# Japanese Flashcards

An offline-first flashcard + quiz web app (PWA). Runs in the browser, installs to
the home screen on iPhone and as an app window on Windows, and works with no
connection once loaded. Progress is stored on-device; move it between devices with
Export / Import.

## Run it

It must be **served over http(s)**, not opened as a `file://` (ES modules need a
server). Options:

- **GitHub Pages** — push this folder to a repo, enable Pages, done.
- **Locally** — from this folder run `python -m http.server 8000`, then open
  `http://localhost:8000`.

## Project layout

```
index.html            app shell + PWA meta
app.js                screens, sampling engine, grading, sessions
db.js                 IndexedDB: per-card memory + session history, export/import
data.js               deck loader
styles.css            styling
manifest.webmanifest  install metadata
sw.js                 service worker (offline cache)
icons/                app icons
data/
  index.json          manifest: lists which deck files to load
  hiragana.json       deck
  katakana.json       deck
  words-common.json   sample deck (NOT loaded until added to index.json)
```

## How studying works

- Each card has two weighting layers stored in one memory record:
  - **weight** (0–100) — the manual layer; drives how often a card appears now.
  - **ease / intervalDays / dueAt / streak** — spaced-repetition fields, updated
    every answer but not yet driving selection. They're there so a future
    automatic SRS mode can switch on with no data migration.
- A card's chance of appearing = `deckFrequency (0–100) × weight (0–100)`,
  normalized over the in-range pool. Frequency 0 = a deck never appears.
- Answering "right" lowers a card's weight (seen less); "wrong" raises it (seen
  more). You can also nudge a card up/down by hand after each answer.

## Adding a deck

1. Create `data/your-deck.json` (copy the schema below).
2. Add `"your-deck.json"` to the `decks` array in `data/index.json`.
3. Reload. The app auto-creates default memory records for the new cards.

### Deck schema

```json
{
  "id": "unique-id",
  "title": "Shown in the app",
  "type": "kana | vocab | anything",
  "fields": ["char", "romaji"],
  "prompt": "char",
  "answer": "romaji",
  "items": [
    { "i": 1, "char": "あ", "romaji": ["a"] }
  ]
}
```

- `fields` — the data each item carries; needs at least two. The app lets you
  study any field → any field.
- `prompt` / `answer` — the default front/back (overridable per session).
- `i` — the order index (powers ranges like "30–50" and random selection).
- Answer fields can hold **multiple accepted values**: `"romaji": ["shi", "si"]`.
- Fields named `char`, `script`, or `kana` are treated as Japanese characters:
  in "Write it" mode they become tap-to-choose (no Japanese keyboard needed);
  `romaji` / `english` are typed.

To try it now: add `"words-common.json"` to `data/index.json` and reload.
```
```
