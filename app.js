// app.js — UI, study loop, sampling engine, grading, session tracking.

import { loadDecks, isScriptField, answersFor } from "./data.js";
import {
  Memory,
  Sessions,
  defaultMemory,
  exportAll,
  importAll,
} from "./db.js";

const NUDGE = 12; // how hard a single answer moves the manual weight
const MIN_WEIGHT = 5; // never let a card vanish entirely
const MAX_WEIGHT = 100;

const app = document.getElementById("app");
const state = {
  decks: [],
  screen: "home",
  config: null,
  run: null, // active session runtime
  browse: { deckId: "all", query: "", editMode: false, display: "list", allNotesOpen: false },
};

// ---------- boot ----------
init();

async function init() {
  try {
    state.decks = await loadDecks();
    for (const d of state.decks) await Memory.ensureForDeck(d);
  } catch (err) {
    app.innerHTML = errorView(
      "Couldn't load your decks",
      "Check that /data/index.json exists and lists your deck files. " +
        escapeHtml(String(err))
    );
    return;
  }
  if (!state.decks.length) {
    app.innerHTML = errorView(
      "No decks yet",
      "Add a deck file to /data and list it in /data/index.json."
    );
    return;
  }
  render();
}

// ---------- router ----------
function render() {
  if (state.screen === "home") return renderHome();
  if (state.screen === "setup") return renderSetup();
  if (state.screen === "study") return renderStudy();
  if (state.screen === "summary") return renderSummary();
  if (state.screen === "history") return renderHistory();
  if (state.screen === "data") return renderData();
  if (state.screen === "browse") return renderBrowse();
}

function go(screen) {
  state.screen = screen;
  window.scrollTo(0, 0);
  render();
}

// ---------- home ----------
function renderHome() {
  app.innerHTML = `
    <header class="topbar">
      <div class="seal" aria-hidden="true">学</div>
      <h1>Japanese Flashcards</h1>
    </header>
    <main class="stack">
      <p class="lede">Pick what to study, set how often each set shows up, and go.
        Everything runs offline once loaded.</p>
      <button class="btn primary big" data-go="setup">Start study</button>
      <button class="btn big" data-go="browse">Browse &amp; read</button>
      <div class="deck-summary">
        ${state.decks
          .map(
            (d) =>
              `<div class="deck-chip"><span class="deck-chip-title">${escapeHtml(
                d.title
              )}</span><span class="deck-chip-count">${d.items.length}</span></div>`
          )
          .join("")}
      </div>
      <nav class="row">
        <button class="btn ghost" data-go="history">Past sessions</button>
        <button class="btn ghost" data-go="data">Backup &amp; restore</button>
      </nav>
    </main>`;
  wireGo();
}

