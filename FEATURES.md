# Japanese Flashcards — Feature Map

This file is the canonical reference for what exists, how it works, and what is planned.
It is the first thing Claude should read at the start of any conversation about this project.

**MANDATORY FOR CLAUDE:** Update this file in the same commit as any code change, no exceptions.
Describe what was added/changed under the relevant section and update the roadmap checkboxes.
Never leave this file out of sync with the actual code.

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
| `/data/words-common.json` | Shorter common-word deck (subset of N5, not in index.json — kept as draft) |
| `/data/phrases-travel.json` | 35 travel phrases: basics, restaurant, directions, shopping, hotel, transport, emergencies |
| `/data/phrases-practical.json` | 20 practical daily items: sunscreen (日焼け止め), umbrella (傘), trash bins (ゴミ箱), reheating food (温め直す), polite water request, preferences (お好み), pharmacy, band-aids, insect repellent, cash/currency exchange, charger, allergy phrases, photo permission, 抜き (without ~), getting lost, restroom, bags, where-to-buy |
| `/data/self-intro.json` | 13 self-introduction sentences (personalised: Nicolas, 28, researcher at U. Edinburgh, quantum computing) |
| `/data/grammar-n5.json` | 18 grammar patterns (N5 level): particles, verb forms, question/negative/request structures |
| `/data/grammar-n4.json` | 22 grammar patterns (N4 level): てから, ながら, てみる, ておく, てしまう, ようになる, ようにする, そうです①②, でしょう, かもしれない, はずです, つもりです, ために, たら, ほうがいい, たことがある, んです, 直す, をいただけますか, てほしい, どちら/どれ |
| `/data/grammar-n3.json` | 15 grammar patterns (N3 level): ばかり, たばかり, によって, に対して, ことにする, ことになる, わけではない, に違いない, らしい, ようだ/みたいだ, まま, として, ものの, さえ〜ば, ほど〜ない |
| `/data/time-calendar.json` | 26 items: days of the week (with planet etymology), all 12 months (with cultural events + irregular readings), seasons, time expressions |
| `/data/weather-seasons.json` | 23 items: 4 seasons + 梅雨 (rainy season), weather words, the 暑い/熱い and 寒い/冷たい distinctions, temperature vocabulary |
| `/stories/index.json` | Manifest for story files (separate from deck flashcard system) |
| `/stories/01-nicolas-tokyo.json` | Story 1: Nicolas Arrives in Tokyo (9 paragraphs, 初級) |
| `/stories/02-restaurant.json` | Story 2: Dinner at a Sushi Restaurant (8 paragraphs, 初級) |
| `/stories/03-kyoto-spring.json` | Story 3: A Spring Day in Kyoto (9 paragraphs, 初級) |
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
Landing page. Buttons: Start study → `setup`, Browse & read → `browse`, Read stories → `read` (only shown when stories loaded), Past sessions → `history`, Backup & restore → `data`. Shows deck chips (title + count).

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
Active study loop. Header shows progress (answered/total) and — on a second line below the counter — the direction label (e.g. "kanji + romaji → English"). This keeps the label out of the card face so the content is easier to read.

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

### `read`
Reading / stories screen. Two sub-views controlled by `state.readScreen.storyId`:
- **Story list**: cards for each story (title, Japanese title, level badge, paragraph count, description). Tap to open.
- **Story view**: flowing text with Japanese paragraphs. Each paragraph uses real Japanese grammar but English words inline for vocabulary the learner doesn't know yet (e.g., "私は sunscreen を買いました"). Tap any paragraph to toggle its English translation. Global "Show EN / Hide EN" button in topbar toggles all translations in-place (no re-render). Vocab chips below each paragraph highlight key words. Stories loaded from `/stories/index.json` + `/stories/*.json` — failure is non-fatal (returns empty array).

### `browse`
Read-only reference view of all cards. Persists filter state in `state.browse` within the tab.

**Filters:** Search box (matches any field, case-insensitive); deck filter chips (All + each deck).

**Item display:** Main glyph/word (large), other fields in a compact line, deck tag on the right. Collapsible note via `<details>`.

**Controls bar** (below deck chips): Left side has "Show notes / Hide notes" toggle (only visible in List mode when items have notes — toggles all `<details>` in-place without re-rendering). Right side has display mode switcher: List / Grid / Table.

**Display modes** (`state.browse.display`):
- **List** (default): compact rows, main glyph + other fields in one line, collapsible notes
- **Grid**: tile grid (`auto-fill`, min 74px cells), large glyph + subtitle below — ideal for kana charts
- **Table**: scrollable table, one column per field across all visible decks, no notes column

**Edit mode** (toggle "Edit" button in header): Replaces deck tag with weight nudge buttons (− / weight / +) in all three display modes. Changes persist immediately to IndexedDB without full re-render.

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
- Correct: `weight -= 12` (floors at MIN_WEIGHT=5 for auto-grading), streak++, interval grows SM-2 style
- Wrong: `weight += 12` (caps at 100), streak=0, interval resets to 0
- Manual tune (study screen): ±12 per click, **minimum 0** (card vanishes from rotation)
- Manual tune (browse edit mode): ±12 per click, **minimum 0** (card vanishes from rotation)
- Setting weight to 0 permanently excludes a card from study until manually raised again in Browse

---

## State shape (`app.js`)

```js
state = {
  decks: [],           // loaded deck objects
  stories: [],         // loaded story objects (from /stories/)
  screen: "home",      // current route
  config: null,        // study session config (persists within tab)
  run: null,           // active session runtime
  browse: {
    deckId: "all",     // active deck filter
    query: "",         // search string
    editMode: false,   // weight-edit mode
  },
  readScreen: {
    storyId: null,     // null = story list; string = individual story view
    allTr: false,      // global show/hide translations toggle
  },
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
- [x] Travel phrases: restaurant, directions, shopping, hotel, transport, emergencies (`phrases-travel.json`)
- [x] Practical daily phrases: sunscreen, umbrella, trash, reheat food, polite requests, allergy, photography, etc. (`phrases-practical.json`)
- [x] Grammar patterns N5 (`grammar-n5.json`)
- [x] Grammar patterns N4 — 22 items (`grammar-n4.json`)
- [x] Grammar patterns N3 — 15 items (`grammar-n3.json`)
- [x] Self-introduction sentences, personalised for Nicolas (`self-intro.json`)
- [x] Reading stories: 3 bilingual stories mixing Japanese grammar with English words for unknown vocabulary (`/stories/`)
- [x] Time & calendar: days of week (planet etymology), months (cultural events + irregular readings), seasons, time expressions
- [x] Weather & seasons: 4 seasons + rainy season, weather vocabulary, temperature adjectives with key 暑い/熱い and 寒い/冷たい distinctions
- [ ] More travel phrases: numbers/prices, onsen, temples

### UI / mode additions
- [x] "Read stories" screen: story list + individual story view; tap paragraphs to toggle translation; global Show/Hide EN button
- [ ] Sentence context for vocab items (click a word → see it in a sentence)

### Technical
- [ ] `words-common.json` not in `data/index.json` — decide to merge with words-n5 or drop

---

## How to add a new deck

1. Create `/data/my-deck.json` following the deck format above
2. Add `"my-deck.json"` to the `decks` array in `/data/index.json`
3. Reload — no code changes needed

The deck will appear in setup, browse, and history automatically.
