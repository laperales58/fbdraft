const STORAGE_KEY = "fantasyBasketballDraftState.v1";
const OWNER_LOCK_KEY = "fantasyBasketballOwnerLock.v1";
const OWNER_NAMES = ["Luis", "Daniel", "Theo", "Henry", "Reed", "Adolfo", "Ivan", "Clay", "Mario", "Frank", "Z", "Yoshi"];

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
  ownersList: document.querySelector("#owners-list"),
  teamLinks: document.querySelector("#team-links"),
  ownerSelect: document.querySelector("#owner-select"),
  pickOwner: document.querySelector("#pick-owner"),
  pickPlayer: document.querySelector("#pick-player"),
  pickForm: document.querySelector("#pick-form"),
  availablePlayers: document.querySelector("#available-players"),
  roundsInput: document.querySelector("#rounds-input"),
  timerInput: document.querySelector("#timer-input"),
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
  ownerClaimPanel: document.querySelector("#owner-claim-panel"),
  ownerClaimName: document.querySelector("#owner-claim-name"),
  confirmOwnerPage: document.querySelector("#confirm-owner-page"),
  cancelOwnerPage: document.querySelector("#cancel-owner-page"),
  ownerPageSelect: document.querySelector("#owner-page-select"),
  ownerPageSummary: document.querySelector("#owner-page-summary"),
  ownerPlayerSearch: document.querySelector("#owner-player-search"),
  ownerSort: document.querySelector("#owner-sort"),
  ownerFlagFilter: document.querySelector("#owner-flag-filter"),
  ownerClockPanel: document.querySelector("#owner-clock-panel"),
  ownerBoardCount: document.querySelector("#owner-board-count"),
  ownerDraftBoard: document.querySelector("#owner-draft-board"),
  ownerPlayerBody: document.querySelector("#owner-player-body"),
  ownerTemplate: document.querySelector("#owner-row-template"),
  orderStatus: document.querySelector("#order-status"),
  draftOrderList: document.querySelector("#draft-order-list"),
  saveOrder: document.querySelector("#save-order"),
  keeperList: document.querySelector("#keeper-list"),
  tradeType: document.querySelector("#trade-type"),
  tradeFromOwner: document.querySelector("#trade-from-owner"),
  tradeFromRound: document.querySelector("#trade-from-round"),
  tradeToOwner: document.querySelector("#trade-to-owner"),
  tradeToRound: document.querySelector("#trade-to-round"),
  tradeToRoundLabel: document.querySelector("#trade-to-round-label"),
  addTrade: document.querySelector("#add-trade"),
  tradeList: document.querySelector("#trade-list")
};

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      parsed.owners = defaultOwners;
      parsed.rounds = parsed.rounds || 13;
      parsed.timerLabel = parsed.timerLabel || "Offline";
      parsed.selectedOwnerId = parsed.selectedOwnerId && defaultOwners.some((owner) => owner.id === parsed.selectedOwnerId) ? parsed.selectedOwnerId : defaultOwners[0].id;
      parsed.players = parsed.players || [];
      parsed.playerFlags = parsed.playerFlags || {};
      parsed.picks = parsed.picks || [];
      parsed.pickTrades = parsed.pickTrades || [];
      parsed.keepers = normalizeKeepers(parsed.keepers || {});
      parsed.draftStarted = Boolean(parsed.draftStarted);
      parsed.draftOrder = Array.isArray(parsed.draftOrder) ? parsed.draftOrder.filter((id) => defaultOwners.some((owner) => owner.id === id)) : [];
      return parsed;
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return { owners: defaultOwners, rounds: 13, timerLabel: "Offline", selectedOwnerId: defaultOwners[0].id, draftOrder: [], pickTrades: [], keepers: normalizeKeepers({}), playerFlags: {}, draftStarted: false, players: [], picks: [] };
}

