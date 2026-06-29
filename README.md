# Fantasy Basketball Draft Tool

A local-first fantasy basketball draft website for an offline draft room.

## What it does now

- Imports player projections from a CSV.
- Lets the commissioner or any owner enter draft picks manually.
- Shows a live draft board by round and pick.
- Tracks available and drafted players.
- Gives each owner a team dashboard with roster and category totals.
- Saves everything in the browser automatically.
- Exports and imports draft state as JSON for offline sharing or backup.

## Quick start

Open `index.html` in a browser. No install step is required for the current static version.

For draft day, put the folder on each laptop or host the folder from one machine on the local network.

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

## Offline draft flow

1. Import the player CSV.
2. Add or edit owners and team names.
3. Enter picks as players are announced.
4. Owners can use the available-player list and team dashboard from their own devices.
5. Export draft state periodically as a backup.

## Next likely upgrades

- Local-network sync so all devices see picks instantly from one host machine.
- Custom scoring presets.
- Spreadsheet import helpers for the existing `25 FB_Draft_Sheet.xlsx` and `FB25 Helper.xlsx` logic.
- Better roster slot rules by league format.
