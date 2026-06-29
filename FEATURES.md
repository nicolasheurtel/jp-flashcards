# Japanese Flashcards — Feature Map

This file is the canonical reference for what exists, how it works, and what is planned.
It is the first thing Claude should read at the start of any conversation about this project.

---

## Stack

- Pure vanilla JS (ES modules), no build step
- IndexedDB for all persistence (weights, session history)
- PWA with service worker → works offline once loaded
- Single-file CSS, system fonts only
- Entry: `index.html` → `app.js`
- Data: `/data/*.json`, listed in `/data/index.json`
- Dev server: `node serve.js` → `http://localhost:8000`

---

## File map

| File | Role |
|---|---|
| `app.js` | All UI, routing, study loop, sampling, grading |
| `data.js` | Loads and validates decks from `/data/` |
| `db.js` | IndexedDB: Memory store (weights + SRS) and Sessions store |
| `styles.css` | All styles — washi/sumi palette |
| `sw.js` | Service worker for offline caching |
| `serve.js` | Tiny local dev server (Node, no npm) |
| `/data/index.json` | Manifest listing all deck files |
| `/data/hiragana.json` | 46 hiragana characters |
| `/data/katakana.json` | 46 katakana characters |
| `/data/words-n5.json` | ~80 N5 vocabulary words |
| `/data/verbs-n5.json` | ~40 N5 verbs |
| `/data/words-common.json` | Shorter common-word deck (subset of N5, not in index.json yet) |
| `/perso/notes.md` | User scratch notes (gitignored) |

---

## Deck format

```json
{
  "id": "unique-id",
  "title": "Display name",
  "type": "vocab | kana",
  "fields": ["script", "kana", "romaji", "english"],
  "prompt": "script",
  "answer": "english",
  "items": [
    { "i": 1, "script": "水", "kana": "みず", "romaji": ["mizu"], "english": ["water"], "note": "optional string" }
  ]
}
```

**Field names in use:**
- `char` — single hiragana/katakana character (kana decks)
- `script` — kanji or kanji+kana word (vocab decks)
- `kana` — hiragana reading
- `romaji` — romaji pronunciation (array, multiple accepted)
- `english` — English meaning (array, multiple accepted)

Fields marked as "script fields" (`char`, `script`, `kana`) trigger tap-choice mode instead of typing.

---

## Screens & routing

`state.screen` drives the router. Screens:

### `home`
Landing page. Buttons: Start study → `setup`, Browse & read → `browse`, Past sessions → `history`, Backup & restore → `data`. Shows deck chips (title + count).

### `setup`
Configure a study session. Persists in `state.config` across visits (so settings are remembered within a browser tab).

**Decks & range panel:** Toggle each deck on/off; set card range (from/to by item index); set frequency 0–100 (0 = never shown).

**Direction panel:** Multi-field toggle buttons for Show and Answer.
- `config.front[]` — array of field names shown on the card face (can be multiple)
- `config.back[]` — array of field names revealed as the answer (can be multiple)
- A field cannot be in both front and back
- Examples: `front:["script","romaji"]` + `back:["english"]` shows kanji+romaji, asks for English; `front:["script"]` + `back:["english","romaji"]` shows kanji, reveals both English and romaji
- "Swap direction randomly" checkbox — randomly swaps front↔back each card

**Mode panel:** Quick (self-grade) or Write it (type/tap).

**Length panel:** 10 / 20 / 40 / Endless.

### `study`
Active study loop. Header shows progress (answered/total) and correct count.

**Phases per card:**
1. `prompt` — shows front fields; in Quick mode: "Show answer" button; in Write mode: type field or tap choice grid
2. `graded` — shows ○/× mark, front fields, all back fields, optional note, weight tuner (less/more), Next button

**Direction resolution per card:** If a chosen deck doesn't have a selected field (e.g., hiragana has no `script` field), it falls back to the deck's own `prompt`/`answer` defaults. This allows mixing deck types safely.