// ---------- setup ----------
function renderSetup() {
  if (!state.config) state.config = defaultConfig();
  const c = state.config;
  const commonFields = intersectFields(
    state.decks.filter((d) => c.decks[d.id].enabled)
  );
  ensureDirectionValid(c, commonFields);

  app.innerHTML = `
    <header class="topbar">
      <button class="btn ghost back" data-go="home">‹ Back</button>
      <h1>New study</h1>
    </header>
    <main class="stack">
      <section class="panel">
        <h2>Decks &amp; range</h2>
        <p class="hint">Turn a deck on, choose its range of cards, and set how
          often it appears (0 = never, 100 = often).</p>
        ${state.decks.map(deckRow).join("")}
      </section>

      <section class="panel">
        <h2>Direction</h2>
        <p class="hint">Select one or more fields to show, and one or more to answer with.</p>
        <div class="dir-group">
          <span class="dir-label">Show</span>
          <div class="dir-picks">
            ${commonFields.map(f => `
              <button class="seg-btn dir-pick ${c.front.includes(f) ? 'on' : ''}"
                      data-field="${f}" data-side="front">${fieldName(f)}</button>
            `).join('')}
          </div>
        </div>
        <div class="dir-group">
          <span class="dir-label">Answer</span>
          <div class="dir-picks">
            ${commonFields.map(f => `
              <button class="seg-btn dir-pick ${c.back.includes(f) ? 'on' : ''}"
                      data-field="${f}" data-side="back">${fieldName(f)}</button>
            `).join('')}
          </div>
        </div>
        <label class="check" style="margin-top:10px">
          <input type="checkbox" id="mixed" ${c.mixed ? "checked" : ""}>
          <span>Swap direction randomly each card</span>
        </label>
      </section>

      <section class="panel">
        <h2>Mode</h2>
        <div class="seg">
          <button class="seg-btn ${c.mode === "quick" ? "on" : ""}" data-mode="quick">
            Quick<small>self-graded, two buttons</small>
          </button>
          <button class="seg-btn ${c.mode === "explicit" ? "on" : ""}" data-mode="explicit">
            Write it<small>type or tap the answer</small>
          </button>
        </div>
      </section>

      <section class="panel">
        <h2>Length</h2>
        <div class="seg">
          ${[10, 20, 40]
            .map(
              (n) =>
                `<button class="seg-btn ${
                  c.length === n ? "on" : ""
                }" data-len="${n}">${n}</button>`
            )
            .join("")}
          <button class="seg-btn ${
            c.length === 0 ? "on" : ""
          }" data-len="0">Endless</button>
        </div>
      </section>

      <button class="btn primary big" id="begin">Begin</button>
    </main>`;

  wireGo();
  wireSetup(commonFields);
}

function deckRow(d) {
  const dc = state.config.decks[d.id];
  const max = d.items.length;
  return `
    <div class="deck-row ${dc.enabled ? "" : "off"}" data-deck="${d.id}">
      <label class="check head">
        <input type="checkbox" class="deck-on" ${dc.enabled ? "checked" : ""}>
        <span class="deck-name">${escapeHtml(d.title)}</span>
        <span class="deck-tag">${max} cards</span>
      </label>
      <div class="deck-controls">
        <div class="field inline">
          <label>From</label>
          <input type="number" class="num from" min="1" max="${max}" value="${dc.min}">
          <label>to</label>
          <input type="number" class="num to" min="1" max="${max}" value="${dc.max}">
        </div>
        <div class="field">
          <label>Frequency <output class="freq-out">${dc.freq}</output></label>
          <input type="range" class="freq" min="0" max="100" value="${dc.freq}">
        </div>
      </div>
    </div>`;
}

function wireSetup(commonFields) {
  const c = state.config;

  app.querySelectorAll(".deck-row").forEach((row) => {
    const id = row.dataset.deck;
    const dc = c.decks[id];
    const deck = state.decks.find((d) => d.id === id);
    const max = deck.items.length;

    row.querySelector(".deck-on").addEventListener("change", (e) => {
      dc.enabled = e.target.checked;
      renderSetup();
    });
    row.querySelector(".from").addEventListener("change", (e) => {
      dc.min = clampInt(e.target.value, 1, max);
      if (dc.min > dc.max) dc.max = dc.min;
      renderSetup();
    });
    row.querySelector(".to").addEventListener("change", (e) => {
      dc.max = clampInt(e.target.value, 1, max);
      if (dc.max < dc.min) dc.min = dc.max;
      renderSetup();
    });
    const freq = row.querySelector(".freq");
    const out = row.querySelector(".freq-out");
    freq.addEventListener("input", (e) => {
      dc.freq = Number(e.target.value);
      out.textContent = dc.freq;
    });
  });

  // Direction toggles: each button adds/removes its field from front[] or back[]
  app.querySelectorAll(".dir-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const side = btn.dataset.side; // "front" or "back"
      const arr = c[side];
      const idx = arr.indexOf(field);
      if (idx === -1) {
        arr.push(field);
      } else if (arr.length > 1) {
        arr.splice(idx, 1);
      }
      ensureDirectionValid(c, commonFields);
      renderSetup();
    });
  });

  const mixed = app.querySelector("#mixed");
  if (mixed) mixed.addEventListener("change", (e) => (c.mixed = e.target.checked));

  app.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      c.mode = b.dataset.mode;
      renderSetup();
    })
  );
  app.querySelectorAll("[data-len]").forEach((b) =>
    b.addEventListener("click", () => {
      c.length = Number(b.dataset.len);
      renderSetup();
    })
  );

  app.querySelector("#begin").addEventListener("click", startSession);
}

// ---------- session lifecycle ----------
function startSession() {
  const c = state.config;
  const pool = buildPool(c);
  if (!pool.length) {
    alert(
      "Nothing to study with these settings. Turn on a deck, widen a range, or raise a frequency above 0."
    );
    return;
  }
  state.run = {
    pool,
    config: deepClone(c),
    startedAt: Date.now(),
    answered: 0,
    correct: 0,
    perDeck: {},
    lastKey: null,
    card: null,
    phase: "prompt",
  };
  nextCard();
  go("study");
}

function buildPool(c) {
  const pool = [];
  for (const deck of state.decks) {
    const dc = c.decks[deck.id];
    if (!dc.enabled || dc.freq <= 0) continue;
    for (const item of deck.items) {
      if (item.i < dc.min || item.i > dc.max) continue;
      pool.push({ deck, item, deckFreq: dc.freq });
    }
  }
  return pool;
}

async function nextCard() {
  const run = state.run;
  const entries = [];
  let total = 0;
  for (const p of run.pool) {
    const mem =
      (await Memory.get(p.deck.id, p.item.i)) ||
      defaultMemory(p.deck.id, p.item.i);
    let w = (p.deckFreq / 100) * (mem.weight / 100);
    const key = `${p.deck.id}:${p.item.i}`;
    if (key === run.lastKey && run.pool.length > 1) w *= 0.15;
    if (w > 0) {
      entries.push({ ...p, mem, key, w });
      total += w;
    }
  }
  if (!entries.length) {
    endSession();
    return;
  }
  let r = Math.random() * total;
  let chosen = entries[entries.length - 1];
  for (const e of entries) {
    if (r < e.w) {
      chosen = e;
      break;
    }
    r -= e.w;
  }

  // Resolve multi-field direction for this deck: filter to fields that exist here
  const c = run.config;
  let fronts = c.front.filter((f) => chosen.deck.fields.includes(f));
  if (!fronts.length) fronts = [chosen.deck.prompt || chosen.deck.fields[0]];
  let backs = c.back.filter((f) => chosen.deck.fields.includes(f));
  if (!backs.length) backs = [chosen.deck.answer || chosen.deck.fields[1]];

  if (c.mixed && Math.random() < 0.5) [fronts, backs] = [backs, fronts];

  run.card = { ...chosen, front: fronts, back: backs };
  run.phase = "prompt";
  renderStudy();
}

async function grade(correct) {
  const run = state.run;
  const card = run.card;
  if (!card || run.phase === "graded") return;

  const mem = card.mem;
  applyResult(mem, correct);
  await Memory.put(mem);

  run.answered += 1;
  if (correct) run.correct += 1;
  const ds = (run.perDeck[card.deck.id] = run.perDeck[card.deck.id] || {
    title: card.deck.title,
    answered: 0,
    correct: 0,
  });
  ds.answered += 1;
  if (correct) ds.correct += 1;

  run.lastKey = card.key;
  run.lastCorrect = correct;
  run.phase = "graded";
  renderStudy();
}

function applyResult(mem, correct) {
  const now = Date.now();
  mem.seen += 1;
  mem.lastSeen = now;
  if (correct) {
    mem.correct += 1;
    mem.streak += 1;
    mem.weight = clamp(mem.weight - NUDGE, MIN_WEIGHT, MAX_WEIGHT);
    if (mem.intervalDays === 0) mem.intervalDays = 1;
    else if (mem.intervalDays === 1) mem.intervalDays = 6;
    else mem.intervalDays = Math.round(mem.intervalDays * mem.ease);
    mem.ease = Math.min(3.0, mem.ease + 0.05);
  } else {
    mem.streak = 0;
    mem.weight = clamp(mem.weight + NUDGE, MIN_WEIGHT, MAX_WEIGHT);
    mem.intervalDays = 0;
    mem.ease = Math.max(1.3, mem.ease - 0.2);
  }
  mem.dueAt = now + mem.intervalDays * 86400000;
}

async function nudge(dir) {
  const run = state.run;
  if (!run.card) return;
  const mem = run.card.mem;
  mem.weight = clamp(mem.weight + dir * NUDGE, MIN_WEIGHT, MAX_WEIGHT);
  await Memory.put(mem);
  const out = app.querySelector(".weight-out");
  if (out) out.textContent = mem.weight;
}

async function endSession() {
  const run = state.run;
  if (run && run.answered > 0) {
    await Sessions.add({
      id: `s_${run.startedAt}`,
      startedAt: run.startedAt,
      endedAt: Date.now(),
      answered: run.answered,
      correct: run.correct,
      perDeck: run.perDeck,
      config: run.config,
    });
  }
  go("summary");
}

// ---------- study screen ----------
function renderStudy() {
  const run = state.run;
  const card = run.card;
  if (!card) return;

  const target = run.config.length;
  const progress =
    target > 0 ? `${run.answered}/${target}` : `${run.answered}`;

  let body = "";
  if (run.phase === "prompt") {
    body = promptBody(run, card);
  } else if (run.phase === "graded") {
    body = feedbackBody(run, card);
  }

  app.innerHTML = `
    <header class="topbar study">
      <button class="btn ghost back" id="quit">End</button>
      <div class="progress"><span>${progress}</span></div>
      <div class="score">${run.correct}<span>○</span></div>
    </header>
    <main class="study-stage">${body}</main>`;

  app.querySelector("#quit").addEventListener("click", endSession);
  if (run.phase === "prompt") wirePrompt(run, card);
  else wireFeedback();
}

function promptBody(run, card) {
  const mode = run.config.mode;
  const frontHtml = renderFieldsHtml(card.item, card.front, "prompt");
  const primaryBack = card.back[0];

  if (mode === "quick") {
    return `
      <div class="card">
        ${frontHtml}
        <div class="dir">${dirLabel(card)}</div>
      </div>
      <div class="actions" id="quick-reveal">
        <button class="btn primary big" id="reveal">Show answer</button>
      </div>`;
  }

  // explicit mode — only back[0] drives the input
  if (isScriptField(primaryBack)) {
    const opts = choiceOptions(card);
    return `
      <div class="card">
        ${frontHtml}
        <div class="dir">${dirLabel(card)}</div>
      </div>
      <div class="choices">
        ${opts
          .map(
            (o) =>
              `<button class="choice" data-val="${escapeAttr(o)}">${escapeHtml(o)}</button>`
          )
          .join("")}
      </div>`;
  }

  return `
    <div class="card">
      ${frontHtml}
      <div class="dir">${dirLabel(card)}</div>
    </div>
    <div class="answer-input">
      <input type="text" id="typed" autocapitalize="off" autocomplete="off"
        autocorrect="off" spellcheck="false" placeholder="Type ${escapeAttr(fieldName(primaryBack))}…" />
      <button class="btn primary" id="check">Check</button>
    </div>`;
}

function feedbackBody(run, card) {
  const ok = run.lastCorrect;
  const mark = ok ? "○" : "×";
  const frontHtml = renderFieldsHtml(card.item, card.front, "prompt");
  const backHtml = renderFieldsHtml(card.item, card.back, "answer");
  const noteHtml = card.item.note
    ? `<div class="card-note">${escapeHtml(card.item.note)}</div>`
    : "";
  return `
    <div class="card ${ok ? "right" : "wrong"}">
      <div class="mark ${ok ? "maru" : "batsu"}">${mark}</div>
      ${frontHtml}
      ${backHtml}
      ${
        card.typed != null && !ok
          ? `<div class="your">you wrote: ${escapeHtml(card.typed || "—")}</div>`
          : ""
      }
      ${noteHtml}
    </div>
    <div class="tune">
      <span>appears</span>
      <button class="tune-btn" data-nudge="-1">less ↓</button>
      <output class="weight-out">${card.mem.weight}</output>
      <button class="tune-btn" data-nudge="1">more ↑</button>
    </div>
    <div class="actions">
      <button class="btn primary big" id="next">Next ›</button>
    </div>`;
}

// Render multiple fields stacked in a card.
// mode: "prompt" (shown side) or "answer" (revealed side)
// First field gets the primary size; subsequent ones get .sub (smaller).
function renderFieldsHtml(item, fields, mode) {
  return fields.map((f, idx) => {
    const text = displayField(item, f);
    const cls = promptClass(f);
    const sub = idx > 0 ? " sub" : "";
    if (mode === "answer") {
      return `<div class="reveal-answer ${cls}${sub}">${escapeHtml(text)}</div>`;
    }
    return `<div class="prompt ${cls}${sub}">${escapeHtml(text)}</div>`;
  }).join("");
}

function wirePrompt(run, card) {
  const mode = run.config.mode;
  const primaryBack = card.back[0];

  if (mode === "quick") {
    app.querySelector("#reveal").addEventListener("click", () => {
      const backHtml = renderFieldsHtml(card.item, card.back, "answer");
      const noteHtml = card.item.note
        ? `<div class="card-note">${escapeHtml(card.item.note)}</div>`
        : "";
      app.querySelector(".card").insertAdjacentHTML("beforeend", backHtml + noteHtml);
      app.querySelector("#quick-reveal").innerHTML = `
        <button class="btn knew" data-grade="1">I knew it ○</button>
        <button class="btn missed" data-grade="0">I didn't ×</button>`;
      app
        .querySelectorAll("[data-grade]")
        .forEach((b) =>
          b.addEventListener("click", () => grade(b.dataset.grade === "1"))
        );
    });
    return;
  }

  if (isScriptField(primaryBack)) {
    app.querySelectorAll(".choice").forEach((b) =>
      b.addEventListener("click", () => {
        const picked = b.dataset.val;
        const correct = answersFor(card.item, primaryBack).includes(picked);
        card.typed = picked;
        if (!correct) b.classList.add("bad");
        grade(correct);
      })
    );
    return;
  }

  const input = app.querySelector("#typed");
  const submit = () => {
    const val = normalize(input.value);
    const accepted = answersFor(card.item, primaryBack).map(normalize);
    card.typed = input.value.trim();
    grade(accepted.includes(val) && val !== "");
  };
  app.querySelector("#check").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  setTimeout(() => input.focus(), 30);
}

