const STORAGE_KEY = "fantasyBasketballDraftState.v1";
const ADMIN_OWNER_NAME = "Luis";
const OWNER_NAMES = ["Luis", "Daniel", "Theo", "Henry", "Reed", "Adolfo", "Ivan", "Gus", "Mario", "Frank", "Z", "Yoshi"];
const ROUNDS = 13;
let activeOwnerTab = "board";
let activeSetupTab = "order";
let ownerRosterViewId = "";
let serverSyncEnabled = false;
let serverVersion = null;
let suppressServerSync = false;
let savingToServer = false;
let queuedServerState = null;
let conflictAlertShown = false;
let tradeSelection = { a: new Set(), b: new Set() };
let queuedServerMeta = null;
let historyEntries = null;
let historyError = "";
let historyLoading = false;

// ---- Admin login ----
// The server checks the password (ADMIN_PASSWORD env var) and hands back a token,
// which this browser remembers so Luis stays logged in.
const ADMIN_TOKEN_KEY = "fbdraftAdminToken";
let adminRequired = false;
let adminSession = false;

function readAdminToken() {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ""; } catch (error) { return ""; }
}

function writeAdminToken(token) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (error) {
    // Private browsing: the login just won't be remembered.
  }
}

function adminHeaders(extra = {}) {
  const token = readAdminToken();
  return token ? { ...extra, "X-Admin-Token": token } : extra;
}

function isAdminUnlocked() {
  return !adminRequired || adminSession;
}

async function checkAdminStatus() {
  try {
    const response = await fetch("/api/admin/status", { cache: "no-store", headers: adminHeaders() });
    if (!response.ok) return;
    const payload = await response.json();
    adminRequired = Boolean(payload.required);
    adminSession = Boolean(payload.admin);
    if (adminRequired && !adminSession) writeAdminToken("");
  } catch (error) {
    // No server (local file mode): nothing to lock.
  }
}

async function adminLogin(password) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not log in.");
  writeAdminToken(payload.token || "");
  adminSession = true;
}

function adminLogout() {
  writeAdminToken("");
  adminSession = false;
  historyEntries = null;
  render();
}

// Only Luis's page is locked; the Draft Room and other owners' pages stay open.
function pageNeedsAdmin() {
  const owner = ownerFromUrl();
  return Boolean(owner && key(owner.owner) === key(ADMIN_OWNER_NAME));
}

function renderAdminGate() {
  const locked = adminRequired && !adminSession && pageNeedsAdmin();
  document.body.classList.toggle("admin-locked", locked);
  els.adminGate.hidden = !locked;
  if (els.adminLogout) els.adminLogout.hidden = !(adminRequired && adminSession);
  if (locked) {
    els.adminGateOwners.innerHTML = state.owners.filter((owner) => key(owner.owner) !== key(ADMIN_OWNER_NAME))
      .map((owner) => "<a href=\"?team=" + encodeURIComponent(owner.owner) + "\">" + escapeHtml(owner.owner) + "</a>").join("");
  }
  return locked;
}

// Total value is only shown to the admin.
function showTotals() {
  return isAdminUnlocked();
}

// Adds/removes the "Sort by Total" choice on the owner page.
function syncTotalSortOption() {
  const existing = els.ownerSort.querySelector("option[value=\"total\"]");
  if (showTotals() && !existing) {
    const option = document.createElement("option");
    option.value = "total";
    option.textContent = "Sort by Total";
    els.ownerSort.insertBefore(option, els.ownerSort.options[1] || null);
  } else if (!showTotals() && existing) {
    if (els.ownerSort.value === "total") els.ownerSort.value = "rank";
    existing.remove();
  }
}

function totalCellHtml(player) {
  return showTotals() ? "<td><strong>" + (Number(player.total) || 0).toFixed(2) + "</strong></td>" : "";
}

function makeOwner(name, index) {
  return { id: "owner-" + (index + 1), owner: name, team: name };
}

const defaultOwners = OWNER_NAMES.map(makeOwner);
const state = loadState();

const els = {
  csvInput: document.querySelector("#csv-input"),
  stateInput: document.querySelector("#state-input"),
  exportState: document.querySelector("#export-state"),
  resetDraft: document.querySelector("#reset-draft"),
  ownerHome: document.querySelector("#owner-home"),
  editSetup: document.querySelector("#edit-setup"),
  startDraft: document.querySelector("#start-draft"),
  teamLinks: document.querySelector("#team-links"),
  ownerSelect: document.querySelector("#owner-select"),
  pickOwner: document.querySelector("#pick-owner"),
  pickPlayer: document.querySelector("#pick-player"),
  pickForm: document.querySelector("#pick-form"),
  availablePlayers: document.querySelector("#available-players"),
  nextPickLabel: document.querySelector("#next-pick-label"),
  draftCount: document.querySelector("#draft-count"),
  draftBoard: document.querySelector("#draft-board"),
  dashboardOwner: document.querySelector("#dashboard-owner"),
  teamSummary: document.querySelector("#team-summary"),
  teamRoster: document.querySelector("#team-roster"),
  playerCount: document.querySelector("#player-count"),
  searchInput: document.querySelector("#search-input"),
  positionFilter: document.querySelector("#position-filter"),
  playersBody: document.querySelector("#players-body"),
  ownerPagePanel: document.querySelector("#owner-page-panel"),
  ownerPageTitle: document.querySelector("#owner-page-title"),
  ownerPageCount: document.querySelector("#owner-page-count"),
  ownerAdminPanel: document.querySelector("#owner-admin-panel"),
  ownerAdminHome: document.querySelector("#owner-admin-home"),
  ownerAdminUndo: document.querySelector("#owner-admin-undo"),
  ownerAdminHistory: document.querySelector("#owner-admin-history"),
  ownerHistoryTab: document.querySelector("#owner-history-tab"),
  ownerLeagueTab: document.querySelector("#owner-league-tab"),
  leagueOutput: document.querySelector("#league-output"),
  leagueRanks: document.querySelector("#league-ranks"),
  leagueMatrix: document.querySelector("#league-matrix"),
  leagueH2hA: document.querySelector("#league-h2h-a"),
  leagueH2hB: document.querySelector("#league-h2h-b"),
  leagueH2h: document.querySelector("#league-h2h"),
  leagueH2hResult: document.querySelector("#league-h2h-result"),
  historyCount: document.querySelector("#history-count"),
  historyRefresh: document.querySelector("#history-refresh"),
  historyList: document.querySelector("#history-list"),
  ownerAdminReset: document.querySelector("#owner-admin-reset"),
  ownerPageSelect: document.querySelector("#owner-page-select"),
  ownerPageSummary: document.querySelector("#owner-page-summary"),
  ownerTabs: document.querySelector("#owner-tabs"),
  setupTabs: document.querySelector("#setup-tabs"),
  ownerPlayerSearch: document.querySelector("#owner-player-search"),
  ownerSort: document.querySelector("#owner-sort"),
  adminGate: document.querySelector("#admin-gate"),
  adminLoginForm: document.querySelector("#admin-login-form"),
  adminPassword: document.querySelector("#admin-password"),
  adminLoginError: document.querySelector("#admin-login-error"),
  adminGateOwners: document.querySelector("#admin-gate-owners"),
  adminLogout: document.querySelector("#admin-logout"),
  ownerAdminLogout: document.querySelector("#owner-admin-logout"),
  ownerFlagFilter: document.querySelector("#owner-flag-filter"),
  ownerClockPanel: document.querySelector("#owner-clock-panel"),
  ownerBoardCount: document.querySelector("#owner-board-count"),
  ownerDraftBoard: document.querySelector("#owner-draft-board"),
  ownerPlayerBody: document.querySelector("#owner-player-body"),
  ownerRosterSelect: document.querySelector("#owner-roster-select"),
  ownerRosterCount: document.querySelector("#owner-roster-count"),
  ownerRosterBody: document.querySelector("#owner-roster-body"),
  orderStatus: document.querySelector("#order-status"),
  draftOrderList: document.querySelector("#draft-order-list"),
  saveOrder: document.querySelector("#save-order"),
  keepersInput: document.querySelector("#keepers-input"),
  keeperList: document.querySelector("#keeper-list"),
  tradesInput: document.querySelector("#trades-input"),
  tradeOwnerA: document.querySelector("#trade-owner-a"),
  tradeOwnerB: document.querySelector("#trade-owner-b"),
  tradePicksA: document.querySelector("#trade-picks-a"),
  tradePicksB: document.querySelector("#trade-picks-b"),
  tradeSummary: document.querySelector("#trade-summary"),
  clearTrade: document.querySelector("#clear-trade"),
  addTrade: document.querySelector("#add-trade"),
  tradeList: document.querySelector("#trade-list"),
  pickMapBody: document.querySelector("#pick-map-body"),
  pickMapNextBody: document.querySelector("#pick-map-next-body"),
  pickMapNextTitle: document.querySelector("#pick-map-next-title")
};

function defaultState() {
  return { owners: defaultOwners, selectedOwnerId: defaultOwners[0].id, draftOrder: [], pickTrades: [], keepers: normalizeKeepers({}), playerFlags: {}, draftStarted: false, players: [], picks: [] };
}

function normalizeState(raw) {
  const parsed = raw && typeof raw === "object" ? raw : {};
  parsed.owners = defaultOwners;
  parsed.selectedOwnerId = parsed.selectedOwnerId && defaultOwners.some((owner) => owner.id === parsed.selectedOwnerId) ? parsed.selectedOwnerId : defaultOwners[0].id;
  parsed.players = parsed.players || [];
  parsed.playerFlags = parsed.playerFlags || {};
  parsed.picks = parsed.picks || [];
  parsed.pickTrades = parsed.pickTrades || [];
  parsed.keepers = normalizeKeepers(parsed.keepers || {});
  parsed.draftStarted = Boolean(parsed.draftStarted);
  parsed.draftOrder = Array.isArray(parsed.draftOrder) ? parsed.draftOrder.filter((id) => defaultOwners.some((owner) => owner.id === id)) : [];
  return parsed;
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return normalizeState(JSON.parse(stored));
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return defaultState();
}

function normalizeKeepers(raw) {
  const keepers = {};
  for (const owner of defaultOwners) {
    const existing = Array.isArray(raw[owner.id]) ? raw[owner.id] : [];
    keepers[owner.id] = [existing[0] || "", existing[1] || "", existing[2] || ""];
  }
  return keepers;
}

function stateSnapshot() { return JSON.parse(JSON.stringify(state)); }
function applyState(nextState) { Object.assign(state, normalizeState(nextState)); }

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!serverSyncEnabled || suppressServerSync || options.localOnly) return;
  queuedServerState = stateSnapshot();
  const previousMeta = queuedServerMeta || {};
  queuedServerMeta = {
    label: options.label || previousMeta.label || "Draft updated",
    history: options.history !== false || Boolean(previousMeta.history)
  };
  flushServerSave();
}

async function flushServerSave() {
  if (savingToServer || !queuedServerState) return;
  savingToServer = true;

  while (queuedServerState && serverSyncEnabled) {
    const snapshot = queuedServerState;
    const meta = queuedServerMeta || {};
    queuedServerState = null;
    queuedServerMeta = null;

    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: serverVersion, state: snapshot, label: meta.label, history: meta.history !== false }),
      });

      const payload = await response.json();
      if (response.status === 409) {
        await handleSyncConflict(payload);
        break;
      }
      if (!response.ok) throw new Error(payload.error || "Unable to save draft state.");

      serverVersion = payload.version;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      if (historyTabOpen()) loadHistory();
    } catch (error) {
      console.error(error);
      serverSyncEnabled = false;
      alert("Live sync stopped because the server could not save draft state. Export the state as a backup before continuing.");
      break;
    }
  }

  savingToServer = false;
}