**Write mode — explicit answers:**
- If `back[0]` is a script field (`char`/`script`/`kana`): show 4-option tap grid (correct + 3 random from same deck)
- Otherwise: text input. `Enter` or "Check" submits. Normalized comparison (lowercase, strip spaces). After grading, all `back[]` fields are revealed.

### `summary`
Post-session: score as percentage seal, correct/total, breakdown by deck. Buttons: Study again → `setup`, Home.

### `history`
List of past sessions (most recent first): score %, date/time, correct/answered, decks used.

### `data`
Backup & restore. Export = JSON download with all memory records + session history. Import = merge (most recent `lastSeen` wins). Reset = wipe all progress.

### `browse`
Read-only reference view of all cards. Persists filter state in `state.browse` within the tab.

**Filters:** Search box (matches any field, case-insensitive); deck filter chips (All + each deck).

**Item display:** Main glyph/word (large), other fields in a compact line, deck tag on the right. Collapsible note via `<details>`.

**Edit mode** (toggle "Edit" button): Replaces deck tag with weight nudge buttons (− / weight / +). Changes persist immediately to IndexedDB. No full re-render required for weight changes.

---

## Memory & SRS system (`db.js`)

### Memory record (one per card)
```
key: "deckId:i"
weight: 5..100       ← manual layer driving v1 sampling (50 = default)
ease: 1.3..3.0       ← SM-2 ease factor
intervalDays: 0..n   ← SM-2 interval
dueAt: timestamp     ← SM-2 next due date
lastSeen: timestamp
streak: n            ← consecutive correct
seen: n              ← total seen
correct: n           ← total correct
```

### Sampling (weighted random)
`w = (deckFrequency/100) × (itemWeight/100)`. Soft anti-repeat: if the same card was just shown, its weight is multiplied by 0.15.

### Grading effect on weight
- Correct: `weight -= 12` (floors at 5), streak++, interval grows SM-2 style
- Wrong: `weight += 12` (caps at 100), streak=0, interval resets to 0
- Manual tune (study screen): ±12 per click
- Manual tune (browse edit mode): ±12 per click

---

## State shape (`app.js`)

```js
state = {
  decks: [],           // loaded deck objects
  screen: "home",      // current route
  config: null,        // study session config (persists within tab)
  run: null,           // active session runtime
  browse: {
    deckId: "all",     // active deck filter
    query: "",         // search string
    editMode: false,   // weight-edit mode
  }
}
```

### `config` shape
```js
{
  decks: { [deckId]: { enabled, min, max, freq } },
  front: ["script"],           // array of field names (NEW: was single string)
  back: ["english"],           // array of field names (NEW: was single string)
  mixed: false,
  mode: "quick" | "explicit",
  length: 10 | 20 | 40 | 0,  // 0 = endless
}
```

---

## CSS design system

Palette: washi paper (`--paper: #eae7dd`), sumi ink (`--ink: #22211d`), ai-iro indigo (`--indigo: #28384e`), shu vermilion (`--shu: #c5472d`).

Key classes: `.btn.primary`, `.btn.ghost`, `.btn.big`, `.panel`, `.seg` / `.seg-btn`, `.card`, `.prompt.glyph/word/en`, `.reveal-answer`, `.choice`, `.chip`, `.browse-*`.

---

## Planned / not yet built

### Content additions (data files)
- [ ] Expressions by context: hotel, restaurant, asking directions, shopping
- [ ] Grammar rules deck (new deck type, possibly with examples)
- [ ] Self-introduction sentences (user to provide personal info)
- [ ] Reading stories generated from vocabulary (short texts)

### UI / mode additions
- [ ] "Reading" mode in Browse: display pre-written short stories or all vocabulary listed as readable sentences
- [ ] Possibly: story generation from vocabulary items in a deck

### Technical
- [ ] `words-common.json` is not yet in `data/index.json` (duplicate of N5 subset — decide to merge or drop)

---

## How to add a new deck

1. Create `/data/my-deck.json` following the deck format above
2. Add `"my-deck.json"` to the `decks` array in `/data/index.json`
3. Reload — no code changes needed

The deck will appear in setup, browse, and history automatically.
