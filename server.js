const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const root = __dirname;
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5173);
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const statePath = path.join(dataDir, "draft-state.json");
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
  const pool = getPgPool();
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
