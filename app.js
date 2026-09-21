const STORAGE_KEY = "fantasyBasketballDraftState.v1";
const ADMIN_OWNER_NAME = "Luis";
const OWNER_NAMES = ["Luis", "Daniel", "Theo", "Henry", "Reed", "Adolfo", "Ivan", "Clay", "Mario", "Frank", "Z", "Yoshi"];
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
  ownerAdminReset: document.querySelector("#owner-admin-reset"),
  ownerPageSelect: document.querySelector("#owner-page-select"),
  ownerPageSummary: document.querySelector("#owner-page-summary"),
  ownerTabs: document.querySelector("#owner-tabs"),
  setupTabs: document.querySelector("#setup-tabs"),
  ownerPlayerSearch: document.querySelector("#owner-player-search"),
  ownerSort: document.querySelector("#owner-sort"),
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
  tradeType: document.querySelector("#trade-type"),
  tradeFromOwner: document.querySelector("#trade-from-owner"),
  tradeFromRound: document.querySelector("#trade-from-round"),
  tradeToOwner: document.querySelector("#trade-to-owner"),
  tradeToRound: document.querySelector("#trade-to-round"),
  tradeToRoundLabel: document.querySelector("#trade-to-round-label"),
  addTrade: document.querySelector("#add-trade"),
  tradeList: document.querySelector("#trade-list")
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
  flushServerSave();
}

async function flushServerSave() {
  if (savingToServer || !queuedServerState) return;
  savingToServer = true;

  while (queuedServerState && serverSyncEnabled) {
    const snapshot = queuedServerState;
    queuedServerState = null;

    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: serverVersion, state: snapshot }),
      });

      const payload = await response.json();
      if (response.status === 409) {
        await handleSyncConflict(payload);
        break;
      }
      if (!response.ok) throw new Error(payload.error || "Unable to save draft state.");

      serverVersion = payload.version;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
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
    to: toNumber(readColumn(record, ["to", "turnovers", "tov"]))
  };
}

function importPlayers(text, options = {}) {
  state.players = csvRecords(text).map((record, index) => playerFromRecord(record, index))
    .filter((player) => player.player)
    .sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || a.player.localeCompare(b.player));
  saveState();
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
  if (round <= 3) return order[slot];
  return round % 2 === 0 ? order[ownerCount - 1 - slot] : order[slot];
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