function normalizeKeepers(raw) {
  const keepers = {};
  for (const owner of defaultOwners) {
    const existing = Array.isArray(raw[owner.id]) ? raw[owner.id] : [];
    keepers[owner.id] = [existing[0] || "", existing[1] || "", existing[2] || ""];
  }
  return keepers;
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function normalize(value) { return String(value == null ? "" : value).trim(); }
function key(value) { return normalize(value).toLowerCase(); }
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
  const rows = parseCsv(text);
  const headers = (rows.shift() || []).map((header) => key(header));
  state.players = rows.map((row, index) => playerFromRecord(Object.fromEntries(headers.map((header, i) => [header, row[i] == null ? "" : row[i]])), index))
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
  const baseCount = state.rounds * ownerCount;

  for (let index = 0; index < baseCount; index += 1) {
    const originalOwnerId = baseOwnerIdForPickIndex(index);
    const ownerId = tradeMap.get(index) || originalOwnerId;
    counts[ownerId] = (counts[ownerId] || 0) + 1;
    schedule.push({ index, pick: index + 1, round: Math.floor(index / ownerCount) + 1, roundLabel: "R" + (Math.floor(index / ownerCount) + 1), originalOwnerId, ownerId, traded: ownerId !== originalOwnerId, compensation: false });
  }

  let extraRound = 1;
  while (state.owners.some((owner) => (counts[owner.id] || 0) < state.rounds)) {
    for (const ownerId of orderedOwnerIds()) {
      if ((counts[ownerId] || 0) < state.rounds) {
        counts[ownerId] = (counts[ownerId] || 0) + 1;
        schedule.push({ index: schedule.length, pick: schedule.length + 1, round: state.rounds + extraRound, roundLabel: "Extra " + extraRound, originalOwnerId: ownerId, ownerId, traded: false, compensation: true });
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
  if (!names.length || slot.compensation) return null;
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

function availablePlayers() {
  const drafted = draftedPlayerIds();
  const draftedNames = draftedPlayerNames();
  const search = key(els.searchInput.value);
  const position = els.positionFilter.value;
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

function renderOwners() {
  els.ownersList.innerHTML = "";
  for (const owner of state.owners) {
    const fragment = els.ownerTemplate.content.cloneNode(true);
    const ownerInput = fragment.querySelector(".owner-name");
    const teamInput = fragment.querySelector(".team-name");
    const remove = fragment.querySelector(".remove-owner");
    ownerInput.value = owner.owner;
    teamInput.value = owner.team;
    ownerInput.disabled = true;
    teamInput.disabled = true;
    remove.remove();
    els.ownersList.append(fragment);
  }
}

function renderDraftOrder() {
  const current = orderedOwnerIds();
  els.draftOrderList.innerHTML = "";
  for (let index = 0; index < state.owners.length; index += 1) {
    const row = document.createElement("label");
    row.className = "order-row";
    const select = document.createElement("select");
    select.dataset.index = String(index);
    select.innerHTML = ownerOptions(current[index] || state.owners[index].id);
    row.innerHTML = "<span>" + (index + 1) + ".</span>";
    row.append(select);
    els.draftOrderList.append(row);
  }
  els.orderStatus.textContent = hasDraftOrder() ? "Order set" : "Set order first";
  els.pickForm.classList.toggle("locked", !hasDraftOrder());
  els.pickPlayer.disabled = !hasDraftOrder();
  els.startDraft.disabled = !hasDraftOrder();
}

function saveDraftOrderFromForm() {
  const ids = Array.from(els.draftOrderList.querySelectorAll("select")).map((select) => select.value);
  if (new Set(ids).size !== state.owners.length) return alert("Each owner can only appear once in the draft order.");
  if (state.picks.length && !confirm("Changing the order after picks exist can make the board confusing. Save it anyway?")) return;
  state.draftOrder = ids;
  saveState();
  render();
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
    card.className = "pick-card" + (player ? "" : " empty") + (keeper ? " keeper" : "") + (slot.traded ? " traded" : "") + (slot.compensation ? " compensation" : "");
    const ownerLine = slot.traded ? escapeHtml(owner.team) + " <span>from " + escapeHtml(originalOwner.team) + "</span>" : escapeHtml(owner.team);
    card.innerHTML = "<div class=\"pick-meta\"><span>" + escapeHtml(slot.roundLabel) + "</span><span>Pick " + (i + 1) + "</span></div><div class=\"pick-player\">" + escapeHtml(player ? player.player : "Available") + "</div><div class=\"pick-owner\">" + ownerLine + "</div>";
    els.draftBoard.append(card);
  }
}

function pickCardHtml(slot, index, pick, keeper, player, compact = false) {
  const owner = pick ? ownerById(pick.ownerId) : ownerById(slot.ownerId);
  const originalOwner = ownerById(slot.originalOwnerId);
  const ownerLine = slot.traded ? escapeHtml(owner.team) + " <span>from " + escapeHtml(originalOwner.team) + "</span>" : escapeHtml(owner.team);
  const playerName = player ? player.player : "Available";
  return "<div class=\"pick-meta\"><span>" + escapeHtml(slot.roundLabel) + "</span><span>Pick " + (index + 1) + "</span></div><div class=\"pick-player\">" + escapeHtml(playerName) + "</div><div class=\"pick-owner\">" + ownerLine + "</div>" + (compact && !player ? "<div class=\"pick-owner\">On deck slot</div>" : "");
}

function renderOwnerDraftBoard(ownerId) {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const schedule = computePickSchedule();
  const picks = draftedPickMap();
  const nextIndex = nextOpenScheduleIndex();
  const start = Math.max(0, nextIndex - 6);
  const end = Math.min(schedule.length, Math.max(nextIndex + 18, 24));
  els.ownerDraftBoard.innerHTML = "";
  els.ownerBoardCount.textContent = (state.picks.length + allKeeperPlayers().length) + " filled";

  for (let i = start; i < end; i += 1) {
    const slot = schedule[i];
    const pick = picks.get(i);
    const keeper = keeperForScheduleIndex(schedule, i);
    const player = keeper || (pick ? byId.get(pick.playerId) : null);
    const card = document.createElement("article");
    card.className = "pick-card owner-board-card" + (player ? "" : " empty") + (keeper ? " keeper" : "") + (slot.traded ? " traded" : "") + (slot.compensation ? " compensation" : "") + (i === nextIndex ? " on-clock-card" : "") + (slot.ownerId === ownerId ? " my-pick-card" : "");
    card.innerHTML = pickCardHtml(slot, i, pick, keeper, player, true);
    els.ownerDraftBoard.append(card);
  }
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
  els.teamSummary.innerHTML = metrics.map(([label, value]) => "<div class=\"metric\"><span>" + label + "</span><strong>" + value + "</strong></div>").join("");
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
  const requestedOwner = team ? state.owners.find((owner) => key(owner.owner) === team || key(owner.id) === team) : null;
  const lockedOwnerId = localStorage.getItem(OWNER_LOCK_KEY);
  const lockedOwner = lockedOwnerId ? ownerById(lockedOwnerId) : null;

  if (lockedOwnerId && lockedOwner && (!requestedOwner || requestedOwner.id !== lockedOwnerId)) {
    window.history.replaceState({}, "", "?team=" + encodeURIComponent(lockedOwner.owner));
    return lockedOwner;
  }

  return requestedOwner;
}

function ownerPageIsClaimed(ownerId) {
  return localStorage.getItem(OWNER_LOCK_KEY) === ownerId;
}

function requestedOwnerFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const team = key(params.get("team"));
  return team ? state.owners.find((owner) => key(owner.owner) === team || key(owner.id) === team) || null : null;
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

  const claimed = ownerPageIsClaimed(owner.id);
  state.selectedOwnerId = owner.id;
  els.ownerClaimPanel.hidden = claimed;
  els.ownerClaimName.textContent = "Confirm " + owner.owner + " page";
  els.ownerPageSummary.hidden = !claimed;
  els.ownerClockPanel.hidden = !claimed;
  document.querySelector(".owner-board-wrap").hidden = !claimed;
  document.querySelector(".owner-filters").hidden = !claimed;
  document.querySelector("#owner-page-panel .table-wrap").hidden = !claimed;
  if (!claimed) {
    els.ownerPageTitle.textContent = owner.owner + " Draft Page";
    els.ownerPageCount.textContent = "Confirm first";
    return;
  }

  const roster = teamPlayers(owner.id);
  const flags = flagSet(owner.id);
  const currentPick = currentSchedulePick();
  const onClock = Boolean(currentPick && currentPick.ownerId === owner.id);
  const nextMine = nextPickForOwner(owner.id);
  const search = key(els.ownerPlayerSearch.value);
  const flagFilter = els.ownerFlagFilter.value;
  const sort = els.ownerSort.value || "rank";
  let players = availablePlayers().filter((player) => {
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
  els.ownerPageSummary.innerHTML = [["Roster", roster.length], ["Keepers", roster.filter((player) => player.keeper).length], ["Flags", flags.size], ["On Clock", currentPick ? ownerName(currentPick.ownerId) : "Done"], ["Your Next", onClock ? "Now" : (nextMine ? "Pick " + nextMine.pick : "-")]]
    .map(([label, value]) => "<div class=\"metric\"><span>" + label + "</span><strong>" + value + "</strong></div>").join("");
  els.ownerClockPanel.className = "owner-clock-panel" + (onClock ? " is-on-clock" : "");
  els.ownerClockPanel.innerHTML = currentPick
    ? "<strong>" + (onClock ? "You are on the clock" : ownerName(currentPick.ownerId) + " is on the clock") + "</strong><span>" + escapeHtml(currentPick.roundLabel) + " · Pick " + currentPick.pick + (nextMine && !onClock ? " · Your next pick is " + nextMine.pick : "") + "</span>"
    : "<strong>Draft complete</strong><span>No open pick slots remain.</span>";
  renderOwnerDraftBoard(owner.id);
  els.ownerPlayerBody.innerHTML = players.length ? players.slice(0, 500).map((player) => {
    const flagged = flags.has(player.id);
    return "<tr><td><button class=\"draft-player-button\" type=\"button\" data-player-name=\"" + escapeHtml(player.player) + "\"" + (onClock ? "" : " disabled") + ">Draft</button></td><td><button class=\"flag-button" + (flagged ? " flagged" : "") + "\" type=\"button\" data-player-id=\"" + escapeHtml(player.id) + "\">" + (flagged ? "★" : "☆") + "</button></td><td>" + (player.rank || "") + "</td><td>" + escapeHtml(player.player) + "</td><td>" + escapeHtml(player.pos) + "</td><td>" + escapeHtml(player.team) + "</td><td>" + player.pts.toFixed(1) + "</td><td>" + player.ast.toFixed(1) + "</td><td>" + player.stl.toFixed(1) + "</td><td>" + player.reb.toFixed(1) + "</td><td>" + player.blk.toFixed(1) + "</td><td>" + player.to.toFixed(1) + "</td><td>" + player.fg_pct.toFixed(3) + "</td><td>" + player.ft_pct.toFixed(3) + "</td><td>" + player.threepm.toFixed(1) + "</td></tr>";
  }).join("") : "<tr><td class=\"empty-state\" colspan=\"15\">No available players match this view.</td></tr>";
}

async function loadDefaultPlayers() {
  try {
    const response = await fetch("players.csv?v=" + Date.now());
    if (!response.ok) return;
    importPlayers(await response.text(), { silent: true });
    render();
  } catch (error) {
    render();
  }
}
function render() {
  state.owners = defaultOwners;
  state.keepers = normalizeKeepers(state.keepers || {});
  document.body.classList.toggle("draft-started", Boolean(state.draftStarted));
  els.roundsInput.value = state.rounds;
  els.timerInput.value = state.timerLabel;
  renderOwners();
  renderTeamLinks();
  renderDraftOrder();
  renderKeepers();
  renderTrades();
  renderSelects();
  renderBoard();
  renderDashboard();
  renderPlayers();
  renderOwnerPage();
}

els.csvInput.addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; importPlayers(await file.text()); event.target.value = ""; });
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
els.resetDraft.addEventListener("click", () => { if (!confirm("Clear drafted picks? Imported players, owners, draft order, trades, and keepers will stay.")) return; state.picks = []; saveState(); render(); });
els.saveOrder.addEventListener("click", saveDraftOrderFromForm);
els.startDraft.addEventListener("click", () => { if (!hasDraftOrder()) return alert("Set the draft order first."); state.draftStarted = true; saveState(); render(); });
els.editSetup.addEventListener("click", () => { state.draftStarted = false; saveState(); render(); });
els.addTrade.addEventListener("click", addTradeFromForm);
els.tradeType.addEventListener("change", renderTradeControls);
els.roundsInput.addEventListener("input", () => { state.rounds = Math.max(1, Number(els.roundsInput.value) || 1); saveState(); render(); });
els.timerInput.addEventListener("input", () => { state.timerLabel = els.timerInput.value; saveState(); });
els.ownerSelect.addEventListener("change", () => { state.selectedOwnerId = els.ownerSelect.value; saveState(); renderDashboard(); });
els.ownerPlayerSearch.addEventListener("input", renderOwnerPage);
els.ownerSort.addEventListener("change", renderOwnerPage);
els.ownerFlagFilter.addEventListener("change", renderOwnerPage);
els.ownerPlayerBody.addEventListener("click", (event) => {
  const owner = ownerFromUrl();
  const flagButton = event.target.closest(".flag-button");
  if (flagButton && owner) toggleFlag(owner.id, flagButton.dataset.playerId);
  const draftButton = event.target.closest(".draft-player-button");
  if (draftButton && owner) addPick(owner.id, draftButton.dataset.playerName);
});
els.confirmOwnerPage.addEventListener("click", () => { const owner = requestedOwnerFromUrl(); if (!owner) return; localStorage.setItem(OWNER_LOCK_KEY, owner.id); render(); });
els.cancelOwnerPage.addEventListener("click", () => { window.history.pushState({}, "", window.location.pathname); render(); });
window.addEventListener("popstate", render);
els.pickForm.addEventListener("submit", (event) => { event.preventDefault(); addPick(els.pickOwner.value, els.pickPlayer.value); });
els.searchInput.addEventListener("input", renderPlayers);
els.positionFilter.addEventListener("change", renderPlayers);

loadDefaultPlayers();