async function handleSyncConflict(payload) {
  serverVersion = payload.version;
  if (payload.state) {
    applyState(payload.state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  }
  queuedServerState = null;
  if (!conflictAlertShown) {
    conflictAlertShown = true;
    alert("Another draft room update landed first, so this page reloaded the latest shared state. Please retry your last action.");
    setTimeout(() => { conflictAlertShown = false; }, 3000);
  }
}

async function loadServerState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return false;
    const payload = await response.json();
    serverSyncEnabled = true;
    serverVersion = payload.version;
    const hasServerState = Boolean(payload.state);
    if (hasServerState) {
      applyState(payload.state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    return hasServerState;
  } catch (error) {
    return false;
  }
}

async function pollServerState() {
  if (!serverSyncEnabled || savingToServer || queuedServerState) return;
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.state && payload.version !== serverVersion) {
      serverVersion = payload.version;
      applyState(payload.state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
    }
  } catch (error) {
    // Temporary network blips should not interrupt the draft room.
  }
}
function normalize(value) { return String(value == null ? "" : value).trim(); }
function key(value) { return normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function escapeHtml(value) { return normalize(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char])); }
function toNumber(value) { const match = normalize(value).replace("%", "").match(/-?\d+(\.\d+)?/); const number = match ? Number(match[0]) : 0; return Number.isFinite(number) ? number : 0; }
function ownerById(ownerId) { return state.owners.find((owner) => owner.id === ownerId) || state.owners[0]; }
function ownerName(ownerId) { const owner = ownerById(ownerId); return owner ? owner.owner : "Unknown"; }
function playerByName(playerName) { return state.players.find((player) => key(player.player) === key(playerName)); }

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((item) => normalize(item) !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((item) => normalize(item) !== "")) rows.push(row);
  return rows;
}

function readColumn(record, names) {
  for (const name of names) if (record[name] !== undefined) return record[name];
  return "";
}

function csvRecords(text) {
  const rows = parseCsv(text);
  const headers = (rows.shift() || []).map((header) => key(header));
  return rows.map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] == null ? "" : row[i]])));
}

// "0.574(10.5/18.3)" -> { fgm: 10.5, fga: 18.3 }. Used to weight team FG%/FT%.
function makesAttempts(prefix, value) {
  const match = normalize(value).match(/\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/);
  return match ? { [prefix + "m"]: Number(match[1]) || 0, [prefix + "a"]: Number(match[2]) || 0 } : {};
}

function playerFromRecord(record, index) {
  const player = normalize(readColumn(record, ["player", "name", "player name"]));
  return {
    id: key(player) || "player-" + index,
    player,
    team: normalize(readColumn(record, ["team", "nba team", "tm"])),
    pos: normalize(readColumn(record, ["pos", "position", "positions"])),
    rank: toNumber(readColumn(record, ["rank", "rk", "overall", "adp"])), 
    total: toNumber(readColumn(record, ["total", "value"])), 
    pts: toNumber(readColumn(record, ["pts", "points"])),
    reb: toNumber(readColumn(record, ["reb", "rebounds", "treb"])), 
    ast: toNumber(readColumn(record, ["ast", "assists"])),
    stl: toNumber(readColumn(record, ["stl", "steals"])),
    blk: toNumber(readColumn(record, ["blk", "blocks"])),
    threepm: toNumber(readColumn(record, ["threepm", "3pm", "3m", "threes", "3:00 pm"])), 
    fg_pct: toNumber(readColumn(record, ["fg_pct", "fg%", "fg"])),
    ft_pct: toNumber(readColumn(record, ["ft_pct", "ft%", "ft"])),
    to: toNumber(readColumn(record, ["to", "turnovers", "tov"])),
    nbaId: normalize(readColumn(record, ["nba_id", "nba id", "nbaid", "player_id", "person_id"])),
    ...makesAttempts("fg", readColumn(record, ["fg_pct", "fg%", "fg"])),
    ...makesAttempts("ft", readColumn(record, ["ft_pct", "ft%", "ft"]))
  };
}

function importPlayers(text, options = {}) {
  state.players = csvRecords(text).map((record, index) => playerFromRecord(record, index))
    .filter((player) => player.player)
    .sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || a.player.localeCompare(b.player));
  saveState({ label: "Player list imported" });
  if (!options.silent) render();
}

function hasDraftOrder() { return state.draftOrder.length === state.owners.length && new Set(state.draftOrder).size === state.owners.length; }
function orderedOwnerIds() { return hasDraftOrder() ? state.draftOrder : state.owners.map((owner) => owner.id); }
function keeperNames(ownerId) { return (state.keepers[ownerId] || []).map(normalize).filter(Boolean); }

function baseOwnerIdForPickIndex(index) {
  const order = orderedOwnerIds();
  const ownerCount = order.length || 1;
  const round = Math.floor(index / ownerCount) + 1;
  const slot = index % ownerCount;
  // Rounds 1-3 repeat the same order. Round 4 restarts at the first overall pick,
  // then the draft snakes: R4 forward, R5 reversed, R6 forward, ...
  if (round <= 3) return order[slot];
  return (round - 4) % 2 === 0 ? order[slot] : order[ownerCount - 1 - slot];
}

function basePickIndexFor(ownerId, round) {
  const ownerCount = Math.max(state.owners.length, 1);
  const start = (round - 1) * ownerCount;
  for (let slot = 0; slot < ownerCount; slot += 1) {
    const index = start + slot;
    if (baseOwnerIdForPickIndex(index) === ownerId) return index;
  }
  return null;
}

function buildPickTradeMap() {
  const map = new Map();
  for (const trade of state.pickTrades) {
    if (trade.type === "package") {
      for (const pick of trade.aGives || []) {
        if (pick.year === "next") continue;
        const index = basePickIndexFor(pick.originalOwnerId, pick.round);
        if (index != null) map.set(index, trade.ownerBId);
      }
      for (const pick of trade.bGives || []) {
        if (pick.year === "next") continue;
        const index = basePickIndexFor(pick.originalOwnerId, pick.round);
        if (index != null) map.set(index, trade.ownerAId);
      }
      continue;
    }
    const fromIndex = basePickIndexFor(trade.fromOwnerId, trade.fromRound);
    if (fromIndex == null) continue;
    if (trade.type === "swap") {
      const toIndex = basePickIndexFor(trade.toOwnerId, trade.toRound);
      if (toIndex == null) continue;
      map.set(fromIndex, trade.toOwnerId);
      map.set(toIndex, trade.fromOwnerId);
    } else {
      map.set(fromIndex, trade.toOwnerId);
    }
  }
  return map;
}

// Net players each team has gained (+) or given up (-) in player trades.
function netPlayersTraded() {
  const net = Object.fromEntries(state.owners.map((owner) => [owner.id, 0]));
  for (const trade of state.pickTrades) {
    if (trade.type !== "package") continue;
    const aCount = (trade.aPlayers || []).length;
    const bCount = (trade.bPlayers || []).length;
    if (trade.ownerAId in net) net[trade.ownerAId] += bCount - aCount;
    if (trade.ownerBId in net) net[trade.ownerBId] += aCount - bCount;
  }
  return net;
}

// How many draft selections each team gets so every roster ends at ROUNDS players.
// A team that traded away players gets extra picks; one that took on players gets
// later picks skipped.
function selectionTargets() {
  const net = netPlayersTraded();
  return Object.fromEntries(state.owners.map((owner) => [owner.id, Math.max(0, ROUNDS - (net[owner.id] || 0))]));
}

function computePickSchedule() {
  const ownerCount = Math.max(state.owners.length, 1);
  const tradeMap = buildPickTradeMap();
  const targets = selectionTargets();
  const usedSlots = new Set(state.picks.map((pick, index) => pickIndexForDraftedPick(pick, index)));
  const schedule = [];
  const counts = Object.fromEntries(state.owners.map((owner) => [owner.id, 0]));
  const baseCount = ROUNDS * ownerCount;

  for (let index = 0; index < baseCount; index += 1) {
    const originalOwnerId = baseOwnerIdForPickIndex(index);
    const ownerId = tradeMap.get(index) || originalOwnerId;
    // A slot that already has a player in it is never skipped.
    const skipped = (counts[ownerId] || 0) >= (targets[ownerId] ?? ROUNDS) && !usedSlots.has(index);
    if (!skipped) counts[ownerId] = (counts[ownerId] || 0) + 1;
    schedule.push({ index, pick: index + 1, round: Math.floor(index / ownerCount) + 1, roundLabel: "R" + (Math.floor(index / ownerCount) + 1), originalOwnerId, ownerId, traded: ownerId !== originalOwnerId, compensation: false, skipped });
  }

  let extraRound = 1;
  while (state.owners.some((owner) => (counts[owner.id] || 0) < (targets[owner.id] ?? ROUNDS))) {
    for (const ownerId of orderedOwnerIds()) {
      if ((counts[ownerId] || 0) < (targets[ownerId] ?? ROUNDS)) {
        counts[ownerId] = (counts[ownerId] || 0) + 1;
        schedule.push({ index: schedule.length, pick: schedule.length + 1, round: ROUNDS + extraRound, roundLabel: "Extra " + extraRound, originalOwnerId: ownerId, ownerId, traded: false, compensation: true, skipped: false });
      }
    }
    extraRound += 1;
  }

  return schedule;
}

function keeperForScheduleIndex(schedule, index) {
  const slot = schedule[index];
  if (!slot) return null;
  const names = keeperNames(slot.ownerId);
  if (!names.length || slot.skipped) return null;
  let ownerSlotCount = 0;
  for (let i = 0; i <= index; i += 1) {
    if (schedule[i].ownerId === slot.ownerId && !schedule[i].compensation) ownerSlotCount += 1;
  }
  const keeperName = names[ownerSlotCount - 1];
  if (!keeperName) return null;
  const player = playerByName(keeperName);
  return {
    playerId: player ? player.id : "keeper-" + slot.ownerId + "-" + ownerSlotCount,
    player: keeperName,
    nbaId: player ? player.nbaId : "",
    fgm: player ? player.fgm : 0, fga: player ? player.fga : 0,
    ftm: player ? player.ftm : 0, fta: player ? player.fta : 0,
    team: player ? player.team : "",
    pos: player ? player.pos : "Keeper",
    rank: player ? player.rank : "",
    pts: player ? player.pts : 0,
    reb: player ? player.reb : 0,
    ast: player ? player.ast : 0,
    stl: player ? player.stl : 0,
    blk: player ? player.blk : 0,
    threepm: player ? player.threepm : 0,
    fg_pct: player ? player.fg_pct : 0,
    ft_pct: player ? player.ft_pct : 0,
    to: player ? player.to : 0,
    keeper: true,
    ownerId: slot.ownerId,
    pickIndex: index
  };
}

function pickIndexForDraftedPick(pick, fallbackIndex) { return pick.pickIndex == null ? fallbackIndex : pick.pickIndex; }
function draftedPickMap() { return new Map(state.picks.map((pick, index) => [pickIndexForDraftedPick(pick, index), pick])); }
function nextOpenScheduleIndex() {
  const schedule = computePickSchedule();
  const picks = draftedPickMap();
  for (let i = 0; i < schedule.length; i += 1) {
    if (schedule[i].skipped) continue;
    if (keeperForScheduleIndex(schedule, i)) continue;
    if (!picks.has(i)) return i;
  }
  return -1;
}
function currentSchedulePick() { const schedule = computePickSchedule(); return schedule[nextOpenScheduleIndex()]; }
function ownerForNextPick() { const pick = currentSchedulePick(); return pick ? ownerById(pick.ownerId) : state.owners[0]; }
function nextPickNumber() { const index = nextOpenScheduleIndex(); return index >= 0 ? index + 1 : state.picks.length + 1; }
function nextPickForOwner(ownerId) {
  const schedule = computePickSchedule();
  const picks = draftedPickMap();
  for (let i = nextOpenScheduleIndex(); i < schedule.length; i += 1) {
    if (i < 0) break;
    if (keeperForScheduleIndex(schedule, i) || picks.has(i)) continue;
    if (schedule[i].ownerId === ownerId) return schedule[i];
  }
  return null;
}
function allKeeperPlayers() { const schedule = computePickSchedule(); return schedule.map((slot, index) => keeperForScheduleIndex(schedule, index)).filter(Boolean); }
function draftedPlayerIds() {
  const ids = new Set(state.picks.map((pick) => pick.playerId));
  for (const keeper of allKeeperPlayers()) {
    const player = playerByName(keeper.player);
    if (player) ids.add(player.id);
  }
  return ids;
}
function draftedPlayerNames() {
  const names = new Set();
  const byId = new Map(state.players.map((player) => [player.id, player]));
  for (const pick of state.picks) {
    const player = byId.get(pick.playerId);
    if (player) names.add(key(player.player));
  }
  for (const keeper of allKeeperPlayers()) names.add(key(keeper.player));
  return names;
}

