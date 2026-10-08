# Fantasy Basketball Draft Tool

A synced fantasy basketball draft website for a live draft room.

## What it does now

- Imports player projections from a CSV.
- Imports keepers and pick trades from CSV files.
- Lets the commissioner or any owner enter draft picks manually.
- Shows a live draft board by round and pick.
- Tracks available and drafted players.
- Gives each owner a team dashboard with roster and category totals.
- Saves draft state to the server with browser fallback.
- Polls for live updates so multiple devices stay in sync.
- Can save shared draft state to Neon/Postgres on Render.
- Exports and imports draft state as JSON for offline sharing or backup.

## Quick start

Run the synced server:

```sh
npm start
```

Then open `http://localhost:5173`.

For draft day, host the server from one machine or deploy it to a host like Render. When served over HTTP, the app automatically loads `players.csv`, `keepers.csv`, and `trades.csv` from the project root at startup if no shared server state exists yet.

## Render deploy

This repo includes `render.yaml`, so Render can read the service settings automatically.

1. Push the latest code to GitHub.
2. In Render, create a new Blueprint or Web Service from `https://github.com/laperales58/fbdraft`.
3. Use the included settings:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/api/health`
4. Add your Neon connection string as an environment variable:

```sh
DATABASE_URL=postgresql://...
```

5. Deploy, then open the Render URL and confirm `/api/health` returns `{"ok":true}`.

## Live Sync Safety

The server owns one shared draft state at `/api/state`. Every save includes a version number; if two people change the draft at the same time, the stale save is rejected instead of silently overwriting the newer save. Open pages poll every two seconds for updates from other devices.

The server saves draft state in one of two places:

- If `DATABASE_URL` is set, it stores the draft in Postgres. This is the best Render setup because it survives restarts without a paid Render persistent disk.
- If `DATABASE_URL` is not set, it writes `data/draft-state.json` atomically and creates timestamped backups in `data/backups/`.

For Render with Neon:

1. Create a Neon Postgres database.
2. Copy the pooled or regular connection string.
3. In Render, add an environment variable:

```sh
DATABASE_URL=postgresql://...
```

4. Deploy normally with `npm start`.

The server creates its `draft_state` table automatically the first time it starts. No Render persistent disk is needed when `DATABASE_URL` is set.

For Render without Neon, attach a persistent disk and set:

- `DATA_DIR=/var/data`

Without a persistent disk or external database, Render restarts and redeploys can wipe local server files.

## Admin password

The Draft Room and Luis's page are locked behind an admin password. Other owners' pages (`?team=Name`) stay open.

1. In Render, open the service, go to **Environment**, and add `ADMIN_PASSWORD` with the password you want.
2. Save; Render redeploys. Visit the site and enter the password once; the browser remembers it until you press **Log Out**.
3. Changing `ADMIN_PASSWORD` logs out every browser.

If `ADMIN_PASSWORD` is not set (for example when running locally), the admin pages are open.

When logged in as admin, a **Total** column (from the CSV's `TOTAL`/`value` column) appears in the player tables, and the owner page can sort by it. Other owners don't see it on their pages, but it is still in the shared draft data and the public `players.csv`, so treat it as hidden, not secret.

## Player CSV format

Use `data/players-template.csv` as a starting point. Supported columns:

- `player`
- `team`
- `pos`
- `rank`
- `pts`
- `reb`
- `ast`
- `stl`
- `blk`
- `threepm`
- `fg_pct`
- `ft_pct`
- `to`

Column names are flexible for common variants like `name`, `position`, `3pm`, `fg%`, and `ft%`.

## Keeper CSV format

Use `data/keepers-template.csv` as a starting point. Supported formats:

Spreadsheet format:

- blank first header, then `1`, `2`, `3`
- owner names in the first column
- keeper names in columns 1-3

Long format:

- `owner`
- `player`

Importing keepers replaces the current keeper list. A root-level `keepers.csv` is also loaded automatically on startup. Owners can be matched by owner name, team name, or owner id.

## Trade CSV format

Use `data/trades-template.csv` as a starting point. The preferred format is a pick-owner matrix:

- blank first header, then round numbers `1` through `13`
- owner names in the first column
- each cell lists whose pick that row owner controls in that round
- comma-separated cells like `Luis, Mario` mean Luis owns both Luis's pick and Mario's pick that round

Transaction-list format is also supported:

- `type` (`swap` or `transfer`)
- `from_owner`
- `from_round`
- `to_owner`
- `to_round` for swaps

For multi-pick trades, list several rounds in one cell separated by semicolons, for example `swap,Luis,4;6;8;10,Daniel,2` for a 4-for-1. In the app, the **Trades** tab lets you tap any number of picks on each side, including picks an owner previously acquired.

Importing trades appends to the current trade list, so live draft-night trades can still be added manually with **Add Trade**. A root-level `trades.csv` is loaded automatically on startup as baseline trades; manual trades added in the browser are preserved across refreshes.

## Undo and draft history

Open Luis's page (`?team=Luis`) for the admin tools:

- **Undo Pick N** removes the most recent pick. The player goes back in the pool and that owner is on the clock again.
- **History** lists every saved version of the draft, newest first, with a label like `Pick 37: Luis took ...` or `Trade added: ...`. **Restore** puts the whole draft back to that moment for everyone. A restore is saved as a new version, so it can be undone too.

History is stored next to the draft state (a `draft_state_history` table in Postgres, or `data/draft-history.json` without a database). It keeps the last 300 versions and leaves out the player list to keep each copy small; restores reuse the current player list. Repeated edits of the same kind within two minutes (like typing keeper names) are merged into one entry. History only works when the app is served by `server.js`.

## Offline draft flow

1. Import the player CSV.
2. Import keepers and pre-draft trades if needed.
3. Add any live trades manually during the draft.
4. Enter picks as players are announced.
5. Owners can use the available-player list and team dashboard from their own devices.
6. Export draft state periodically as a backup.

## Next likely upgrades

- Custom scoring presets.
- Spreadsheet import helpers for the existing `25 FB_Draft_Sheet.xlsx` and `FB25 Helper.xlsx` logic.
- Better roster slot rules by league format.
