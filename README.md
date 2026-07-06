# Fantasy Basketball Draft Tool

A local-first fantasy basketball draft website for an offline draft room.

## What it does now

- Imports player projections from a CSV.
- Imports keepers and pick trades from CSV files.
- Lets the commissioner or any owner enter draft picks manually.
- Shows a live draft board by round and pick.
- Tracks available and drafted players.
- Gives each owner a team dashboard with roster and category totals.
- Saves everything in the browser automatically.
- Exports and imports draft state as JSON for offline sharing or backup.

## Quick start

Open `index.html` in a browser. No install step is required for the current static version.

For draft day, put the folder on each laptop or host the folder from one machine on the local network. When served over HTTP, the app automatically loads `players.csv`, `keepers.csv`, and `trades.csv` from the project root at startup.

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

Importing trades appends to the current trade list, so live draft-night trades can still be added manually with **Add Trade**. A root-level `trades.csv` is loaded automatically on startup as baseline trades; manual trades added in the browser are preserved across refreshes.

## Offline draft flow

1. Import the player CSV.
2. Import keepers and pre-draft trades if needed.
3. Add any live trades manually during the draft.
4. Enter picks as players are announced.
5. Owners can use the available-player list and team dashboard from their own devices.
6. Export draft state periodically as a backup.

## Next likely upgrades

- Local-network sync so all devices see picks instantly from one host machine.
- Custom scoring presets.
- Spreadsheet import helpers for the existing `25 FB_Draft_Sheet.xlsx` and `FB25 Helper.xlsx` logic.
- Better roster slot rules by league format.