// Every rostered player (keepers + drafted), with who drafted them and who has them now.
function rosteredPlayers() {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const schedule = computePickSchedule();
  const list = [];
  schedule.forEach((slot, index) => {
    const keeper = keeperForScheduleIndex(schedule, index);
    if (keeper) list.push({ ...keeper, id: keeper.playerId, draftedById: keeper.ownerId });
  });
  state.picks.forEach((pick, index) => {
    const player = byId.get(pick.playerId);
    if (player) list.push({ ...player, pickIndex: pickIndexForDraftedPick(pick, index), draftedById: pick.ownerId });
  });
  const owners = playerOwnerMap(list);
  return list.map((player) => ({ ...player, currentOwnerId: owners.get(player.id) || player.draftedById }));
}

// Who owns each rostered player after applying player trades in order.
function playerOwnerMap(list) {
  const owners = new Map(list.map((player) => [player.id, player.draftedById]));
  for (const trade of state.pickTrades) {
    if (trade.type !== "package") continue;
    for (const item of trade.aPlayers || []) if (owners.has(item.playerId)) owners.set(item.playerId, trade.ownerBId);
    for (const item of trade.bPlayers || []) if (owners.has(item.playerId)) owners.set(item.playerId, trade.ownerAId);
  }
  return owners;
}

function teamPlayers(ownerId) {
  return rosteredPlayers()
    .filter((player) => player.currentOwnerId === ownerId)
    .map((player) => ({ ...player, acquiredFromId: player.draftedById !== ownerId ? player.draftedById : null }))
    .sort((a, b) => (a.pickIndex || 0) - (b.pickIndex || 0));
}

function primaryPosition(player) {
  return normalize(player.pos).split(/[\/, ]+/).filter(Boolean)[0] || "Other";
}

function positionCounts(roster) {
  const positions = ["PG", "SG", "SF", "PF", "C"];
  const counts = Object.fromEntries(positions.map((position) => [position, 0]));
  for (const player of roster) {
    const position = primaryPosition(player);
    counts[position] = (counts[position] || 0) + 1;
  }
  return counts;
}

function positionSummaryHtml(roster) {
  const counts = positionCounts(roster);
  return Object.keys(counts).map((position) => "<div class=\"position-chip\"><span>" + escapeHtml(position) + "</span><strong>" + counts[position] + "</strong></div>").join("");
}

function availablePlayers(options = {}) {
  const drafted = draftedPlayerIds();
  const draftedNames = draftedPlayerNames();
  const search = key(options.search == null ? els.searchInput.value : options.search);
  const position = options.position == null ? els.positionFilter.value : options.position;
  return state.players.filter((player) => {
    if (drafted.has(player.id) || draftedNames.has(key(player.player))) return false;
    if (position && !player.pos.split(/[\/, ]+/).includes(position)) return false;
    if (!search) return true;
    return [player.player, player.team, player.pos].some((value) => key(value).includes(search));
  });
}

function addPick(ownerId, playerName) {
  if (!hasDraftOrder()) return alert("Set the draft order first.");
  const scheduleIndex = nextOpenScheduleIndex();
  const schedulePick = computePickSchedule()[scheduleIndex];
  if (!schedulePick) return alert("No pick slot is available.");
  if (ownerId && ownerId !== schedulePick.ownerId) return alert(ownerName(schedulePick.ownerId) + " is on the clock.");
  const player = playerByName(playerName);
  if (!player) return alert("That player is not in the loaded CSV.");
  if (draftedPlayerIds().has(player.id) || draftedPlayerNames().has(key(player.player))) return alert(player.player + " has already been drafted or kept.");
  state.picks.push({ pick: schedulePick.pick, pickIndex: scheduleIndex, round: schedulePick.round, roundLabel: schedulePick.roundLabel, ownerId: schedulePick.ownerId, playerId: player.id, draftedAt: new Date().toISOString(), compensation: schedulePick.compensation, traded: schedulePick.traded });
  els.pickPlayer.value = "";
  saveState({ label: "Pick " + schedulePick.pick + ": " + ownerName(schedulePick.ownerId) + " took " + player.player });
  render();
}

function ownerOptions(selectedId) {
  return state.owners.map((owner) => "<option value=\"" + escapeHtml(owner.id) + "\"" + (owner.id === selectedId ? " selected" : "") + ">" + escapeHtml(owner.owner) + "</option>").join("");
}

function renderDraftOrder() {
  const current = orderedOwnerIds();
  els.draftOrderList.innerHTML = "";
  for (let index = 0; index < state.owners.length; index += 1) {
    const owner = ownerById(current[index] || state.owners[index].id);
    const row = document.createElement("div");
    row.className = "order-row";
    row.draggable = true;
    row.dataset.ownerId = owner.id;
    row.innerHTML = "<span class=\"order-slot\">" + (index + 1) + "</span><button class=\"order-handle\" type=\"button\" aria-label=\"Drag " + escapeHtml(owner.owner) + "\">::</button><strong>" + escapeHtml(owner.owner) + "</strong><div class=\"order-row-actions\"><button class=\"order-move\" type=\"button\" data-direction=\"up\" aria-label=\"Move " + escapeHtml(owner.owner) + " up\">Up</button><button class=\"order-move\" type=\"button\" data-direction=\"down\" aria-label=\"Move " + escapeHtml(owner.owner) + " down\">Down</button></div>";
    els.draftOrderList.append(row);
  }
  els.orderStatus.textContent = hasDraftOrder() ? "Order set" : "Set order first";
  els.pickForm.classList.toggle("locked", !hasDraftOrder());
  els.pickPlayer.disabled = !hasDraftOrder();
  els.startDraft.disabled = !hasDraftOrder();
}

function saveDraftOrderFromForm() {
  const ids = Array.from(els.draftOrderList.querySelectorAll(".order-row")).map((row) => row.dataset.ownerId);
  if (new Set(ids).size !== state.owners.length) return alert("Each owner can only appear once in the draft order.");
  if (state.picks.length && !confirm("Changing the order after picks exist can make the board confusing. Save it anyway?")) return;
  state.draftOrder = ids;
  saveState({ label: "Draft order saved" });
  render();
}

function refreshDraftOrderSlots() {
  Array.from(els.draftOrderList.querySelectorAll(".order-row")).forEach((row, index) => {
    row.querySelector(".order-slot").textContent = index + 1;
  });
}

function moveDraftOrderRow(row, direction) {
  if (!row) return;
  if (direction === "up" && row.previousElementSibling) {
    els.draftOrderList.insertBefore(row, row.previousElementSibling);
  }
  if (direction === "down" && row.nextElementSibling) {
    els.draftOrderList.insertBefore(row.nextElementSibling, row);
  }
  refreshDraftOrderSlots();
}

function rowAfterDragPointer(container, y) {
  const rows = Array.from(container.querySelectorAll(".order-row:not(.is-dragging)"));
  return rows.reduce((closest, row) => {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, row };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, row: null }).row;
}

function ownerFromValue(value) {
  const ownerKey = key(value);
  if (!ownerKey) return null;
  return state.owners.find((owner) => [owner.id, owner.owner, owner.team].some((item) => key(item) === ownerKey)) || null;
}

function keeperValuesFromRecord(record) {
  const wideValues = [
    readColumn(record, ["1"]),
    readColumn(record, ["keeper1", "keeper 1", "keeper_1", "player1", "player 1", "player_1"]),
    readColumn(record, ["2"]),
    readColumn(record, ["keeper2", "keeper 2", "keeper_2", "player2", "player 2", "player_2"]),
    readColumn(record, ["3"]),
    readColumn(record, ["keeper3", "keeper 3", "keeper_3", "player3", "player 3", "player_3"])
  ].map(normalize).filter(Boolean);
  const singleValue = normalize(readColumn(record, ["keeper", "player", "player name", "name"]));
  return wideValues.length ? wideValues : (singleValue ? [singleValue] : []);
}

function importKeepers(text, options = {}) {
  const keepers = normalizeKeepers({});
  let imported = 0;

  for (const record of csvRecords(text)) {
    const owner = ownerFromValue(readColumn(record, ["", "owner", "owner name", "team", "manager", "name"]));
    if (!owner) continue;
    const values = keeperValuesFromRecord(record);
    if (!values.length) continue;

    const existing = keepers[owner.id].filter(Boolean);
    keepers[owner.id] = existing.concat(values).slice(0, 3);
    imported += values.length;
  }

  if (!imported) {
    if (!options.silent) alert("No keepers were imported. Use columns like owner, keeper1, keeper2, keeper3 or owner, player.");
    return 0;
  }
  state.keepers = keepers;
  saveState({ label: "Keepers imported" });
  if (!options.silent) {
    render();
    alert("Imported " + imported + " keeper" + (imported === 1 ? "" : "s") + ".");
  }
  return imported;
}

function renderKeepers() {
  els.keeperList.innerHTML = "";
  for (const owner of state.owners) {
    const row = document.createElement("div");
    row.className = "keeper-row";
    row.innerHTML = "<strong>" + escapeHtml(owner.owner) + "</strong>";
    const values = state.keepers[owner.id] || ["", "", ""];
    for (let i = 0; i < 3; i += 1) {
      const input = document.createElement("input");
      input.type = "text";
      input.setAttribute("list", "available-players");
      input.placeholder = "Keeper " + (i + 1);
      input.value = values[i] || "";
      input.addEventListener("input", () => {
        state.keepers[owner.id][i] = input.value;
        saveState({ label: "Keepers edited" });
        renderBoard();
        renderDashboard();
        renderPlayers();
        renderSelects();
      });
      row.append(input);
    }
    els.keeperList.append(row);
  }
}

function overallPickNumber(originalOwnerId, round) { const index = basePickIndexFor(originalOwnerId, round); return index == null ? null : index + 1; }
function pickNumberText(originalOwnerId, round) { const number = overallPickNumber(originalOwnerId, round); return number == null ? "" : "#" + number; }
function pickRef(originalOwnerId, round, year) { return originalOwnerId + "|" + round + (year === "next" ? "|next" : ""); }
function parsePickRef(ref) {
  const parts = ref.split("|");
  const pick = { originalOwnerId: parts[0], round: Number(parts[1]) };
  if (parts[2] === "next") pick.year = "next";
  return pick;
}
function playerRef(playerId) { return "player:" + playerId; }
function isPlayerRef(ref) { return ref.startsWith("player:"); }

// Next year's draft: order isn't known yet, so picks are named by round + original owner.
function nextDraftYear() {
  if (!state.nextDraftYear) state.nextDraftYear = new Date().getFullYear() + 1;
  return state.nextDraftYear;
}

function nextYearPickHolders() {
  const holders = new Map();
  for (const owner of state.owners) for (let round = 1; round <= ROUNDS; round += 1) holders.set(pickRef(owner.id, round, "next"), owner.id);
  for (const trade of state.pickTrades) {
    if (trade.type !== "package") continue;
    for (const pick of trade.aGives || []) if (pick.year === "next") holders.set(pickRef(pick.originalOwnerId, pick.round, "next"), trade.ownerBId);
    for (const pick of trade.bGives || []) if (pick.year === "next") holders.set(pickRef(pick.originalOwnerId, pick.round, "next"), trade.ownerAId);
  }
  return holders;
}

function nextYearPickHoldings() {
  const holders = nextYearPickHolders();
  const holdings = Object.fromEntries(state.owners.map((owner) => [owner.id, []]));
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const original of state.owners) {
      const ref = pickRef(original.id, round, "next");
      const holderId = holders.get(ref);
      if (holdings[holderId]) holdings[holderId].push({ originalOwnerId: original.id, round, year: "next", ref });
    }
  }
  return holdings;
}

function pickLabel(pick, holderId) {
  if (pick.year === "next") return nextDraftYear() + " R" + pick.round + (pick.originalOwnerId !== holderId ? " (" + ownerName(pick.originalOwnerId) + "'s)" : "");
  return "R" + pick.round + " (" + pickNumberText(pick.originalOwnerId, pick.round) + (pick.originalOwnerId !== holderId ? ", " + ownerName(pick.originalOwnerId) + "'s" : "") + ")";
}
function pickCountText(count) { return count + " pick" + (count === 1 ? "" : "s"); }