function wireFeedback() {
  app.querySelectorAll("[data-nudge]").forEach((b) =>
    b.addEventListener("click", () => nudge(Number(b.dataset.nudge)))
  );
  const next = app.querySelector("#next");
  const advance = () => {
    const run = state.run;
    if (run.config.length > 0 && run.answered >= run.config.length) {
      endSession();
    } else {
      nextCard();
    }
  };
  next.addEventListener("click", advance);
}

// ---------- summary ----------
function renderSummary() {
  const run = state.run;
  const answered = run ? run.answered : 0;
  const correct = run ? run.correct : 0;
  const pct = answered ? Math.round((correct / answered) * 100) : 0;
  const perDeck = run ? Object.values(run.perDeck) : [];

  app.innerHTML = `
    <header class="topbar"><h1>Session done</h1></header>
    <main class="stack center">
      <div class="result-seal">${pct}<small>%</small></div>
      <p class="lede">${correct} right out of ${answered}.</p>
      ${
        perDeck.length
          ? `<div class="panel"><h2>By deck</h2>${perDeck
              .map(
                (d) =>
                  `<div class="row between"><span>${escapeHtml(
                    d.title
                  )}</span><span>${d.correct}/${d.answered}</span></div>`
              )
              .join("")}</div>`
          : ""
      }
      <button class="btn primary big" data-go="setup">Study again</button>
      <button class="btn ghost" data-go="home">Home</button>
    </main>`;
  wireGo();
}