function computePickSchedule() {
  const ownerCount = Math.max(state.owners.length, 1);
  const tradeMap = buildPickTradeMap();
  const schedule = [];
  const counts = Object.fromEntries(state.owners.map((owner) => [owner.id, 0]));
  const baseCount = ROUNDS * ownerCount;

  for (let index = 0; index < baseCount; index += 1) {
    const originalOwnerId = baseOwnerIdForPickIndex(index);
    const ownerId = tradeMap.get(index) || originalOwnerId;
    const skipped = (counts[ownerId] || 0) >= ROUNDS;
    if (!skipped) counts[ownerId] = (counts[ownerId] || 0) + 1;
    schedule.push({ index, pick: index + 1, round: Math.floor(index / ownerCount) + 1, roundLabel: "R" + (Math.floor(index / ownerCount) + 1), originalOwnerId, ownerId, traded: ownerId !== originalOwnerId, compensation: false, skipped });
  }

  let extraRound = 1;
  while (state.owners.some((owner) => (counts[owner.id] || 0) < ROUNDS)) {
    for (const ownerId of orderedOwnerIds()) {
      if ((counts[ownerId] || 0) < ROUNDS) {
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

function teamPlayers(ownerId) {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const schedule = computePickSchedule();
  const keepers = schedule.map((slot, index) => keeperForScheduleIndex(schedule, index)).filter((keeper) => keeper && keeper.ownerId === ownerId);
  const drafted = state.picks
    .filter((pick) => pick.ownerId === ownerId)
    .map((pick, index) => ({ player: byId.get(pick.playerId), pickIndex: pickIndexForDraftedPick(pick, index) }))
    .filter((item) => item.player)
    .map((item) => ({ ...item.player, pickIndex: item.pickIndex }));
  return keepers.concat(drafted).sort((a, b) => (a.pickIndex || 0) - (b.pickIndex || 0));
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
  saveState();
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
  saveState();
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
  saveState();
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
        saveState();
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

function renderTradeControls() {
  const selectedFrom = els.tradeFromOwner.value || state.owners[0].id;
  const selectedTo = els.tradeToOwner.value || state.owners[1].id;
  els.tradeFromOwner.innerHTML = ownerOptions(selectedFrom);
  els.tradeToOwner.innerHTML = ownerOptions(selectedTo);
  els.tradeToRoundLabel.style.display = els.tradeType.value === "swap" ? "grid" : "none";
}

function tradeText(trade) {
  if (trade.type === "swap") return ownerName(trade.fromOwnerId) + " R" + trade.fromRound + " for " + ownerName(trade.toOwnerId) + " R" + trade.toRound;
  return ownerName(trade.fromOwnerId) + " R" + trade.fromRound + " to " + ownerName(trade.toOwnerId);
}

function renderTrades() {
  renderTradeControls();
  if (!state.pickTrades.length) {
    els.tradeList.innerHTML = "<div class=\"empty-state\">No pick trades entered.</div>";
    return;
  }
  els.tradeList.innerHTML = "";
  state.pickTrades.forEach((trade) => {
    const row = document.createElement("div");
    row.className = "trade-row";
    row.innerHTML = "<div><strong>" + escapeHtml(tradeText(trade)) + "</strong><span>" + (trade.type === "swap" ? "Specific pick swap" : "One-way pick transfer") + "</span></div><button type=\"button\" data-trade-id=\"" + escapeHtml(trade.id) + "\">Remove</button>";
    row.querySelector("button").addEventListener("click", () => {
      state.pickTrades = state.pickTrades.filter((item) => item.id !== trade.id);
      saveState();
      render();
    });
    els.tradeList.append(row);
  });
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
  const fromRound = toNumber(readColumn(record, ["from_round", "from round", "giving_round", "giving round", "round", "giving pick", "from pick"]));
  const toRound = toNumber(readColumn(record, ["to_round", "to round", "receiving_round", "receiving round", "receiving pick", "to pick"]));

  if (!fromOwner || !toOwner || fromOwner.id === toOwner.id || !fromRound || (type === "swap" && !toRound)) return null;
  return { id: crypto.randomUUID(), type, fromOwnerId: fromOwner.id, fromRound, toOwnerId: toOwner.id, toRound: type === "swap" ? toRound : null };
}

function tradeKey(trade) {
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
    if (!options.silent) alert("No trades were imported. Use a pick matrix like your trades.csv or columns like type, from_owner, from_round, to_owner, to_round.");
    return 0;
  }

  const existing = options.replaceSource ? state.pickTrades.filter((trade) => trade.source !== source) : state.pickTrades;
  state.pickTrades = dedupeTrades(trades.concat(existing));
  saveState();
  if (!options.silent) {
    render();
    alert("Imported " + trades.length + " trade" + (trades.length === 1 ? "" : "s") + ".");
  }
  return trades.length;
}

function addTradeFromForm() {
  const type = els.tradeType.value;
  const fromOwnerId = els.tradeFromOwner.value;
  const toOwnerId = els.tradeToOwner.value;
  const fromRound = Math.max(1, Number(els.tradeFromRound.value) || 1);
  const toRound = Math.max(1, Number(els.tradeToRound.value) || 1);
  if (fromOwnerId === toOwnerId) return alert("Pick trades need two different owners.");
  if (state.picks.length && !confirm("Adding trades after picks exist can make the board confusing. Add it anyway?")) return;
  state.pickTrades.push({ id: crypto.randomUUID(), type, fromOwnerId, fromRound, toOwnerId, toRound: type === "swap" ? toRound : null });
  saveState();
  render();
}

function renderSelects() {
  els.ownerSelect.innerHTML = ownerOptions(state.selectedOwnerId);
  els.pickOwner.innerHTML = ownerOptions(ownerForNextPick() ? ownerForNextPick().id : state.owners[0].id);
  if (!state.owners.some((owner) => owner.id === state.selectedOwnerId)) state.selectedOwnerId = state.owners[0] ? state.owners[0].id : "";
  els.ownerSelect.value = state.selectedOwnerId;
  els.pickOwner.value = ownerForNextPick() ? ownerForNextPick().id : (state.owners[0] ? state.owners[0].id : "");
}

function renderBoard() {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const schedule = computePickSchedule();
  const picks = draftedPickMap();
  const keeperCount = allKeeperPlayers().length;
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
    const ownerLine = slot.traded ? escapeHtml(owner.team) + " <span>from " + escapeHtml(originalOwner.team) + "</span>" : escapeHtml(owner.team);
    card.innerHTML = "<div class=\"pick-meta\"><span>" + escapeHtml(slot.roundLabel) + "</span><span>Pick " + (i + 1) + "</span></div><div class=\"pick-player\">" + escapeHtml(slot.skipped ? "Roster Full" : (player ? player.player : "Available")) + "</div><div class=\"pick-owner\">" + ownerLine + "</div>";
    els.draftBoard.append(card);
  }
}

function pickCardHtml(slot, index, pick, keeper, player, compact = false) {
  const owner = pick ? ownerById(pick.ownerId) : ownerById(slot.ownerId);
  const originalOwner = ownerById(slot.originalOwnerId);
  const ownerLine = slot.traded ? escapeHtml(owner.team) + " <span>from " + escapeHtml(originalOwner.team) + "</span>" : escapeHtml(owner.team);
  const playerName = slot.skipped ? "Roster Full" : (player ? player.player : "Available");
  return "<div class=\"pick-meta\"><span>" + escapeHtml(slot.roundLabel) + "</span><span>Pick " + (index + 1) + "</span></div><div class=\"pick-player\">" + escapeHtml(playerName) + "</div><div class=\"pick-owner\">" + ownerLine + "</div>";
}

function renderOwnerDraftBoard(ownerId) {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const schedule = computePickSchedule();
  const picks = draftedPickMap();
  const nextIndex = nextOpenScheduleIndex();
  const rounds = new Map();
  els.ownerDraftBoard.innerHTML = "";
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
      card.innerHTML = pickCardHtml(slot, index, pick, keeper, player, true);
      picksWrap.append(card);
    }

    els.ownerDraftBoard.append(row);
  }
}

function setOwnerTab(tab) {
  activeOwnerTab = ["board", "pool", "roster"].includes(tab) ? tab : "board";
  document.querySelectorAll(".owner-tab").forEach((button) => {
    const active = button.dataset.ownerTab === activeOwnerTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".owner-tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.ownerPanel !== activeOwnerTab;
  });
}

function setSetupTab(tab) {
  activeSetupTab = ["order", "keepers", "trades"].includes(tab) ? tab : "order";
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
    return "<tr><td>" + pickLabel + "</td><td>" + escapeHtml(player.player) + (player.keeper ? " <strong>(K)</strong>" : "") + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + statText(player, "pts") + "</td><td>" + statText(player, "ast") + "</td><td>" + statText(player, "stl") + "</td><td>" + statText(player, "reb") + "</td><td>" + statText(player, "blk") + "</td><td>" + statText(player, "to") + "</td><td>" + statText(player, "fg_pct", 3) + "</td><td>" + statText(player, "ft_pct", 3) + "</td><td>" + statText(player, "threepm") + "</td></tr>";
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
  els.playersBody.innerHTML = players.length ? players.slice(0, 300).map((player) => "<tr><td>" + (player.rank || "") + "</td><td>" + escapeHtml(player.player) + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + player.pts.toFixed(1) + "</td><td>" + player.ast.toFixed(1) + "</td><td>" + player.stl.toFixed(1) + "</td><td>" + player.reb.toFixed(1) + "</td><td>" + player.blk.toFixed(1) + "</td><td>" + player.to.toFixed(1) + "</td><td>" + player.fg_pct.toFixed(3) + "</td><td>" + player.ft_pct.toFixed(3) + "</td><td>" + player.threepm.toFixed(1) + "</td></tr>").join("") : "<tr><td class=\"empty-state\" colspan=\"13\">Import a player CSV to fill the board.</td></tr>";
}

function ownerFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const team = key(params.get("team"));
  return team ? state.owners.find((owner) => key(owner.owner) === team || key(owner.id) === team) || null : null;
}