function currentPickHoldings() {
  const tradeMap = buildPickTradeMap();
  const schedule = computePickSchedule();
  const used = draftedPickMap();
  const holdings = Object.fromEntries(state.owners.map((owner) => [owner.id, []]));
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const original of state.owners) {
      const index = basePickIndexFor(original.id, round);
      if (index == null) continue;
      // Once a pick has been used, the player is what gets traded, not the pick.
      if (used.has(index) || keeperForScheduleIndex(schedule, index)) continue;
      const holderId = tradeMap.get(index) || original.id;
      if (holdings[holderId]) holdings[holderId].push({ originalOwnerId: original.id, round, ref: pickRef(original.id, round) });
    }
  }
  return holdings;
}

function renderTradePickGrid(side, ownerId, holdings, nextHoldings, roster) {
  const container = side === "a" ? els.tradePicksA : els.tradePicksB;
  const held = holdings[ownerId] || [];
  const nextHeld = nextHoldings[ownerId] || [];
  const validRefs = new Set(held.map((pick) => pick.ref).concat(nextHeld.map((pick) => pick.ref), roster.map((player) => playerRef(player.id))));
  for (const ref of Array.from(tradeSelection[side])) if (!validRefs.has(ref)) tradeSelection[side].delete(ref);
  const button = (ref, title, inner, extraClass = "") => {
    const selected = tradeSelection[side].has(ref);
    return "<button type=\"button\" class=\"trade-pick" + extraClass + (selected ? " is-selected" : "") + "\" data-side=\"" + side + "\" data-ref=\"" + escapeHtml(ref) + "\" aria-pressed=\"" + selected + "\" title=\"" + escapeHtml(title) + "\">" + inner + "</button>";
  };
  const group = (label, items) => "<div class=\"trade-group-label\">" + escapeHtml(label) + "</div>" + (items.length ? items.join("") : "<div class=\"empty-state\">None</div>");
  const thisYear = held.map((pick) => {
    const acquired = pick.originalOwnerId !== ownerId;
    return button(pick.ref, ownerName(pick.originalOwnerId) + "'s round " + pick.round + " pick, overall " + pickNumberText(pick.originalOwnerId, pick.round),
      "<strong>R" + pick.round + " <em>" + pickNumberText(pick.originalOwnerId, pick.round) + "</em></strong>" + (acquired ? "<span>" + escapeHtml(ownerName(pick.originalOwnerId)) + "</span>" : ""), acquired ? " acquired" : "");
  });
  const nextYear = nextHeld.map((pick) => {
    const acquired = pick.originalOwnerId !== ownerId;
    return button(pick.ref, nextDraftYear() + " " + ownerName(pick.originalOwnerId) + "'s round " + pick.round + " pick",
      "<strong>R" + pick.round + "</strong>" + (acquired ? "<span>" + escapeHtml(ownerName(pick.originalOwnerId)) + "</span>" : ""), " next-year" + (acquired ? " acquired" : ""));
  });
  const players = roster.map((player) => button(playerRef(player.id), player.player + (player.pos ? " \u00b7 " + player.pos : ""),
    "<strong>" + escapeHtml(player.player) + "</strong><span>" + escapeHtml([player.pos, player.keeper ? "Keeper" : "", player.acquiredFromId ? "from " + ownerName(player.acquiredFromId) : ""].filter(Boolean).join(" \u00b7 ")) + "</span>", " trade-player"));
  container.innerHTML = group("Players", players) + group("This year's picks", thisYear) + group(nextDraftYear() + " picks", nextYear);
}

function selectionCounts(side) {
  const refs = Array.from(tradeSelection[side]);
  const players = refs.filter(isPlayerRef).length;
  return { players, picks: refs.length - players };
}

function sendsText(counts) {
  const parts = [];
  if (counts.players) parts.push(counts.players + " player" + (counts.players === 1 ? "" : "s"));
  if (counts.picks || !counts.players) parts.push(pickCountText(counts.picks));
  return parts.join(" + ");
}

function renderTradeSummary() {
  const ownerAId = els.tradeOwnerA.value;
  const ownerBId = els.tradeOwnerB.value;
  const aCount = tradeSelection.a.size;
  const bCount = tradeSelection.b.size;
  const sameOwner = ownerAId === ownerBId;
  let text = ownerName(ownerAId) + " sends " + sendsText(selectionCounts("a")) + " \u00b7 " + ownerName(ownerBId) + " sends " + sendsText(selectionCounts("b"));
  if (sameOwner) text = "Choose two different owners.";
  else if (!aCount && !bCount) text = "Tap the players and picks each owner is sending.";
  els.tradeSummary.textContent = text;
  els.addTrade.disabled = sameOwner || (!aCount && !bCount);
  els.clearTrade.disabled = !aCount && !bCount;
}

function renderTradeControls() {
  const selectedA = els.tradeOwnerA.value || state.owners[0].id;
  const selectedB = els.tradeOwnerB.value || state.owners[1].id;
  els.tradeOwnerA.innerHTML = ownerOptions(selectedA);
  els.tradeOwnerB.innerHTML = ownerOptions(selectedB);
  els.tradeOwnerA.value = selectedA;
  els.tradeOwnerB.value = selectedB;
  const holdings = currentPickHoldings();
  const nextHoldings = nextYearPickHoldings();
  renderTradePickGrid("a", selectedA, holdings, nextHoldings, teamPlayers(selectedA));
  renderTradePickGrid("b", selectedB, holdings, nextHoldings, teamPlayers(selectedB));
  renderTradeSummary();
}

function tradePicksText(ownerId, picks, players) {
  const parts = (players || []).map((item) => item.name);
  const sorted = (picks || []).slice().sort((x, y) => (x.year === "next") - (y.year === "next") || x.round - y.round);
  for (const pick of sorted) parts.push(pickLabel(pick, ownerId));
  return parts.length ? parts.join(", ") : "nothing";
}

function tradeText(trade) {
  if (trade.type === "package") return ownerName(trade.ownerAId) + " sends " + tradePicksText(trade.ownerAId, trade.aGives, trade.aPlayers) + " \u00b7 " + ownerName(trade.ownerBId) + " sends " + tradePicksText(trade.ownerBId, trade.bGives, trade.bPlayers);
  const fromText = " R" + trade.fromRound + " (" + pickNumberText(trade.fromOwnerId, trade.fromRound) + ")";
  if (trade.type === "swap") return ownerName(trade.fromOwnerId) + fromText + " for " + ownerName(trade.toOwnerId) + " R" + trade.toRound + " (" + pickNumberText(trade.toOwnerId, trade.toRound) + ")";
  return ownerName(trade.fromOwnerId) + fromText + " to " + ownerName(trade.toOwnerId);
}

function tradeKindText(trade) {
  if (trade.type === "package") {
    const aCount = (trade.aGives || []).length + (trade.aPlayers || []).length;
    const bCount = (trade.bGives || []).length + (trade.bPlayers || []).length;
    const hasPlayers = (trade.aPlayers || []).length || (trade.bPlayers || []).length;
    const hasNext = (trade.aGives || []).concat(trade.bGives || []).some((pick) => pick.year === "next");
    const kind = hasPlayers ? "player trade" : hasNext ? "pick trade (includes " + nextDraftYear() + " picks)" : "pick trade";
    if (!aCount || !bCount) return "One-way " + kind;
    return aCount + "-for-" + bCount + " " + kind;
  }
  return trade.type === "swap" ? "Specific pick swap" : "One-way pick transfer";
}

function renderTrades() {
  renderTradeControls();
  if (!state.pickTrades.length) {
    els.tradeList.innerHTML = "<div class=\"empty-state\">No pick trades entered.</div>";
    return;
  }
  els.tradeList.innerHTML = "";
  // Show the most recent trade first so mistakes are easy to spot and remove.
  state.pickTrades.slice().reverse().forEach((trade) => {
    const row = document.createElement("div");
    row.className = "trade-row";
    row.innerHTML = "<div><strong>" + escapeHtml(tradeText(trade)) + "</strong><span>" + escapeHtml(tradeKindText(trade)) + "</span></div><button type=\"button\" data-trade-id=\"" + escapeHtml(trade.id) + "\">Remove</button>";
    row.querySelector("button").addEventListener("click", () => {
      state.pickTrades = state.pickTrades.filter((item) => item.id !== trade.id);
      saveState({ label: "Trade removed: " + tradeText(trade) });
      render();
    });
    els.tradeList.append(row);
  });
}

function renderPickMap() {
  if (!els.pickMapBody) return;
  const tradeMap = buildPickTradeMap();
  const owners = state.owners;
  const ownerIndex = new Map(owners.map((owner, index) => [owner.id, index]));
  const grid = owners.map(() => Array.from({ length: ROUNDS }, () => []));

  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const original of owners) {
      const index = basePickIndexFor(original.id, round);
      if (index == null) continue;
      const currentOwnerId = tradeMap.get(index) || original.id;
      const rowIndex = ownerIndex.get(currentOwnerId);
      if (rowIndex == null) continue;
      grid[rowIndex][round - 1].push({ name: original.owner, self: original.id === currentOwnerId, number: index + 1 });
    }
  }

  els.pickMapBody.innerHTML = owners.map((owner, rowIndex) => {
    let total = 0;
    const cells = grid[rowIndex].map((entries) => {
      total += entries.length;
      if (!entries.length) return "<td class=\"pick-map-cell empty\" title=\"Traded away\">—</td>";
      const hasGained = entries.some((entry) => !entry.self);
      const html = entries.slice().sort((a, b) => Number(b.self) - Number(a.self) || a.number - b.number).map((entry) => entry.self
        ? "<span class=\"pick-map-num\" title=\"Own pick, overall #" + entry.number + "\">#" + entry.number + "</span>"
        : "<span class=\"pick-map-gained\" title=\"From " + escapeHtml(entry.name) + ", overall #" + entry.number + "\">" + escapeHtml(entry.name) + " <span class=\"pick-map-chip-num\">#" + entry.number + "</span></span>").join("");
      return "<td class=\"pick-map-cell" + (hasGained ? " has-gained" : "") + "\"><div class=\"pick-map-stack\">" + html + "</div></td>";
    }).join("");
    const totalClass = total > ROUNDS ? " over" : total < ROUNDS ? " under" : "";
    return "<tr><th scope=\"row\">" + escapeHtml(owner.owner) + "</th>" + cells + "<td class=\"pick-map-total" + totalClass + "\">" + total + "</td></tr>";
  }).join("");
}

function renderNextYearPickMap() {
  if (!els.pickMapNextBody) return;
  const holders = nextYearPickHolders();
  if (els.pickMapNextTitle) els.pickMapNextTitle.textContent = nextDraftYear() + " Picks";
  els.pickMapNextBody.innerHTML = state.owners.map((owner) => {
    let total = 0;
    const cells = [];
    for (let round = 1; round <= ROUNDS; round += 1) {
      const entries = state.owners.filter((original) => holders.get(pickRef(original.id, round, "next")) === owner.id);
      total += entries.length;
      if (!entries.length) { cells.push("<td class=\"pick-map-cell empty\" title=\"Traded away\">\u2014</td>"); continue; }
      const gained = entries.some((original) => original.id !== owner.id);
      const html = entries.slice().sort((x, y) => Number(y.id === owner.id) - Number(x.id === owner.id)).map((original) => original.id === owner.id
        ? "<span class=\"pick-map-num\" title=\"Own pick\">Own</span>"
        : "<span class=\"pick-map-gained\" title=\"From " + escapeHtml(original.owner) + "\">" + escapeHtml(original.owner) + "</span>").join("");
      cells.push("<td class=\"pick-map-cell" + (gained ? " has-gained" : "") + "\"><div class=\"pick-map-stack\">" + html + "</div></td>");
    }
    const totalClass = total > ROUNDS ? " over" : total < ROUNDS ? " under" : "";
    return "<tr><th scope=\"row\">" + escapeHtml(owner.owner) + "</th>" + cells.join("") + "<td class=\"pick-map-total" + totalClass + "\">" + total + "</td></tr>";
  }).join("");
}

function normalizeTradeType(value) {
  const tradeType = key(value);
  if (["transfer", "one-way", "one way", "move"].includes(tradeType)) return "transfer";
  return "swap";
}