// ---------- history ----------
async function renderHistory() {
  const sessions = await Sessions.getAll();
  app.innerHTML = `
    <header class="topbar">
      <button class="btn ghost back" data-go="home">‹ Back</button>
      <h1>Past sessions</h1>
    </header>
    <main class="stack">
      ${
        sessions.length
          ? sessions.map(sessionRow).join("")
          : `<p class="lede">No sessions yet. Your finished studies will show up here.</p>`
      }
    </main>`;
  wireGo();
}

function sessionRow(s) {
  const pct = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
  const when = new Date(s.startedAt).toLocaleString();
  const decks = Object.values(s.perDeck || {})
    .map((d) => escapeHtml(d.title))
    .join(", ");
  return `<div class="panel session">
    <div class="row between"><strong>${pct}%</strong><span class="muted">${when}</span></div>
    <div class="muted">${s.correct}/${s.answered} · ${decks || "—"}</div>
  </div>`;
}

// ---------- data / backup ----------
function renderData() {
  app.innerHTML = `
    <header class="topbar">
      <button class="btn ghost back" data-go="home">‹ Back</button>
      <h1>Backup &amp; restore</h1>
    </header>
    <main class="stack">
      <p class="lede">Your progress lives on this device. To move it to another
        device, export here and import the file there.</p>
      <section class="panel">
        <h2>Export</h2>
        <p class="hint">Saves a JSON file with all your weights and session history.</p>
        <button class="btn primary" id="export">Export progress</button>
      </section>
      <section class="panel">
        <h2>Import</h2>
        <p class="hint">Merge a backup into this device (most recent review wins).</p>
        <input type="file" id="importFile" accept="application/json,.json" />
      </section>
      <section class="panel danger">
        <h2>Reset</h2>
        <p class="hint">Erase all progress on this device. Cannot be undone.</p>
        <button class="btn missed" id="reset">Erase progress</button>
      </section>
    </main>`;
  wireGo();

  app.querySelector("#export").addEventListener("click", async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `jp-flashcards-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  app.querySelector("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await importAll(data, { merge: true });
      for (const d of state.decks) await Memory.ensureForDeck(d);
      alert("Progress imported.");
    } catch (err) {
      alert("Couldn't import that file. " + err.message);
    }
    e.target.value = "";
  });

  app.querySelector("#reset").addEventListener("click", async () => {
    if (!confirm("Erase all progress on this device?")) return;
    await Memory.clear();
    await Sessions.clear();
    for (const d of state.decks) await Memory.ensureForDeck(d);
    alert("Progress erased.");
  });
}

// ---------- browse & read ----------
async function renderBrowse() {
  const b = state.browse;

  // Load all memory in one round-trip
  const allMem = await Memory.getAll();
  const memMap = {};
  for (const r of allMem) memMap[r.key] = r;

  // Build flat list of all items across all decks
  const allItems = [];
  for (const deck of state.decks) {
    for (const item of deck.items) {
      const key = `${deck.id}:${item.i}`;
      allItems.push({ deck, item, mem: memMap[key] || defaultMemory(deck.id, item.i) });
    }
  }

  // Apply deck + search filters
  const query = b.query.toLowerCase().trim();
  const filtered = allItems.filter(({ deck, item }) => {
    if (b.deckId !== "all" && deck.id !== b.deckId) return false;
    if (!query) return true;
    return deck.fields.some((f) => {
      const v = item[f];
      if (v == null) return false;
      const s = Array.isArray(v) ? v.join(" ") : String(v);
      return s.toLowerCase().includes(query);
    });
  });

  const deckChips = [{ id: "all", title: "All" }, ...state.decks]
    .map(
      (d) =>
        `<button class="chip ${b.deckId === d.id ? "on" : ""}" data-deck-filter="${d.id}">${escapeHtml(d.title)}</button>`
    )
    .join("");

  const hasNotes = b.display === "list" && filtered.some((e) => e.item.note);
  const notesLabel = b.allNotesOpen ? "Hide notes" : "Show notes";
  const displayModes = ["list", "grid", "table"];
  const displayIcons = { list: "≡ List", grid: "⊞ Grid", table: "⊟ Table" };

  let contentHtml;
  if (b.display === "grid") contentHtml = browseGridHtml(filtered, b.editMode);
  else if (b.display === "table") contentHtml = browseTableHtml(filtered, b.editMode);
  else contentHtml = `<div class="browse-list">${filtered.map((e) => browseItemHtml(e, b.editMode, b.allNotesOpen)).join("")}</div>`;

  app.innerHTML = `
    <header class="topbar">
      <button class="btn ghost back" data-go="home">‹ Back</button>
      <h1>Browse &amp; read</h1>
      <button class="btn ghost${b.editMode ? " edit-active" : ""}" id="toggle-edit">${b.editMode ? "Done" : "Edit"}</button>
    </header>
    <main class="stack">
      <div class="browse-filters">
        <input type="search" id="browse-search" class="browse-search"
          placeholder="Search…" value="${escapeAttr(b.query)}" />
        <div class="chip-row">${deckChips}</div>
        <div class="browse-controls">
          <div class="browse-controls-left">
            ${hasNotes ? `<button class="chip${b.allNotesOpen ? " on" : ""}" id="toggle-notes">${notesLabel}</button>` : ""}
          </div>
          <div class="browse-controls-right">
            ${displayModes.map((m) => `<button class="chip${b.display === m ? " on" : ""}" data-display="${m}">${displayIcons[m]}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="browse-count">${filtered.length} item${filtered.length !== 1 ? "s" : ""}</div>
      ${contentHtml}
    </main>`;

  wireGo();
  wireBrowse();
}

function browseItemHtml({ deck, item, mem }, editMode, allNotesOpen = false) {
  const fields = deck.fields;
  const mainField = deck.prompt || fields[0];
  const mainVal = displayField(item, mainField);
  const mainCls = promptClass(mainField);

  // All other fields joined as a readable line
  const restParts = fields
    .filter((f) => f !== mainField)
    .map((f) => displayField(item, f))
    .filter(Boolean);
  const restHtml = restParts.length
    ? `<span class="browse-rest">${escapeHtml(restParts.join("  ·  "))}</span>`
    : "";

  const noteHtml = item.note
    ? `<details class="browse-note"${allNotesOpen ? " open" : ""}><summary>Note</summary><span>${escapeHtml(item.note)}</span></details>`
    : "";

  const sideHtml = editMode
    ? `<div class="browse-weight">
        <button class="tune-btn" data-item-key="${deck.id}:${item.i}" data-nudge="-1">−</button>
        <span class="weight-badge" data-key="${deck.id}:${item.i}">${mem.weight}</span>
        <button class="tune-btn" data-item-key="${deck.id}:${item.i}" data-nudge="1">+</button>
      </div>`
    : `<span class="browse-deck-tag">${escapeHtml(deck.title)}</span>`;

  return `
    <div class="browse-item">
      <div class="browse-main">
        <span class="browse-glyph ${mainCls}">${escapeHtml(mainVal)}</span>
        <div class="browse-info">${restHtml}</div>
        ${sideHtml}
      </div>
      ${noteHtml}
    </div>`;
}

function wireBrowse() {
  const b = state.browse;

  app.querySelector("#browse-search").addEventListener("input", async (e) => {
    b.query = e.target.value;
    await renderBrowse();
    // Re-focus the search input after re-render and restore cursor to end
    const s = app.querySelector("#browse-search");
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  });

  app.querySelectorAll("[data-deck-filter]").forEach((chip) =>
    chip.addEventListener("click", () => {
      b.deckId = chip.dataset.deckFilter;
      renderBrowse();
    })
  );

  app.querySelectorAll("[data-display]").forEach((btn) =>
    btn.addEventListener("click", () => {
      b.display = btn.dataset.display;
      renderBrowse();
    })
  );

  const notesBtn = app.querySelector("#toggle-notes");
  if (notesBtn) {
    notesBtn.addEventListener("click", () => {
      b.allNotesOpen = !b.allNotesOpen;
      // Toggle in-place without full re-render
      app.querySelectorAll(".browse-note").forEach((d) => {
        if (b.allNotesOpen) d.setAttribute("open", "");
        else d.removeAttribute("open");
      });
      notesBtn.textContent = b.allNotesOpen ? "Hide notes" : "Show notes";
      notesBtn.classList.toggle("on", b.allNotesOpen);
    });
  }

  app.querySelector("#toggle-edit").addEventListener("click", () => {
    b.editMode = !b.editMode;
    renderBrowse();
  });

  // Weight nudge in edit mode (update in place, no full re-render)
  app.querySelectorAll("[data-item-key][data-nudge]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.itemKey;
      const [deckId, iStr] = key.split(":");
      const i = Number(iStr);
      const mem = (await Memory.get(deckId, i)) || defaultMemory(deckId, i);
      mem.weight = clamp(mem.weight + Number(btn.dataset.nudge) * NUDGE, MIN_WEIGHT, MAX_WEIGHT);
      await Memory.put(mem);
      const badge = app.querySelector(`.weight-badge[data-key="${key}"]`);
      if (badge) badge.textContent = mem.weight;
    });
  });
}

