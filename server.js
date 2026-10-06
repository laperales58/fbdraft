const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const root = __dirname;
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5173);
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const statePath = path.join(dataDir, "draft-state.json");
const historyPath = path.join(dataDir, "draft-history.json");
const HISTORY_LIMIT = 300;
const HISTORY_MERGE_MS = 2 * 60 * 1000;
const backupDir = path.join(dataDir, "backups");
const usePostgres = Boolean(process.env.DATABASE_URL);
const postgresStateId = process.env.DRAFT_STATE_ID || "main";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const defaultState = {
  version: 0,
  state: null,
  updatedAt: null,
};

let writeQueue = Promise.resolve();
let pgPool;
let pgReady;

async function ensureDataDir() {
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(backupDir, { recursive: true });
}

async function readFileStore() {
  await ensureDataDir();
  try {
    return JSON.parse(await fsp.readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Failed to read state file:", error);
    return { ...defaultState };
  }
}

async function writeFileStore(store) {
  await ensureDataDir();
  const content = JSON.stringify(store, null, 2);
  const tempPath = statePath + ".tmp";
  await fsp.writeFile(tempPath, content);
  await fsp.rename(tempPath, statePath);

  if (store.state) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fsp.writeFile(path.join(backupDir, `draft-state-v${store.version}-${stamp}.json`), content);
  }
}

function getPgPool() {
  if (pgPool) return pgPool;

  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    throw new Error("DATABASE_URL is set, but the pg package is not installed. Run npm install.");
  }

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  return pgPool;
}

async function ensurePostgresStore() {
  if (!pgReady) pgReady = setupPostgresStore().catch((error) => { pgReady = null; throw error; });
  return pgReady;
}