function tradeFromRecord(record) {
  const type = normalizeTradeType(readColumn(record, ["type", "trade type", "kind"]));
  const fromOwner = ownerFromValue(readColumn(record, ["from_owner", "from owner", "giving_owner", "giving owner", "from", "owner", "giving"]));
  const toOwner = ownerFromValue(readColumn(record, ["to_owner", "to owner", "receiving_owner", "receiving owner", "to", "recipient", "receiving"]));
  const fromRounds = parseRoundList(readColumn(record, ["from_round", "from round", "giving_round", "giving round", "round", "giving pick", "from pick", "from_rounds", "from rounds"]));
  const toRounds = parseRoundList(readColumn(record, ["to_round", "to round", "receiving_round", "receiving round", "receiving pick", "to pick", "to_rounds", "to rounds"]));
  const fromRound = fromRounds[0] || 0;
  const toRound = toRounds[0] || 0;

  if (fromOwner && toOwner && fromOwner.id !== toOwner.id && (fromRounds.length > 1 || toRounds.length > 1)) {
    return { id: crypto.randomUUID(), type: "package", ownerAId: fromOwner.id, ownerBId: toOwner.id, aGives: fromRounds.map((round) => ({ originalOwnerId: fromOwner.id, round })), bGives: type === "swap" ? toRounds.map((round) => ({ originalOwnerId: toOwner.id, round })) : [] };
  }
  if (!fromOwner || !toOwner || fromOwner.id === toOwner.id || !fromRound || (type === "swap" && !toRound)) return null;
  return { id: crypto.randomUUID(), type, fromOwnerId: fromOwner.id, fromRound, toOwnerId: toOwner.id, toRound: type === "swap" ? toRound : null };
}

function parseRoundList(value) {
  return normalize(value).split(/[^0-9]+/).map(Number).filter((round) => round > 0 && round <= ROUNDS);
}

function tradeKey(trade) {
  if (trade.type === "package") {
    const refs = (picks) => (picks || []).map((pick) => pickRef(pick.originalOwnerId, pick.round, pick.year)).sort().join(",");
    const ids = (players) => (players || []).map((item) => item.playerId).sort().join(",");
    return ["package", trade.ownerAId, refs(trade.aGives), ids(trade.aPlayers), trade.ownerBId, refs(trade.bGives), ids(trade.bPlayers)].join("|");
  }
  return [trade.type, trade.fromOwnerId, trade.fromRound, trade.toOwnerId, trade.toRound || ""].join("|");
}

function dedupeTrades(trades) {
  const seen = new Set();
  return trades.filter((trade) => {
    const id = tradeKey(trade);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function tradeMatrixRecords(text, options = {}) {
  const rows = parseCsv(text);
  const headers = (rows.shift() || []).map((header) => normalize(header));
  const roundColumns = headers.map((header, index) => ({ index, round: toNumber(header) })).filter((item) => item.round > 0);
  if (!roundColumns.length) return [];

  const trades = [];
  for (const row of rows) {
    const receivingOwner = ownerFromValue(row[0]);
    if (!receivingOwner) continue;

    for (const column of roundColumns) {
      const owners = normalize(row[column.index]).split(",").map((item) => ownerFromValue(item)).filter(Boolean);
      for (const originalOwner of owners) {
        if (originalOwner.id === receivingOwner.id) continue;
        trades.push({ id: crypto.randomUUID(), type: "transfer", fromOwnerId: originalOwner.id, fromRound: column.round, toOwnerId: receivingOwner.id, toRound: null, source: options.source || null });
      }
    }
  }

  return trades;
}

function importTrades(text, options = {}) {
  if (!options.silent && state.picks.length && !confirm("Importing trades after picks exist can make the board confusing. Import them anyway?")) return 0;

  const source = options.source || null;
  const transactionTrades = csvRecords(text).map(tradeFromRecord).filter(Boolean).map((trade) => ({ ...trade, source }));
  const trades = transactionTrades.length ? transactionTrades : tradeMatrixRecords(text, { source });
  if (!trades.length) {
    if (!options.silent) alert("No trades were imported. Use a pick matrix like your trades.csv or columns like type, from_owner, from_round, to_owner, to_round (list several rounds like 4;6;8 for multi-pick trades).");
    return 0;
  }

  const existing = options.replaceSource ? state.pickTrades.filter((trade) => trade.source !== source) : state.pickTrades;
  // Keep trades stored oldest-first so later trades apply on top of earlier ones.
  // Baseline trades.csv stays at the front; other imports are appended as the newest.
  state.pickTrades = dedupeTrades(options.replaceSource ? trades.concat(existing) : existing.concat(trades));
  saveState({ label: "Trades imported" });
  if (!options.silent) {
    render();
    alert("Imported " + trades.length + " trade" + (trades.length === 1 ? "" : "s") + ".");
  }
  return trades.length;
}

function addTradeFromForm() {
  const ownerAId = els.tradeOwnerA.value;
  const ownerBId = els.tradeOwnerB.value;
  if (ownerAId === ownerBId) return alert("Pick trades need two different owners.");
  const rostered = new Map(rosteredPlayers().map((player) => [player.id, player]));
  const split = (side) => {
    const refs = Array.from(tradeSelection[side]);
    const picks = refs.filter((ref) => !isPlayerRef(ref)).map(parsePickRef).sort((x, y) => (x.year === "next") - (y.year === "next") || x.round - y.round);
    const players = refs.filter(isPlayerRef).map((ref) => ref.slice(7)).map((playerId) => ({ playerId, name: rostered.get(playerId) ? rostered.get(playerId).player : playerId }));
    return { picks, players };
  };
  const a = split("a");
  const b = split("b");
  if (!a.picks.length && !b.picks.length && !a.players.length && !b.players.length) return alert("Select at least one player or pick to trade.");
  const movesThisYearPicks = a.picks.concat(b.picks).some((pick) => pick.year !== "next");
  if (movesThisYearPicks && state.picks.length && !confirm("This trade moves picks in the current draft. Add it?")) return;
  const trade = { id: crypto.randomUUID(), type: "package", ownerAId, ownerBId, aGives: a.picks, bGives: b.picks, aPlayers: a.players, bPlayers: b.players, addedAt: new Date().toISOString() };
  state.pickTrades.push(trade);
  tradeSelection = { a: new Set(), b: new Set() };
  saveState({ label: "Trade added: " + tradeText(trade) });
  render();
}

function renderSelects() {
  els.ownerSelect.innerHTML = ownerOptions(state.selectedOwnerId);
  els.pickOwner.innerHTML = ownerOptions(ownerForNextPick() ? ownerForNextPick().id : state.owners[0].id);
  if (!state.owners.some((owner) => owner.id === state.selectedOwnerId)) state.selectedOwnerId = state.owners[0] ? state.owners[0].id : "";
  els.ownerSelect.value = state.selectedOwnerId;
  els.pickOwner.value = ownerForNextPick() ? ownerForNextPick().id : (state.owners[0] ? state.owners[0].id : "");
}

// ---- Player portraits -------------------------------------------------
// headshots.json maps a normalized player name to their NBA.com person ID.
// Images load straight from the NBA's public headshot CDN; if a player has no
// ID (or the image fails) we show their initials instead.
// A players.csv column named NBA_ID overrides the lookup for any player.
const HEADSHOT_URL = "https://cdn.nba.com/headshots/nba/latest/260x190/";
let headshotIds = {};

function headshotKey(name) {
  return String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[.'’]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z]+/g, " ").trim();
}

function playerInitials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function playerPortraitHtml(player) {
  if (!player) return "";
  const nbaId = player.nbaId || headshotIds[headshotKey(player.player)];
  const initials = "<span class=\"portrait-initials\">" + escapeHtml(playerInitials(player.player)) + "</span>";
  const img = nbaId ? "<img src=\"" + HEADSHOT_URL + encodeURIComponent(nbaId) + ".png\" alt=\"\" loading=\"lazy\" onerror=\"this.remove()\">" : "";
  return "<span class=\"player-portrait\" aria-hidden=\"true\">" + initials + img + "</span>";
}

// Board label: full name on one line, with team and position underneath ("SA · PF/C").
// fitPlayerNames() shrinks the font for long names so they never wrap.
function boardPlayerMeta(player) {
  const team = normalize(player.team).toUpperCase();
  const pos = normalize(player.pos) === "Keeper" ? "" : normalize(player.pos).split(/\s*[,/]\s*/).filter(Boolean).join("/");
  return [team, pos].filter(Boolean).join(" \u00b7 ");
}

function pickPlayerHtml(player, label) {
  if (!player) return "<div class=\"pick-player-row\"><div class=\"pick-player\">" + escapeHtml(label) + "</div></div>";
  return "<div class=\"pick-player-row\">" + playerPortraitHtml(player) + "<div class=\"pick-player-text\"><div class=\"pick-player\" title=\"" + escapeHtml(player.player) + "\">" + escapeHtml(player.player) + "</div><div class=\"pick-player-meta\">" + escapeHtml(boardPlayerMeta(player)) + "</div></div></div>";
}

async function loadHeadshotIds() {
  try {
    const response = await fetch("headshots.json");
    if (!response.ok) return;
    headshotIds = await response.json();
    render();
  } catch (error) {
    // No portraits available: the board still works with initials.
  }
}

const NAME_FONT_MAX = 15.2; // px, matches 0.95rem
const NAME_FONT_MIN = 10.5;
function fitPlayerNames(root = document) {
  root.querySelectorAll(".pick-player-text .pick-player").forEach((el) => {
    el.style.fontSize = "";
    if (!el.clientWidth) return; // hidden tab: fitted when it is shown
    // Measure the real (sub-pixel) text width; scrollWidth rounds and can miss a 1px overflow.
    const range = document.createRange();
    range.selectNodeContents(el);
    const tooWide = () => range.getBoundingClientRect().width > el.clientWidth - 1;
    let size = NAME_FONT_MAX;
    while (tooWide() && size > NAME_FONT_MIN) {
      size -= 0.5;
      el.style.fontSize = size + "px";
    }
  });
}

let fitNamesTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(fitNamesTimer);
  fitNamesTimer = setTimeout(() => fitPlayerNames(), 120);
});
// Re-fit once web fonts finish loading, since they change text width.
if (document.fonts) {
  if (document.fonts.ready) document.fonts.ready.then(() => fitPlayerNames());
  if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => fitPlayerNames());
}

function renderBoard() {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const schedule = computePickSchedule();
  const picks = draftedPickMap();
  const keeperCount = allKeeperPlayers().length;
  const playerOwners = currentPlayerOwners();
  els.draftBoard.innerHTML = "";
  els.draftCount.textContent = (state.picks.length + keeperCount) + " filled / " + schedule.length + " picks";
  const nextSlot = currentSchedulePick();
  els.nextPickLabel.textContent = hasDraftOrder() ? (nextSlot ? "Pick " + nextSlot.pick : "Draft full") : "Set order";
  for (let i = 0; i < schedule.length; i += 1) {
    const slot = schedule[i];
    const pick = picks.get(i);
    const keeper = keeperForScheduleIndex(schedule, i);
    const owner = pick ? ownerById(pick.ownerId) : ownerById(slot.ownerId);
    const originalOwner = ownerById(slot.originalOwnerId);
    const player = keeper || (pick ? byId.get(pick.playerId) : null);
    const card = document.createElement("article");
    card.className = "pick-card" + (player || slot.skipped ? "" : " empty") + (keeper ? " keeper" : "") + (slot.traded ? " traded" : "") + (slot.compensation ? " compensation" : "") + (slot.skipped ? " skipped" : "");
    card.innerHTML = pickCardHtml(slot, i, pick, keeper, player, false, playerOwners);
    els.draftBoard.append(card);
  }
  fitPlayerNames(els.draftBoard);
}

// playerId -> owner who has the player now (after player trades).
function currentPlayerOwners() {
  return new Map(rosteredPlayers().map((player) => [player.id, player.currentOwnerId]));
}

function pickCardHtml(slot, index, pick, keeper, player, compact = false, playerOwners = null) {
  const owner = pick ? ownerById(pick.ownerId) : ownerById(slot.ownerId);
  const originalOwner = ownerById(slot.originalOwnerId);
  let ownerLine = slot.traded ? escapeHtml(owner.team) + " <span>from " + escapeHtml(originalOwner.team) + "</span>" : escapeHtml(owner.team);
  const playerId = keeper ? keeper.playerId : (player ? player.id : null);
  const nowOwnerId = playerId && playerOwners ? playerOwners.get(playerId) : null;
  if (nowOwnerId && nowOwnerId !== owner.id) ownerLine += " <span class=\"pick-traded-to\">\u2192 " + escapeHtml(ownerName(nowOwnerId)) + "</span>";
  const playerName = slot.skipped ? "Roster Full" : (player ? player.player : "Available");
  return "<div class=\"pick-meta\"><span>" + escapeHtml(slot.roundLabel) + "</span><span>Pick " + (index + 1) + "</span></div>" + pickPlayerHtml(slot.skipped ? null : player, playerName) + "<div class=\"pick-owner\">" + ownerLine + "</div>";
}

function renderOwnerDraftBoard(ownerId) {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const schedule = computePickSchedule();
  const picks = draftedPickMap();
  const nextIndex = nextOpenScheduleIndex();
  const rounds = new Map();
  els.ownerDraftBoard.innerHTML = "";
  const playerOwners = currentPlayerOwners();
  els.ownerBoardCount.textContent = (state.picks.length + allKeeperPlayers().length) + " filled";

  for (let i = 0; i < schedule.length; i += 1) {
    const slot = schedule[i];
    if (!rounds.has(slot.roundLabel)) rounds.set(slot.roundLabel, []);
    rounds.get(slot.roundLabel).push({ slot, index: i });
  }

  for (const [roundLabel, slots] of rounds) {
    const row = document.createElement("section");
    row.className = "owner-board-round";
    row.innerHTML = "<div class=\"owner-board-round-title\"><strong>" + escapeHtml(roundLabel) + "</strong><span>" + slots.length + " picks</span></div><div class=\"owner-board-round-picks\"></div>";
    const picksWrap = row.querySelector(".owner-board-round-picks");

    for (const { slot, index } of slots) {
      const pick = picks.get(index);
      const keeper = keeperForScheduleIndex(schedule, index);
      const player = keeper || (pick ? byId.get(pick.playerId) : null);
      const card = document.createElement("article");
      card.className = "pick-card owner-board-card" + (player || slot.skipped ? "" : " empty") + (keeper ? " keeper" : "") + (slot.traded ? " traded" : "") + (slot.compensation ? " compensation" : "") + (slot.skipped ? " skipped" : "") + (index === nextIndex ? " on-clock-card" : "") + (slot.ownerId === ownerId ? " my-pick-card" : "");
      card.innerHTML = pickCardHtml(slot, index, pick, keeper, player, true, playerOwners);
      picksWrap.append(card);
    }

    els.ownerDraftBoard.append(row);
  }
  fitPlayerNames(els.ownerDraftBoard);
}

// ---- League tools (Luis's page) ----------------------------------------
// Team output = each roster's per-game projection: counting stats are summed,
// FG%/FT% are total makes / total attempts. Teams are compared category by
// category, 9-cat head-to-head style (lower TO wins).
const LEAGUE_CATS = [
  { key: "fg_pct", label: "FG%", pct: true },
  { key: "ft_pct", label: "FT%", pct: true },
  { key: "threepm", label: "3PM" },
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "to", label: "TO", lowerWins: true }
];
let leagueH2hPair = null;