function ownerHasAdminPowers(owner) {
  return owner && key(owner.owner) === key(ADMIN_OWNER_NAME);
}

function goToDraftRoom() {
  window.history.pushState({}, "", window.location.pathname);
  render();
}

function resetDraftPicks() {
  if (!confirm("Clear drafted picks? Imported players, owners, draft order, trades, and keepers will stay.")) return;
  state.picks = [];
  saveState();
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
  saveState();
  renderOwnerPage();
}

function renderTeamLinks() {
  els.teamLinks.innerHTML = state.owners.map((owner) => "<a href=\"?team=" + encodeURIComponent(owner.owner) + "\">" + escapeHtml(owner.owner) + " Page</a>").join("");
}

function renderOwnerPage() {
  const owner = ownerFromUrl();
  document.body.classList.toggle("owner-page", Boolean(owner));
  if (!owner) return;

  state.selectedOwnerId = owner.id;
  if (!ownerRosterViewId) ownerRosterViewId = owner.id;
  els.ownerAdminPanel.hidden = !ownerHasAdminPowers(owner);
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
    return "<tr><td><button class=\"draft-player-button\" type=\"button\" data-player-name=\"" + escapeHtml(player.player) + "\"" + (onClock ? "" : " disabled") + ">Draft</button></td><td><button class=\"flag-button" + (flagged ? " flagged" : "") + "\" type=\"button\" data-player-id=\"" + escapeHtml(player.id) + "\">" + (flagged ? "*" : "+") + "</button></td><td>" + (player.rank || "") + "</td><td>" + escapeHtml(player.player) + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + player.pts.toFixed(1) + "</td><td>" + player.ast.toFixed(1) + "</td><td>" + player.stl.toFixed(1) + "</td><td>" + player.reb.toFixed(1) + "</td><td>" + player.blk.toFixed(1) + "</td><td>" + player.to.toFixed(1) + "</td><td>" + player.fg_pct.toFixed(3) + "</td><td>" + player.ft_pct.toFixed(3) + "</td><td>" + player.threepm.toFixed(1) + "</td></tr>";
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
  saveState();
  render();
}

