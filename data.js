// data.js — discovers and loads decks from /data.
// The manifest (/data/index.json) lists deck filenames. To add cards, drop a
// new JSON file in /data and add its filename to the manifest.

export async function loadDecks() {
  const manifest = await fetchJSON("./data/index.json");
  const files = manifest.decks || [];
  const decks = [];
  for (const file of files) {
    try {
      const deck = await fetchJSON(`./data/${file}`);
      validateDeck(deck, file);
      decks.push(deck);
    } catch (err) {
      console.error(`Could not load deck "${file}":`, err);
    }
  }
  return decks;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function validateDeck(deck, file) {
  if (!deck.id) throw new Error(`${file}: missing "id"`);
  if (!Array.isArray(deck.fields) || deck.fields.length < 2)
    throw new Error(`${file}: needs at least two "fields"`);
  if (!Array.isArray(deck.items) || deck.items.length === 0)
    throw new Error(`${file}: "items" is empty`);
}

export async function loadStories() {
  try {
    const manifest = await fetchJSON("./stories/index.json");
    const files = manifest.stories || [];
    const stories = [];
    for (const file of files) {
      try {
        stories.push(await fetchJSON(`./stories/${file}`));
      } catch (e) {
        console.error(`Story load error "${file}":`, e);
      }
    }
    return stories;
  } catch {
    return [];
  }
}

// Is this field a Japanese script field (answered by tapping, not typing)?
export function isScriptField(field) {
  return field === "char" || field === "script" || field === "kana";
}

// Read a field off an item as an array of accepted answers (lowercased).
export function answersFor(item, field) {
  const v = item[field];
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x));
}