// Grid view: large glyph tiles — best for kana
function browseGridHtml(filtered, editMode) {
  if (!filtered.length) return `<p class="lede">No items.</p>`;
  return `<div class="browse-grid">
    ${filtered.map(({ deck, item, mem }) => {
      const mainField = deck.prompt || deck.fields[0];
      const mainVal = displayField(item, mainField);
      const mainCls = promptClass(mainField);
      // Pick the best subtitle: romaji for kana decks, english for vocab
      const subField = deck.fields.find((f) => f !== mainField) || null;
      const subVal = subField ? displayField(item, subField) : "";
      const weightHtml = editMode
        ? `<div class="grid-weight">
            <button class="tune-btn" data-item-key="${deck.id}:${item.i}" data-nudge="-1">−</button>
            <span class="weight-badge" data-key="${deck.id}:${item.i}">${mem.weight}</span>
            <button class="tune-btn" data-item-key="${deck.id}:${item.i}" data-nudge="1">+</button>
          </div>`
        : "";
      return `<div class="browse-grid-cell">
        <span class="browse-glyph ${mainCls}">${escapeHtml(mainVal)}</span>
        ${subVal ? `<span class="browse-grid-sub">${escapeHtml(subVal)}</span>` : ""}
        ${weightHtml}
      </div>`;
    }).join("")}
  </div>`;
}