function teamOutput(owner) {
  const roster = teamPlayers(owner.id);
  const out = { owner, players: roster.length, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, threepm: 0 };
  let fgm = 0, fga = 0, ftm = 0, fta = 0, fgSum = 0, fgCount = 0, ftSum = 0, ftCount = 0;
  for (const player of roster) {
    for (const stat of ["pts", "reb", "ast", "stl", "blk", "to", "threepm"]) out[stat] += Number(player[stat]) || 0;
    fgm += Number(player.fgm) || 0; fga += Number(player.fga) || 0;
    ftm += Number(player.ftm) || 0; fta += Number(player.fta) || 0;
    if (player.fg_pct) { fgSum += Number(player.fg_pct); fgCount += 1; }
    if (player.ft_pct) { ftSum += Number(player.ft_pct); ftCount += 1; }
  }
  // Fall back to a simple average if the player list has no makes/attempts.
  out.fg_pct = fga ? fgm / fga : (fgCount ? fgSum / fgCount : 0);
  out.ft_pct = fta ? ftm / fta : (ftCount ? ftSum / ftCount : 0);
  out.fgm = fgm; out.fga = fga; out.ftm = ftm; out.fta = fta;
  return out;
}

function catValue(team, cat) {
  return Math.round((team[cat.key] || 0) * (cat.pct ? 10000 : 100));
}

function compareTeams(a, b) {
  const result = { wins: 0, losses: 0, ties: 0, cats: [] };
  for (const cat of LEAGUE_CATS) {
    const av = catValue(a, cat), bv = catValue(b, cat);
    let edge = 0;
    if (av !== bv) edge = (cat.lowerWins ? av < bv : av > bv) ? 1 : -1;
    if (edge > 0) result.wins += 1; else if (edge < 0) result.losses += 1; else result.ties += 1;
    result.cats.push(edge);
  }
  return result;
}

function categoryRanks(teams) {
  const ranks = new Map(teams.map((team) => [team.owner.id, {}]));
  for (const cat of LEAGUE_CATS) {
    const sorted = teams.slice().sort((a, b) => cat.lowerWins ? catValue(a, cat) - catValue(b, cat) : catValue(b, cat) - catValue(a, cat));
    sorted.forEach((team, index) => {
      const prev = sorted[index - 1];
      const rank = prev && catValue(prev, cat) === catValue(team, cat) ? ranks.get(prev.owner.id)[cat.key] : index + 1;
      ranks.get(team.owner.id)[cat.key] = rank;
    });
  }
  for (const [, r] of ranks) r.avg = LEAGUE_CATS.reduce((sum, cat) => sum + r[cat.key], 0) / LEAGUE_CATS.length;
  return ranks;
}

function fmtCat(team, cat) {
  const value = team[cat.key] || 0;
  return cat.pct ? value.toFixed(3).replace(/^0/, "") : value.toFixed(1);
}

function rankStyle(rank, count) {
  // 1st = green, last = red, soft tint so text stays readable.
  const t = count > 1 ? (rank - 1) / (count - 1) : 0;
  const hue = Math.round(140 - 140 * t);
  return " style=\"background: hsl(" + hue + " 65% 88%)\"";
}

function recordText(r) {
  return r.wins + "-" + r.losses + (r.ties ? "-" + r.ties : "");
}

function renderLeagueTools(myOwnerId) {
  if (!els.leagueOutput) return;
  const teams = state.owners.map(teamOutput);
  const count = teams.length;
  const ranks = categoryRanks(teams);
  const mine = (team) => team.owner.id === myOwnerId ? " class=\"league-mine\"" : "";
  const catHeads = LEAGUE_CATS.map((cat) => "<th>" + cat.label + "</th>").join("");

  // Head-to-head record of every team against every other team.
  const records = new Map(teams.map((team) => [team.owner.id, { mw: 0, ml: 0, mt: 0, cw: 0, cl: 0, ct: 0 }]));
  const grid = new Map();
  for (const a of teams) {
    for (const b of teams) {
      if (a === b) continue;
      const r = compareTeams(a, b);
      grid.set(a.owner.id + "|" + b.owner.id, r);
      const rec = records.get(a.owner.id);
      rec.cw += r.wins; rec.cl += r.losses; rec.ct += r.ties;
      if (r.wins > r.losses) rec.mw += 1; else if (r.wins < r.losses) rec.ml += 1; else rec.mt += 1;
    }
  }

  // 1) Team output
  const byOutput = teams.slice().sort((a, b) => ranks.get(a.owner.id).avg - ranks.get(b.owner.id).avg);
  els.leagueOutput.innerHTML = "<thead><tr><th>Team</th><th>Players</th>" + catHeads + "</tr></thead><tbody>" + byOutput.map((team) =>
    "<tr" + mine(team) + "><td><strong>" + escapeHtml(team.owner.owner) + "</strong></td><td>" + team.players + "</td>" +
    LEAGUE_CATS.map((cat) => "<td" + (cat.pct && team.fga ? " title=\"" + (cat.key === "fg_pct" ? team.fgm.toFixed(1) + "/" + team.fga.toFixed(1) : team.ftm.toFixed(1) + "/" + team.fta.toFixed(1)) + "\"" : "") + ">" + fmtCat(team, cat) + "</td>").join("") + "</tr>").join("") + "</tbody>";

  // 2) Category ranks
  els.leagueRanks.innerHTML = "<thead><tr><th>Team</th>" + catHeads + "<th>Avg Rank</th></tr></thead><tbody>" + byOutput.map((team) => {
    const r = ranks.get(team.owner.id);
    return "<tr" + mine(team) + "><td><strong>" + escapeHtml(team.owner.owner) + "</strong></td>" +
      LEAGUE_CATS.map((cat) => "<td class=\"league-rank\"" + rankStyle(r[cat.key], count) + ">" + r[cat.key] + "</td>").join("") +
      "<td><strong>" + r.avg.toFixed(1) + "</strong></td></tr>";
  }).join("") + "</tbody>";

  // 3) Matchup grid, best record first
  const byRecord = teams.slice().sort((a, b) => {
    const ra = records.get(a.owner.id), rb = records.get(b.owner.id);
    return (rb.mw + rb.mt / 2) - (ra.mw + ra.mt / 2) || (rb.cw - rb.cl) - (ra.cw - ra.cl);
  });
  els.leagueMatrix.innerHTML = "<thead><tr><th>Team \\ vs</th>" + byRecord.map((team) => "<th>" + escapeHtml(team.owner.owner) + "</th>").join("") + "<th>Matchups</th><th>Cats</th></tr></thead><tbody>" +
    byRecord.map((a) => {
      const rec = records.get(a.owner.id);
      return "<tr" + mine(a) + "><td><strong>" + escapeHtml(a.owner.owner) + "</strong></td>" + byRecord.map((b) => {
        if (a === b) return "<td class=\"league-cell self\">&mdash;</td>";
        const r = grid.get(a.owner.id + "|" + b.owner.id);
        const cls = r.wins > r.losses ? "win" : r.wins < r.losses ? "loss" : "tie";
        return "<td class=\"league-cell " + cls + "\" data-a=\"" + a.owner.id + "\" data-b=\"" + b.owner.id + "\" title=\"" + escapeHtml(a.owner.owner + " vs " + b.owner.owner + ": " + recordText(r)) + "\">" + recordText(r) + "</td>";
      }).join("") + "<td><strong>" + rec.mw + "-" + rec.ml + (rec.mt ? "-" + rec.mt : "") + "</strong></td><td>" + rec.cw + "-" + rec.cl + (rec.ct ? "-" + rec.ct : "") + "</td></tr>";
    }).join("") + "</tbody>";

  // 4) Head to head detail
  const ids = state.owners.map((owner) => owner.id);
  if (!leagueH2hPair || !ids.includes(leagueH2hPair[0]) || !ids.includes(leagueH2hPair[1])) {
    leagueH2hPair = [myOwnerId, ids.find((id) => id !== myOwnerId)];
  }
  els.leagueH2hA.innerHTML = ownerOptions(leagueH2hPair[0]);
  els.leagueH2hB.innerHTML = ownerOptions(leagueH2hPair[1]);
  els.leagueH2hA.value = leagueH2hPair[0];
  els.leagueH2hB.value = leagueH2hPair[1];
  const a = teams.find((team) => team.owner.id === leagueH2hPair[0]);
  const b = teams.find((team) => team.owner.id === leagueH2hPair[1]);
  if (a === b) {
    els.leagueH2h.innerHTML = "";
    els.leagueH2hResult.textContent = "Pick two different teams.";
    return;
  }
  const r = compareTeams(a, b);
  els.leagueH2h.innerHTML = "<thead><tr><th>Category</th><th>" + escapeHtml(a.owner.owner) + "</th><th>" + escapeHtml(b.owner.owner) + "</th><th>Edge</th></tr></thead><tbody>" +
    LEAGUE_CATS.map((cat, i) => {
      const edge = r.cats[i];
      return "<tr><td><strong>" + cat.label + "</strong>" + (cat.lowerWins ? " <span class=\"league-note\">(lower wins)</span>" : "") + "</td><td class=\"" + (edge > 0 ? "h2h-win" : "") + "\">" + fmtCat(a, cat) + "</td><td class=\"" + (edge < 0 ? "h2h-win" : "") + "\">" + fmtCat(b, cat) + "</td><td>" + (edge > 0 ? escapeHtml(a.owner.owner) : edge < 0 ? escapeHtml(b.owner.owner) : "Tie") + "</td></tr>";
    }).join("") + "</tbody>";
  const verdict = r.wins > r.losses ? a.owner.owner + " wins " : r.wins < r.losses ? b.owner.owner + " wins " : "Tied ";
  els.leagueH2hResult.textContent = verdict + Math.max(r.wins, r.losses) + "-" + Math.min(r.wins, r.losses) + (r.ties ? "-" + r.ties : "");
}

