# zed-workspace-snapshots

Named workspace snapshots for Zed.

Zed already remembers recent sessions, but it does not give you an explicit "save this multi-folder setup as a named workspace" flow. This tool fills that gap by saving the latest multi-folder workspace from Zed's local SQLite database and reopening it later through the `zed` CLI.

It is for people who regularly work across many repos at once and want commands like:

```bash
zed-workspace save cqr-stack
zed-workspace save customer-a --workspace 12
zed-workspace save-visible day-start
zed-workspace open cqr-stack
```

## Why

- Save a 5 to 30 folder Zed setup with a human name
- Reopen a known project stack without relying on "whatever Zed restored last"
- Keep multiple named contexts for different clients, products, or debugging sessions
- Layer on top of Zed without patching Zed itself

## How it works

- Reads the latest workspace from Zed's local DB
- Can target a specific live workspace row by workspace id
- Can save all currently visible Zed workspaces in one command
- Stores the current folder list as a JSON snapshot
- Reopens that snapshot later with the `zed` CLI
- Captures open-tab metadata when Zed has already persisted it, including approximate line position
- Captures terminal working-directory metadata and prints restore hints on open

## Scope

What works:

- Multi-folder workspace snapshots
- Named save, list, show, delete, and reopen flows
- Live workspace selection with `workspaces` and `save --workspace <id>`
- One-step capture of all visible windows with `save-visible [prefix]`
- Simple local install with no extra dependencies beyond `node`, `sqlite3`, and `zed`
- Terminal working directories are captured for later reference

Current limits:

- Folder restore is reliable
- Open-tab restore is best effort and depends on what Zed has already written to its DB
- Pane layout, active focus, and terminal recreation are not yet restored
- Terminal restore is currently hint-based, not automatic terminal creation

## Requirements

- macOS
- `node`
- `sqlite3`
- `zed` on your `PATH`

The default Zed database path used by this tool is:

```text
~/Library/Application Support/Zed/db/0-stable/db.sqlite
```

## Install

### npm

```bash
npm install -g zed-workspace-snapshots
```

### Quick start

```bash
zed-workspace workspaces
zed-workspace save infra --workspace 12
zed-workspace save-visible day-start
zed-workspace open infra
```

### Local install

```bash
mkdir -p "$HOME/.local/bin"
ln -sf "$PWD/zed-workspace.js" "$HOME/.local/bin/zed-workspace"
chmod +x ./zed-workspace.js
```

## Usage

```bash
zed-workspace save cqr-stack
zed-workspace save cqr-stack --workspace 12
zed-workspace save-visible
zed-workspace save-visible day-start
zed-workspace workspaces
zed-workspace list
zed-workspace show cqr-stack
zed-workspace delete old-stack
zed-workspace open cqr-stack
```

## Snapshot storage

- Snapshot JSON files: `~/.config/zed-workspace-snapshots`
- Source of truth for live Zed workspace state: `~/Library/Application Support/Zed/db/0-stable/db.sqlite`

## Environment variables

- `ZED_DB_PATH`: override the Zed SQLite DB path
- `ZED_WORKSPACE_STORE_DIR`: override where snapshots are stored

## Example use cases

- `zed-workspace save customer-a`
- `zed-workspace save infra-debug`
- `zed-workspace save quarter-end-release`
- `zed-workspace save-visible day-start`

## Positioning

`Named workspace snapshots for Zed power users`

That is sharper than generic "workspace management" because Zed already has automatic session restore. The real gap is explicit, reusable, named saves for complex multi-folder setups.

## Roadmap

- Better automatic terminal restoration
- Better best-effort tab reopening
- Optional shell completions
- Homebrew or npm distribution

## License

MIT