async function initializeApp() {
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
  renderTeamLinks();
  renderDraftOrder();
  renderKeepers();
  renderTrades();
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
els.stateInput.addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; Object.assign(state, JSON.parse(await file.text())); state.owners = defaultOwners; state.pickTrades = state.pickTrades || []; state.keepers = normalizeKeepers(state.keepers || {}); state.draftStarted = Boolean(state.draftStarted); saveState(); render(); event.target.value = ""; });
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
els.startDraft.addEventListener("click", () => { if (!hasDraftOrder()) return alert("Set the draft order first."); state.draftStarted = true; saveState(); render(); });
els.editSetup.addEventListener("click", () => { state.draftStarted = false; saveState(); render(); });
els.addTrade.addEventListener("click", addTradeFromForm);
els.tradeType.addEventListener("change", renderTradeControls);
els.ownerSelect.addEventListener("change", () => { state.selectedOwnerId = els.ownerSelect.value; saveState(); renderDashboard(); });
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
els.ownerAdminReset.addEventListener("click", resetDraftPicks);
window.addEventListener("popstate", render);
els.pickForm.addEventListener("submit", (event) => { event.preventDefault(); addPick(els.pickOwner.value, els.pickPlayer.value); });
els.searchInput.addEventListener("input", renderPlayers);
els.positionFilter.addEventListener("change", renderPlayers);

initializeApp();