// Table view: all fields as columns — best for vocab reference
function browseTableHtml(filtered, editMode) {
  if (!filtered.length) return `<p class="lede">No items.</p>`;
  // Collect all unique fields from the visible items (preserve first-seen order)
  const fieldOrder = [];
  const fieldSeen = new Set();
  for (const { deck } of filtered) {
    for (const f of deck.fields) {
      if (!fieldSeen.has(f)) { fieldSeen.add(f); fieldOrder.push(f); }
    }
  }
  const weightCol = editMode ? `<th>Weight</th>` : "";
  return `<div class="browse-table-wrap">
    <table class="browse-table">
      <thead>
        <tr>${fieldOrder.map((f) => `<th>${escapeHtml(fieldName(f))}</th>`).join("")}${weightCol}</tr>
      </thead>
      <tbody>
        ${filtered.map(({ deck, item, mem }) => {
          const cells = fieldOrder.map((f) => {
            const v = displayField(item, f);
            return `<td class="tc-${promptClass(f)}">${escapeHtml(v)}</td>`;
          }).join("");
          const weightCell = editMode
            ? `<td class="tc-weight">
                <button class="tune-btn" data-item-key="${deck.id}:${item.i}" data-nudge="-1">−</button>
                <span class="weight-badge" data-key="${deck.id}:${item.i}">${mem.weight}</span>
                <button class="tune-btn" data-item-key="${deck.id}:${item.i}" data-nudge="1">+</button>
              </td>`
            : "";
          return `<tr>${cells}${weightCell}</tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`;
}

// ---------- helpers ----------
function defaultConfig() {
  const decks = {};
  state.decks.forEach((d, idx) => {
    decks[d.id] = {
      enabled: idx === 0,
      min: 1,
      max: d.items.length,
      freq: 60,
    };
  });
  const first = state.decks[0];
  return {
    decks,
    front: [first.prompt || first.fields[0]],
    back: [first.answer || first.fields[1]],
    mixed: false,
    mode: "quick",
    length: 20,
  };
}

function intersectFields(decks) {
  if (!decks.length) return state.decks[0] ? state.decks[0].fields.slice() : [];
  let common = decks[0].fields.slice();
  for (const d of decks.slice(1)) {
    common = common.filter((f) => d.fields.includes(f));
  }
  return common.length >= 2 ? common : decks[0].fields.slice();
}

function ensureDirectionValid(c, fields) {
  // Filter each side to only include fields available in the common set
  c.front = c.front.filter((f) => fields.includes(f));
  if (!c.front.length) c.front = [fields[0]];

  // Back must not duplicate all of front (keep fields not in front)
  c.back = c.back.filter((f) => fields.includes(f) && !c.front.includes(f));
  if (!c.back.length) {
    const remaining = fields.find((f) => !c.front.includes(f));
    c.back = [remaining || fields[0]];
  }
}

function choiceOptions(card) {
  const primaryBack = card.back[0];
  const correct = answersFor(card.item, primaryBack)[0];
  const others = card.deck.items
    .filter((it) => it.i !== card.item.i)
    .map((it) => answersFor(it, primaryBack)[0])
    .filter((v) => v && v !== correct);
  shuffle(others);
  const opts = [correct, ...others.slice(0, 3)];
  return shuffle(opts);
}

function displayField(item, field) {
  const v = item[field];
  if (v == null) return "";
  return Array.isArray(v) ? v.join(" / ") : String(v);
}

function promptClass(field) {
  if (isScriptField(field)) return "glyph";
  if (field === "english") return "en";
  return "word";
}

function dirLabel(card) {
  const f = card.front.map(fieldName).join(" + ");
  const b = card.back.map(fieldName).join(" + ");
  return `${f} → ${b}`;
}

function fieldName(f) {
  return { char: "character", script: "kanji", kana: "kana", romaji: "romaji", english: "English" }[f] || f;
}

function normalize(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, "");
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function clampInt(v, lo, hi) {
  const n = parseInt(v, 10);
  return isNaN(n) ? lo : clamp(n, lo, hi);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}
function wireGo() {
  app.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.go))
  );
}
function errorView(title, msg) {
  return `<header class="topbar"><h1>${escapeHtml(title)}</h1></header><main class="stack"><p class="lede">${msg}</p></main>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