function setOwnerTab(tab) {
  const owner = ownerFromUrl();
  const allowed = ["board", "pool", "roster"].concat(owner && ownerHasAdminPowers(owner) ? ["league", "history"] : []);
  const previous = activeOwnerTab;
  activeOwnerTab = allowed.includes(tab) ? tab : "board";
  if (activeOwnerTab === "history" && (previous !== "history" || historyEntries === null)) loadHistory();
  document.querySelectorAll(".owner-tab").forEach((button) => {
    const active = button.dataset.ownerTab === activeOwnerTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".owner-tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.ownerPanel !== activeOwnerTab;
  });
  fitPlayerNames();
}

function setSetupTab(tab) {
  activeSetupTab = ["order", "keepers", "trades", "map", "pages"].includes(tab) ? tab : "order";
  document.querySelectorAll(".setup-tab").forEach((button) => {
    const active = button.dataset.setupTab === activeSetupTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".setup-tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.setupPanel !== activeSetupTab;
  });
}

function statText(player, stat, digits = 1) {
  const value = Number(player[stat]) || 0;
  return value.toFixed(digits);
}

function renderOwnerRoster(defaultOwnerId) {
  const selectedOwnerId = state.owners.some((owner) => owner.id === ownerRosterViewId) ? ownerRosterViewId : defaultOwnerId;
  ownerRosterViewId = selectedOwnerId;
  const rosterOwner = ownerById(selectedOwnerId);
  const roster = rosterOwner ? teamPlayers(rosterOwner.id) : [];
  els.ownerRosterSelect.innerHTML = ownerOptions(selectedOwnerId);
  els.ownerRosterSelect.value = selectedOwnerId;
  els.ownerRosterCount.textContent = roster.length + " player" + (roster.length === 1 ? "" : "s");
  els.ownerRosterBody.innerHTML = roster.length ? roster.map((player) => {
    const pickLabel = player.keeper ? "K" : (player.pickIndex == null ? "-" : "Pick " + (player.pickIndex + 1));
    return "<tr><td>" + pickLabel + "</td><td>" + escapeHtml(player.player) + (player.keeper ? " <strong>(K)</strong>" : "") + (player.acquiredFromId ? " <span class=\"roster-trade-tag\">via trade from " + escapeHtml(ownerName(player.acquiredFromId)) + "</span>" : "") + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + statText(player, "pts") + "</td><td>" + statText(player, "ast") + "</td><td>" + statText(player, "stl") + "</td><td>" + statText(player, "reb") + "</td><td>" + statText(player, "blk") + "</td><td>" + statText(player, "to") + "</td><td>" + statText(player, "fg_pct", 3) + "</td><td>" + statText(player, "ft_pct", 3) + "</td><td>" + statText(player, "threepm") + "</td>" + totalCellHtml(player) + "</tr>";
  }).join("") : "<tr><td class=\"empty-state\" colspan=\"13\">No players drafted yet.</td></tr>";
}

function renderDashboard() {
  const owner = ownerById(state.selectedOwnerId);
  const roster = owner ? teamPlayers(owner.id) : [];
  if (els.dashboardOwner) els.dashboardOwner.textContent = owner ? owner.team : "No team";
  const totals = roster.reduce((acc, player) => {
    acc.pts += player.pts || 0; acc.reb += player.reb || 0; acc.ast += player.ast || 0; acc.stl += player.stl || 0; acc.blk += player.blk || 0; acc.to += player.to || 0; acc.fg_pct += player.fg_pct || 0; acc.ft_pct += player.ft_pct || 0; acc.threepm += player.threepm || 0;
    return acc;
  }, { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fg_pct: 0, ft_pct: 0, threepm: 0 });
  const playerCount = Math.max(roster.length, 1);
  const metrics = [["Players", roster.length], ["Keepers", roster.filter((player) => player.keeper).length], ["PTS", totals.pts.toFixed(1)], ["AST", totals.ast.toFixed(1)], ["STL", totals.stl.toFixed(1)], ["REB", totals.reb.toFixed(1)], ["BLK", totals.blk.toFixed(1)], ["TO", totals.to.toFixed(1)], ["FG%", (totals.fg_pct / playerCount).toFixed(3)], ["FT%", (totals.ft_pct / playerCount).toFixed(3)], ["3PM", totals.threepm.toFixed(1)]];
  els.teamSummary.innerHTML = metrics.map(([label, value]) => "<div class=\"metric\"><span>" + label + "</span><strong>" + value + "</strong></div>").join("") + "<div class=\"position-summary\"><span>Positions</span><div>" + positionSummaryHtml(roster) + "</div></div>";
  els.teamRoster.innerHTML = roster.length ? roster.map((player) => "<tr><td>" + escapeHtml(player.player) + (player.keeper ? " <strong>(K)</strong>" : "") + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + (player.rank || "") + "</td></tr>").join("") : "<tr><td class=\"empty-state\" colspan=\"4\">No players drafted yet.</td></tr>";
}

function renderPlayers() {
  const players = availablePlayers();
  els.playerCount.textContent = players.length + " available";
  els.availablePlayers.innerHTML = players.slice(0, 300).map((player) => "<option value=\"" + escapeHtml(player.player) + "\"></option>").join("");
  els.playersBody.innerHTML = players.length ? players.slice(0, 300).map((player) => "<tr><td>" + (player.rank || "") + "</td><td>" + escapeHtml(player.player) + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + player.pts.toFixed(1) + "</td><td>" + player.ast.toFixed(1) + "</td><td>" + player.stl.toFixed(1) + "</td><td>" + player.reb.toFixed(1) + "</td><td>" + player.blk.toFixed(1) + "</td><td>" + player.to.toFixed(1) + "</td><td>" + player.fg_pct.toFixed(3) + "</td><td>" + player.ft_pct.toFixed(3) + "</td><td>" + player.threepm.toFixed(1) + "</td>" + totalCellHtml(player) + "</tr>").join("") : "<tr><td class=\"empty-state\" colspan=\"13\">Import a player CSV to fill the board.</td></tr>";
}

function lastDraftedPick() {
  return state.picks.length ? state.picks[state.picks.length - 1] : null;
}

function draftedPickDescription(pick) {
  const player = state.players.find((item) => item.id === pick.playerId);
  return "Pick " + pick.pick + ": " + ownerName(pick.ownerId) + " took " + (player ? player.player : "a player");
}

function undoLastPick() {
  const last = lastDraftedPick();
  if (!last) return alert("There are no picks to undo.");
  const description = draftedPickDescription(last);
  if (!confirm("Undo " + description + "?\n\nThat player goes back in the pool and " + ownerName(last.ownerId) + " is on the clock again.")) return;
  state.picks.pop();
  saveState({ label: "Undid " + description });
  render();
}

function renderAdminUndo() {
  const last = lastDraftedPick();
  els.ownerAdminUndo.disabled = !last;
  els.ownerAdminUndo.textContent = last ? "Undo Pick " + last.pick : "Undo Last Pick";
  els.ownerAdminUndo.title = last ? "Undo " + draftedPickDescription(last) : "No picks to undo yet";
}

function historyTabOpen() {
  const owner = ownerFromUrl();
  return Boolean(owner && ownerHasAdminPowers(owner) && activeOwnerTab === "history");
}

function historyTimeParts(iso) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date().toDateString() === date.toDateString();
  return { time, day: today ? "Today" : date.toLocaleDateString([], { month: "short", day: "numeric" }) };
}

async function loadHistory() {
  if (!serverSyncEnabled) {
    historyEntries = [];
    historyError = "History is saved by the shared server, so it isn't available in offline mode.";
    renderHistory();
    return;
  }
  if (historyLoading) return;
  historyLoading = true;
  try {
    const response = await fetch("/api/history", { cache: "no-store", headers: adminHeaders() });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load history.");
    historyEntries = payload.entries || [];
    historyError = "";
  } catch (error) {
    historyError = "Could not load the history right now. Check the connection and press Refresh.";
  }
  historyLoading = false;
  renderHistory();
}

function renderHistory() {
  if (!els.historyList) return;
  if (historyError) {
    els.historyCount.textContent = "Unavailable";
    els.historyList.innerHTML = "<div class=\"empty-state\">" + escapeHtml(historyError) + "</div>";
    return;
  }
  if (!historyEntries) {
    els.historyCount.textContent = "Loading";
    els.historyList.innerHTML = "<div class=\"empty-state\">Loading saved versions...</div>";
    return;
  }
  els.historyCount.textContent = historyEntries.length + " saved version" + (historyEntries.length === 1 ? "" : "s");
  if (!historyEntries.length) {
    els.historyList.innerHTML = "<div class=\"empty-state\">No saved versions yet. They appear as soon as the draft changes.</div>";
    return;
  }
  els.historyList.innerHTML = historyEntries.map((entry, index) => {
    const when = historyTimeParts(entry.createdAt);
    const current = index === 0;
    const action = current
      ? "<span class=\"pill\">Current</span>"
      : "<button class=\"secondary history-restore\" type=\"button\" data-history-id=\"" + entry.id + "\">Restore</button>";
    return "<div class=\"history-row" + (current ? " is-current" : "") + "\"><div class=\"history-time\">" + escapeHtml(when.time) + "<span>" + escapeHtml(when.day) + "</span></div><div class=\"history-main\"><strong>" + escapeHtml(entry.label) + "</strong><span>" + entry.picks + " pick" + (entry.picks === 1 ? "" : "s") + " made</span></div>" + action + "</div>";
  }).join("");
}

async function restoreHistory(id) {
  const entry = (historyEntries || []).find((item) => item.id === id);
  if (!entry) return;
  const when = historyTimeParts(entry.createdAt);
  if (!confirm("Restore the draft to " + when.time + " (" + when.day + ")?\n\n" + entry.label + "\n\nEveryone's screen will switch to this version. You can undo this from the history.")) return;
  try {
    const response = await fetch("/api/history/" + id + "/restore", {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ label: "Restored to " + when.time + ": " + entry.label })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not restore that version.");
    serverVersion = payload.version;
    queuedServerState = null;
    queuedServerMeta = null;
    applyState(payload.state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    loadHistory();
  } catch (error) {
    alert(error.message || "Could not restore that version.");
  }
}

function ownerFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const team = key(params.get("team"));
  return team ? state.owners.find((owner) => key(owner.owner) === team || key(owner.id) === team) || null : null;
}

function ownerHasAdminPowers(owner) {
  return Boolean(owner && key(owner.owner) === key(ADMIN_OWNER_NAME) && isAdminUnlocked());
}

function goToDraftRoom() {
  window.history.pushState({}, "", window.location.pathname);
  render();
}

function resetDraftPicks() {
  if (!confirm("Clear drafted picks? Imported players, owners, draft order, trades, and keepers will stay.")) return;
  state.picks = [];
  saveState({ label: "All picks cleared (Reset)" });
  render();
}

function setOwnerPage(ownerId) {
  const owner = ownerById(ownerId);
  const url = owner ? "?team=" + encodeURIComponent(owner.owner) : window.location.pathname;
  window.history.pushState({}, "", url);
  render();
}

function flagSet(ownerId) {
  state.playerFlags[ownerId] = state.playerFlags[ownerId] || [];
  return new Set(state.playerFlags[ownerId]);
}

function toggleFlag(ownerId, playerId) {
  const flags = flagSet(ownerId);
  if (flags.has(playerId)) flags.delete(playerId);
  else flags.add(playerId);
  state.playerFlags[ownerId] = Array.from(flags);
  saveState({ label: ownerName(ownerId) + " updated flagged players" });
  renderOwnerPage();
}

function renderTeamLinks() {
  els.teamLinks.innerHTML = state.owners.map((owner) => "<a href=\"?team=" + encodeURIComponent(owner.owner) + "\">" + escapeHtml(owner.owner) + " Page</a>").join("");
}

