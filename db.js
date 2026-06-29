// db.js — durable on-device storage (IndexedDB).
// Two stores:
//   memory   — one record per card, keyed "deckId:i". Holds BOTH the manual
//              weight AND the spaced-repetition fields, so the sampling engine
//              can be swapped later with no migration.
//   sessions — one record per completed study session (history).

const DB_NAME = "jp-flashcards";
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("memory")) {
        db.createObjectStore("memory", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Default memory record: neutral weight + standard SM-2 starting values.
export function defaultMemory(deckId, i) {
  const now = Date.now();
  return {
    key: `${deckId}:${i}`,
    deckId,
    i,
    weight: 50, // manual layer, 0..100 (drives v1 sampling)
    ease: 2.5, // SRS layer (SM-2 ease factor)
    intervalDays: 0, // SRS interval
    dueAt: now, // SRS next-due timestamp
    lastSeen: null,
    streak: 0, // consecutive correct
    seen: 0,
    correct: 0,
    createdAt: now,
  };
}

export const Memory = {
  async get(deckId, i) {
    return tx("memory", "readonly", (s) =>
      reqAsPromise(s.get(`${deckId}:${i}`))
    );
  },
  async put(record) {
    return tx("memory", "readwrite", (s) => reqAsPromise(s.put(record)));
  },
  async getAll() {
    return tx("memory", "readonly", (s) => reqAsPromise(s.getAll()));
  },
  // Ensure a record exists for every (deckId, i); create defaults for new cards.
  async ensureForDeck(deck) {
    const existing = await this.getAll();
    const have = new Set(existing.map((r) => r.key));
    const toAdd = [];
    for (const item of deck.items) {
      const key = `${deck.id}:${item.i}`;
      if (!have.has(key)) toAdd.push(defaultMemory(deck.id, item.i));
    }
    if (toAdd.length) {
      await tx("memory", "readwrite", (s) => {
        toAdd.forEach((r) => s.put(r));
      });
    }
    return toAdd.length;
  },
  async clear() {
    return tx("memory", "readwrite", (s) => reqAsPromise(s.clear()));
  },
};

export const Sessions = {
  async add(session) {
    return tx("sessions", "readwrite", (s) => reqAsPromise(s.put(session)));
  },
  async getAll() {
    const all = await tx("sessions", "readonly", (s) =>
      reqAsPromise(s.getAll())
    );
    return all.sort((a, b) => b.startedAt - a.startedAt);
  },
  async clear() {
    return tx("sessions", "readwrite", (s) => reqAsPromise(s.clear()));
  },
};

// Export / import — the cross-device transfer mechanism (no cloud needed).
export async function exportAll() {
  const [memory, sessions] = await Promise.all([
    Memory.getAll(),
    Sessions.getAll(),
  ]);
  return {
    app: "jp-flashcards",
    version: 1,
    exportedAt: new Date().toISOString(),
    memory,
    sessions,
  };
}

export async function importAll(data, { merge = true } = {}) {
  if (!data || data.app !== "jp-flashcards") {
    throw new Error("This file is not a Japanese Flashcards backup.");
  }
  if (!merge) {
    await Memory.clear();
    await Sessions.clear();
  }
  await tx("memory", "readwrite", (s) => {
    (data.memory || []).forEach((r) => {
      if (merge) {
        // keep whichever record was seen most recently
        const incoming = r;
        s.get(r.key).onsuccess = (e) => {
          const cur = e.target.result;
          if (!cur || (incoming.lastSeen || 0) >= (cur.lastSeen || 0)) {
            s.put(incoming);
          }
        };
      } else {
        s.put(r);
      }
    });
  });
  await tx("sessions", "readwrite", (s) => {
    (data.sessions || []).forEach((r) => s.put(r));
  });
}
