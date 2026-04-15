# zed-workspace-snapshots

Named workspace snapshots for Zed.

This CLI saves Zed's current multi-folder workspace from Zed's local SQLite database and reopens it later through the `zed` CLI.

## Install

```bash
npm install -g zed-workspace-snapshots
```

## Quick start

```bash
zed-workspace workspaces
zed-workspace save infra --workspace 12
zed-workspace save-visible day-start
zed-workspace open infra
```

## Commands

- `zed-workspace workspaces`
- `zed-workspace save <name> [--workspace <id>]`
- `zed-workspace save-visible [prefix]`
- `zed-workspace list`
- `zed-workspace open <name>`
- `zed-workspace show <name>`
- `zed-workspace delete <name>`

## Current behavior

- Restores saved folder sets reliably
- Reopens tabs best-effort when Zed has persisted them
- Saves all currently visible Zed workspaces with `save-visible`
- Prints terminal working-directory restore hints on `open`
- Does not yet restore pane layout, active focus, or live terminal sessions

## Requirements

- macOS
- `node`
- `sqlite3`
- `zed` on your `PATH`

The default Zed database path is:

```text
~/Library/Application Support/Zed/db/0-stable/db.sqlite
```

Snapshots are stored in:

```text
~/.config/zed-workspace-snapshots
```

## Release

```bash
# bump package.json version first
git tag v0.3.0
git push origin v0.3.0
```

The GitHub Actions publish workflow will verify the tag matches `package.json`, publish to npm, and create the GitHub release.

## License

MIT