function renderOwnerPage() {
  const owner = ownerFromUrl();
  document.body.classList.toggle("owner-page", Boolean(owner));
  document.body.classList.toggle("guest-owner-page", Boolean(owner && !ownerHasAdminPowers(owner)));
  if (!owner) return;

  state.selectedOwnerId = owner.id;
  if (!ownerRosterViewId) ownerRosterViewId = owner.id;
  const isAdmin = ownerHasAdminPowers(owner);
  els.ownerAdminPanel.hidden = !isAdmin;
  els.ownerHistoryTab.hidden = !isAdmin;
  els.ownerLeagueTab.hidden = !isAdmin;
  if (isAdmin) {
    renderAdminUndo();
    renderLeagueTools(owner.id);
  }
  els.ownerPageSummary.hidden = false;
  els.ownerClockPanel.hidden = false;
  document.querySelector(".owner-tab-shell").hidden = false;

  const roster = teamPlayers(owner.id);
  const flags = flagSet(owner.id);
  const currentPick = currentSchedulePick();
  const onClock = Boolean(currentPick && currentPick.ownerId === owner.id);
  const nextMine = nextPickForOwner(owner.id);
  const search = key(els.ownerPlayerSearch.value);
  const flagFilter = els.ownerFlagFilter.value;
  const sort = els.ownerSort.value || "rank";
  let players = availablePlayers({ search: "", position: "" }).filter((player) => {
    if (flagFilter === "flagged" && !flags.has(player.id)) return false;
    if (!search) return true;
    return [player.player, player.team, player.pos].some((value) => key(value).includes(search));
  });
  players = players.sort((a, b) => {
    if (sort === "rank") return (a.rank || 9999) - (b.rank || 9999);
    return (b[sort] || 0) - (a[sort] || 0) || (a.rank || 9999) - (b.rank || 9999);
  });

  els.ownerPageTitle.textContent = owner.owner + " Draft Page";
  els.ownerPageCount.textContent = players.length + " available";
  els.ownerPageSummary.innerHTML = [["Roster", roster.length], ["Keepers", roster.filter((player) => player.keeper).length], ["On Clock", currentPick ? ownerName(currentPick.ownerId) : "Done"], ["Your Next", onClock ? "Now" : (nextMine ? "Pick " + nextMine.pick : "-")]]
    .map(([label, value]) => "<div class=\"metric\"><span>" + label + "</span><strong>" + value + "</strong></div>").join("") + "<div class=\"position-summary\"><span>Positions</span><div>" + positionSummaryHtml(roster) + "</div></div>";
  els.ownerClockPanel.className = "owner-clock-panel" + (onClock ? " is-on-clock" : "");
  els.ownerClockPanel.innerHTML = currentPick
    ? "<strong>" + (onClock ? "You are on the clock" : ownerName(currentPick.ownerId) + " is on the clock") + "</strong><span>" + escapeHtml(currentPick.roundLabel) + " - Pick " + currentPick.pick + (nextMine && !onClock ? " - Your next pick is " + nextMine.pick : "") + "</span>"
    : "<strong>Draft complete</strong><span>No open pick slots remain.</span>";
  renderOwnerDraftBoard(owner.id);
  renderOwnerRoster(owner.id);
  els.ownerPlayerBody.innerHTML = players.length ? players.slice(0, 500).map((player) => {
    const flagged = flags.has(player.id);
    return "<tr><td><button class=\"draft-player-button\" type=\"button\" data-player-name=\"" + escapeHtml(player.player) + "\"" + (onClock ? "" : " disabled") + ">Draft</button></td><td><button class=\"flag-button" + (flagged ? " flagged" : "") + "\" type=\"button\" data-player-id=\"" + escapeHtml(player.id) + "\">" + (flagged ? "*" : "+") + "</button></td><td>" + (player.rank || "") + "</td><td>" + escapeHtml(player.player) + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + player.pts.toFixed(1) + "</td><td>" + player.ast.toFixed(1) + "</td><td>" + player.stl.toFixed(1) + "</td><td>" + player.reb.toFixed(1) + "</td><td>" + player.blk.toFixed(1) + "</td><td>" + player.to.toFixed(1) + "</td><td>" + player.fg_pct.toFixed(3) + "</td><td>" + player.ft_pct.toFixed(3) + "</td><td>" + player.threepm.toFixed(1) + "</td>" + totalCellHtml(player) + "</tr>";
  }).join("") : "<tr><td class=\"empty-state\" colspan=\"15\">No available players match this view.</td></tr>";
  setOwnerTab(activeOwnerTab);
}

async function loadDefaultCsv() {
  const cacheBust = "?v=" + Date.now();
  suppressServerSync = true;

  try {
    const response = await fetch("players.csv" + cacheBust);
    if (response.ok) importPlayers(await response.text(), { silent: true });
  } catch (error) {
    // Local file mode or missing CSV: keep whatever is already saved.
  }

  try {
    const response = await fetch("keepers.csv" + cacheBust);
    if (response.ok) importKeepers(await response.text(), { silent: true });
  } catch (error) {
    // Keepers are optional during early setup.
  }

  try {
    const response = await fetch("trades.csv" + cacheBust);
    if (response.ok) importTrades(await response.text(), { silent: true, source: "default-csv", replaceSource: true });
  } catch (error) {
    // Trades are optional and can still be added manually.
  }

  suppressServerSync = false;
  saveState({ label: "Loaded players, keepers and trades from CSV files" });
  render();
}

async function initializeApp() {
  loadHeadshotIds();
  await checkAdminStatus();
  const loadedServerState = await loadServerState();
  if (loadedServerState && state.players.length) {
    render();
    setInterval(pollServerState, 2000);
    return;
  }
  applyState(defaultState());
  await loadDefaultCsv();
  setInterval(pollServerState, 2000);
}
function render() {
  state.owners = defaultOwners;
  state.keepers = normalizeKeepers(state.keepers || {});
  document.body.classList.toggle("draft-started", Boolean(state.draftStarted));
  document.body.classList.toggle("show-totals", showTotals());
  renderAdminGate();
  syncTotalSortOption();
  renderTeamLinks();
  renderDraftOrder();
  renderKeepers();
  renderTrades();
  renderPickMap();
  renderNextYearPickMap();
  setSetupTab(activeSetupTab);
  renderSelects();
  renderBoard();
  renderDashboard();
  renderPlayers();
  renderOwnerPage();
}

els.csvInput.addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; importPlayers(await file.text()); event.target.value = ""; });
els.keepersInput.addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; importKeepers(await file.text()); event.target.value = ""; });
els.tradesInput.addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; importTrades(await file.text()); event.target.value = ""; });
els.stateInput.addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; Object.assign(state, JSON.parse(await file.text())); state.owners = defaultOwners; state.pickTrades = state.pickTrades || []; state.keepers = normalizeKeepers(state.keepers || {}); state.draftStarted = Boolean(state.draftStarted); saveState({ label: "Imported a saved state file" }); render(); event.target.value = ""; });
els.exportState.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fantasy-draft-" + new Date().toISOString().slice(0, 10) + ".json";
  link.click();
  URL.revokeObjectURL(url);
});
els.resetDraft.addEventListener("click", resetDraftPicks);
els.saveOrder.addEventListener("click", saveDraftOrderFromForm);
els.draftOrderList.addEventListener("dragstart", (event) => {
  const row = event.target.closest(".order-row");
  if (!row) return;
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.ownerId);
});
els.draftOrderList.addEventListener("dragover", (event) => {
  event.preventDefault();
  const dragging = els.draftOrderList.querySelector(".order-row.is-dragging");
  if (!dragging) return;
  const after = rowAfterDragPointer(els.draftOrderList, event.clientY);
  if (after) els.draftOrderList.insertBefore(dragging, after);
  else els.draftOrderList.append(dragging);
  refreshDraftOrderSlots();
});
els.draftOrderList.addEventListener("dragend", () => {
  const dragging = els.draftOrderList.querySelector(".order-row.is-dragging");
  if (dragging) dragging.classList.remove("is-dragging");
  refreshDraftOrderSlots();
});
els.draftOrderList.addEventListener("click", (event) => {
  const button = event.target.closest(".order-move");
  if (!button) return;
  moveDraftOrderRow(button.closest(".order-row"), button.dataset.direction);
});
els.startDraft.addEventListener("click", () => { if (!hasDraftOrder()) return alert("Set the draft order first."); state.draftStarted = true; saveState({ label: "Draft started" }); render(); });
els.editSetup.addEventListener("click", () => { state.draftStarted = false; saveState({ label: "Setup reopened" }); render(); });
els.addTrade.addEventListener("click", addTradeFromForm);
els.tradeOwnerA.addEventListener("change", () => { tradeSelection.a.clear(); renderTradeControls(); });
els.tradeOwnerB.addEventListener("change", () => { tradeSelection.b.clear(); renderTradeControls(); });
els.clearTrade.addEventListener("click", () => { tradeSelection = { a: new Set(), b: new Set() }; renderTradeControls(); });
[els.tradePicksA, els.tradePicksB].forEach((grid) => grid.addEventListener("click", (event) => {
  const button = event.target.closest(".trade-pick");
  if (!button) return;
  const selection = tradeSelection[button.dataset.side];
  if (selection.has(button.dataset.ref)) selection.delete(button.dataset.ref);
  else selection.add(button.dataset.ref);
  renderTradeControls();
}));
els.ownerSelect.addEventListener("change", () => { state.selectedOwnerId = els.ownerSelect.value; saveState({ history: false }); renderDashboard(); });
els.ownerTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".owner-tab");
  if (!tab) return;
  setOwnerTab(tab.dataset.ownerTab);
});
els.setupTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".setup-tab");
  if (!tab) return;
  setSetupTab(tab.dataset.setupTab);
});
els.ownerPlayerSearch.addEventListener("input", renderOwnerPage);
els.ownerSort.addEventListener("change", renderOwnerPage);
els.ownerFlagFilter.addEventListener("change", renderOwnerPage);
els.ownerRosterSelect.addEventListener("change", () => {
  ownerRosterViewId = els.ownerRosterSelect.value;
  const owner = ownerFromUrl();
  renderOwnerRoster(owner ? owner.id : ownerRosterViewId);
});
els.ownerPlayerBody.addEventListener("click", (event) => {
  const owner = ownerFromUrl();
  const flagButton = event.target.closest(".flag-button");
  if (flagButton && owner) toggleFlag(owner.id, flagButton.dataset.playerId);
  const draftButton = event.target.closest(".draft-player-button");
  if (draftButton && owner) {
    activeOwnerTab = "roster";
    addPick(owner.id, draftButton.dataset.playerName);
  }
});
els.ownerHome.addEventListener("click", goToDraftRoom);
els.ownerAdminHome.addEventListener("click", goToDraftRoom);
els.leagueH2hA.addEventListener("change", () => { leagueH2hPair = [els.leagueH2hA.value, els.leagueH2hB.value]; renderOwnerPage(); });
els.leagueH2hB.addEventListener("change", () => { leagueH2hPair = [els.leagueH2hA.value, els.leagueH2hB.value]; renderOwnerPage(); });
// Click a matchup cell to open it in the head-to-head view.
els.leagueMatrix.addEventListener("click", (event) => {
  const cell = event.target.closest("td[data-a]");
  if (!cell) return;
  leagueH2hPair = [cell.dataset.a, cell.dataset.b];
  renderOwnerPage();
  els.leagueH2h.scrollIntoView({ behavior: "smooth", block: "center" });
});
els.adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = els.adminLoginForm.querySelector("button[type=submit]");
  els.adminLoginError.textContent = "";
  button.disabled = true;
  try {
    await adminLogin(els.adminPassword.value);
    els.adminPassword.value = "";
    render();
  } catch (error) {
    els.adminLoginError.textContent = error.message || "Could not log in.";
    els.adminPassword.select();
  }
  button.disabled = false;
});
if (els.adminLogout) els.adminLogout.addEventListener("click", adminLogout);
if (els.ownerAdminLogout) els.ownerAdminLogout.addEventListener("click", adminLogout);
els.ownerAdminReset.addEventListener("click", resetDraftPicks);
els.ownerAdminUndo.addEventListener("click", undoLastPick);
els.ownerAdminHistory.addEventListener("click", () => { setOwnerTab("history"); });
els.historyRefresh.addEventListener("click", loadHistory);
els.historyList.addEventListener("click", (event) => {
  const button = event.target.closest(".history-restore");
  if (button) restoreHistory(Number(button.dataset.historyId));
});
window.addEventListener("popstate", render);
els.pickForm.addEventListener("submit", (event) => { event.preventDefault(); addPick(els.pickOwner.value, els.pickPlayer.value); });
els.searchInput.addEventListener("input", renderPlayers);
els.positionFilter.addEventListener("change", renderPlayers);

initializeApp();