async function setupPostgresStore() {
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS draft_state_history (
      id bigserial PRIMARY KEY,
      state_id text NOT NULL,
      version integer NOT NULL,
      label text,
      state jsonb,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS draft_state_history_state_idx ON draft_state_history (state_id, id DESC)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS draft_state (
      id text PRIMARY KEY,
      version integer NOT NULL DEFAULT 0,
      state jsonb,
      updated_at timestamptz
    )
  `);
  await pool.query(
    `
      INSERT INTO draft_state (id, version, state, updated_at)
      VALUES ($1, 0, NULL, NULL)
      ON CONFLICT (id) DO NOTHING
    `,
    [postgresStateId]
  );
}

function normalizeStoreRow(row) {
  return {
    version: row?.version ?? 0,
    state: row?.state ?? null,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function readPostgresStore() {
  await ensurePostgresStore();
  const result = await getPgPool().query(
    "SELECT version, state, updated_at FROM draft_state WHERE id = $1",
    [postgresStateId]
  );
  return normalizeStoreRow(result.rows[0]);
}

async function savePostgresStoreIfCurrent(expectedVersion, nextState) {
  await ensurePostgresStore();
  const result = await getPgPool().query(
    `
      UPDATE draft_state
      SET version = version + 1,
          state = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1 AND version = $3
      RETURNING version, state, updated_at
    `,
    [postgresStateId, JSON.stringify(nextState), expectedVersion]
  );

  if (result.rows[0]) {
    return { ok: true, store: normalizeStoreRow(result.rows[0]) };
  }

  return { ok: false, store: await readPostgresStore() };
}

async function readStore() {
  return usePostgres ? readPostgresStore() : readFileStore();
}

async function saveFileStoreIfCurrent(expectedVersion, nextState) {
  const current = await readFileStore();
  if (expectedVersion !== current.version) {
    return { ok: false, store: current };
  }

  const next = {
    version: current.version + 1,
    state: nextState,
    updatedAt: new Date().toISOString(),
  };
  await writeFileStore(next);
  return { ok: true, store: next };
}

async function saveStoreIfCurrent(expectedVersion, nextState) {
  return usePostgres
    ? savePostgresStoreIfCurrent(expectedVersion, nextState)
    : saveFileStoreIfCurrent(expectedVersion, nextState);
}

// ---------- Draft history ----------
// Each saved version is kept without the player list (it never changes mid-draft
// and is ~90% of the size). Restores re-attach the current player list.

function historySnapshot(state) {
  if (!state || typeof state !== "object") return null;
  const { players, ...rest } = state;
  return rest;
}

function cleanLabel(label) {
  const text = String(label == null ? "" : label).trim().slice(0, 200);
  return text || "Draft updated";
}

function pickCount(state) {
  return state && Array.isArray(state.picks) ? state.picks.length : 0;
}

async function readFileHistory() {
  await ensureDataDir();
  try {
    const entries = JSON.parse(await fsp.readFile(historyPath, "utf8"));
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Failed to read history file:", error);
    return [];
  }
}

async function writeFileHistory(entries) {
  await ensureDataDir();
  const tempPath = historyPath + ".tmp";
  await fsp.writeFile(tempPath, JSON.stringify(entries));
  await fsp.rename(tempPath, historyPath);
}

async function recordHistory(store, label) {
  const snapshot = historySnapshot(store.state);
  if (!snapshot) return;
  const text = cleanLabel(label);

  if (usePostgres) {
    await ensurePostgresStore();
    const pool = getPgPool();
    const last = (await pool.query(
      "SELECT id, label, created_at FROM draft_state_history WHERE state_id = $1 ORDER BY id DESC LIMIT 1",
      [postgresStateId]
    )).rows[0];
    if (last && last.label === text && Date.now() - new Date(last.created_at).getTime() < HISTORY_MERGE_MS) {
      await pool.query(
        "UPDATE draft_state_history SET version = $2, state = $3::jsonb, created_at = NOW() WHERE id = $1",
        [last.id, store.version, JSON.stringify(snapshot)]
      );
    } else {
      await pool.query(
        "INSERT INTO draft_state_history (state_id, version, label, state) VALUES ($1, $2, $3, $4::jsonb)",
        [postgresStateId, store.version, text, JSON.stringify(snapshot)]
      );
    }
    await pool.query(
      `DELETE FROM draft_state_history
       WHERE state_id = $1
         AND id < (SELECT id FROM draft_state_history WHERE state_id = $1 ORDER BY id DESC OFFSET $2 LIMIT 1)`,
      [postgresStateId, HISTORY_LIMIT - 1]
    );
    return;
  }

  const entries = await readFileHistory();
  const last = entries[entries.length - 1];
  const now = new Date().toISOString();
  if (last && last.label === text && Date.now() - new Date(last.createdAt).getTime() < HISTORY_MERGE_MS) {
    Object.assign(last, { version: store.version, state: snapshot, createdAt: now });
  } else {
    const nextId = entries.reduce((max, entry) => Math.max(max, entry.id || 0), 0) + 1;
    entries.push({ id: nextId, version: store.version, label: text, state: snapshot, createdAt: now });
  }
  await writeFileHistory(entries.slice(-HISTORY_LIMIT));
}

async function safeRecordHistory(store, label) {
  try {
    await recordHistory(store, label);
  } catch (error) {
    console.error("Failed to record draft history:", error);
  }
}

async function listHistory() {
  if (usePostgres) {
    await ensurePostgresStore();
    const result = await getPgPool().query(
      `SELECT id, version, label, created_at,
              COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(state->'picks') = 'array' THEN state->'picks' END), 0) AS picks
       FROM draft_state_history WHERE state_id = $1 ORDER BY id DESC LIMIT $2`,
      [postgresStateId, HISTORY_LIMIT]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      version: row.version,
      label: row.label,
      createdAt: new Date(row.created_at).toISOString(),
      picks: Number(row.picks),
    }));
  }
  const entries = await readFileHistory();
  return entries.slice().reverse().map((entry) => ({
    id: entry.id,
    version: entry.version,
    label: entry.label,
    createdAt: entry.createdAt,
    picks: pickCount(entry.state),
  }));
}

async function getHistoryEntry(id) {
  if (usePostgres) {
    await ensurePostgresStore();
    const row = (await getPgPool().query(
      "SELECT id, version, label, state, created_at FROM draft_state_history WHERE state_id = $1 AND id = $2",
      [postgresStateId, id]
    )).rows[0];
    return row ? { id: Number(row.id), version: row.version, label: row.label, state: row.state, createdAt: new Date(row.created_at).toISOString() } : null;
  }
  const entries = await readFileHistory();
  return entries.find((entry) => entry.id === id) || null;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (pathname === "/api/history" && req.method === "GET") {
    let entries = await listHistory();
    if (!entries.length) {
      const store = await readStore();
      if (store.state) {
        await safeRecordHistory(store, "Starting point (history turned on)");
        entries = await listHistory();
      }
    }
    sendJson(res, 200, { entries, limit: HISTORY_LIMIT });
    return;
  }

  const restoreMatch = pathname.match(/^\/api\/history\/(\d+)\/restore$/);
  if (restoreMatch && req.method === "POST") {
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)) || "{}");
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    writeQueue = writeQueue.then(async () => {
      const entry = await getHistoryEntry(Number(restoreMatch[1]));
      if (!entry || !entry.state) {
        sendJson(res, 404, { error: "That saved version no longer exists." });
        return;
      }
      const current = await readStore();
      const players = current.state && Array.isArray(current.state.players) ? current.state.players : [];
      const nextState = { ...entry.state, players };
      const result = await saveStoreIfCurrent(current.version, nextState);
      if (!result.ok) {
        sendJson(res, 409, { error: "Someone saved at the same moment. Try the restore again.", version: result.store.version, state: result.store.state });
        return;
      }
      await safeRecordHistory(result.store, payload.label || "Restored an earlier version");
      sendJson(res, 200, result.store);
    }).catch((error) => {
      console.error("Failed to restore history:", error);
      if (!res.headersSent) sendJson(res, 500, { error: "Failed to restore that version" });
    });
    return;
  }

  if (req.url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.url === "/api/state" && req.method === "GET") {
    sendJson(res, 200, await readStore());
    return;
  }

  if (req.url === "/api/state" && req.method === "PUT") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    writeQueue = writeQueue.then(async () => {
      const result = await saveStoreIfCurrent(payload.version, payload.state);
      if (!result.ok) {
        sendJson(res, 409, {
          error: "State conflict",
          version: result.store.version,
          state: result.store.state,
          updatedAt: result.store.updatedAt,
        });
        return;
      }

      sendJson(res, 200, result.store);
      if (payload.history !== false) await safeRecordHistory(result.store, payload.label);
    }).catch((error) => {
      console.error("Failed to write state:", error);
      if (!res.headersSent) sendJson(res, 500, { error: "Failed to write state" });
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  sendStatic(req, res);
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}/`);
  if (usePostgres) {
    console.log(`Draft state storage: PostgreSQL row "${postgresStateId}"`);
  } else {
    console.log(`Draft state file: ${statePath}`);
  }
});
