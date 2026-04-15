#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_DB_PATH = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Zed",
  "db",
  "0-stable",
  "db.sqlite",
);

const DEFAULT_STORE_DIR = path.join(
  os.homedir(),
  ".config",
  "zed-workspace-snapshots",
);

class CliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode || 1;
  }
}

function fail(message, options) {
  throw new CliError(message, options);
}

function usage() {
  console.log(`Usage:
  zed-workspace save <name>     Save the latest Zed workspace snapshot
  zed-workspace open <name>     Reopen a saved snapshot in a new Zed workspace
  zed-workspace list            List saved snapshots
  zed-workspace show <name>     Print the saved JSON snapshot
  zed-workspace delete <name>   Delete a saved snapshot
\nEnvironment:
  ZED_DB_PATH                   Override the Zed SQLite DB path
  ZED_WORKSPACE_STORE_DIR       Override where snapshots are stored
`);
}

function ensureToolExists(tool) {
  const result = spawnSync("which", [tool], { encoding: "utf8" });
  if (result.error) {
    fail(`Unable to check required tool '${tool}': ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Missing required tool: ${tool}`);
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    fail(`Failed to run '${command}': ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    fail(stderr || `Command failed: ${command} ${args.join(" ")}`);
  }

  return result.stdout;
}

function runZed(args, action) {
  const result = spawnSync("zed", args, { stdio: "inherit" });
  if (result.error) {
    fail(`Failed to ${action}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Zed exited with status ${result.status || 1} while ${action}.`, {
      exitCode: result.status || 1,
    });
  }
}

function dbPath() {
  return process.env.ZED_DB_PATH || DEFAULT_DB_PATH;
}

function storeDir() {
  return process.env.ZED_WORKSPACE_STORE_DIR || DEFAULT_STORE_DIR;
}

function snapshotPath(name) {
  return path.join(storeDir(), `${name}.json`);
}

function isSafeName(name) {
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function ensureStoreDir() {
  try {
    fs.mkdirSync(storeDir(), { recursive: true });
  } catch (error) {
    fail(`Failed to create snapshot directory '${storeDir()}': ${error.message}`);
  }
}

function sql(query) {
  const db = dbPath();
  if (!fs.existsSync(db)) {
    fail(`Zed DB not found at ${db}`);
  }

  return runCommand("sqlite3", ["-json", db, query]);
}

function loadJsonRows(query) {
  const raw = sql(query).trim();
  if (!raw) {
    return [];
  }

  return parseJson(raw, "Failed to parse sqlite3 JSON output");
}

function parseJson(text, errorPrefix) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${errorPrefix}: ${error.message}`);
  }
}

function latestWorkspace() {
  const rows = loadJsonRows(`
    SELECT
      workspace_id,
      timestamp,
      session_id,
      window_id,
      paths,
      paths_order
    FROM workspaces
    WHERE paths IS NOT NULL AND paths <> ''
    ORDER BY timestamp DESC
    LIMIT 1;
  `);

  if (rows.length === 0) {
    fail("No saved Zed workspace rows were found in the local DB.");
  }

  return rows[0];
}

function workspaceEditors(workspaceId) {
  return loadJsonRows(`
    SELECT
      i.pane_id,
      i.position,
      i.active,
      i.preview,
      e.buffer_path
    FROM items i
    JOIN editors e
      ON e.item_id = i.item_id
     AND e.workspace_id = i.workspace_id
    WHERE i.workspace_id = ${Number(workspaceId)}
      AND e.buffer_path IS NOT NULL
      AND e.buffer_path <> ''
    ORDER BY i.pane_id, i.position;
  `);
}

function workspaceTerminals(workspaceId) {
  return loadJsonRows(`
    SELECT
      item_id,
      working_directory_path,
      custom_title
    FROM terminals
    WHERE workspace_id = ${Number(workspaceId)}
      AND working_directory_path IS NOT NULL
      AND working_directory_path <> ''
    ORDER BY item_id;
  `);
}

function readUtf8File(file, errorPrefix) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    fail(`${errorPrefix}: ${error.message}`);
  }
}

function loadSnapshot(name) {
  const file = snapshotPath(name);
  if (!fs.existsSync(file)) {
    fail(`Snapshot not found: ${name}`);
  }

  const snapshotText = readUtf8File(file, `Failed to read snapshot '${name}'`);
  const snapshot = parseJson(snapshotText, `Snapshot '${name}' contains invalid JSON`);

  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    fail(`Snapshot '${name}' is not a valid snapshot object.`);
  }

  return { file, snapshot };
}

function countPhrase(count, noun) {
  return `${count} ${noun}(s)`;
}

function warn(message) {
  console.error(`Warning: ${message}`);
}

function snapshotArray(snapshot, key) {
  const value = snapshot[key];
  if (!Array.isArray(value)) {
    if (key === "folders") {
      fail("Snapshot is missing a valid 'folders' array.");
    }
    return [];
  }

  return value;
}

function loadSnapshotForList(name) {
  try {
    return loadSnapshot(name).snapshot;
  } catch (error) {
    if (error instanceof CliError) {
      warn(`Skipping snapshot '${name}': ${error.message}`);
      return null;
    }
    throw error;
  }
}

function listSnapshotFiles() {
  try {
    return fs
      .readdirSync(storeDir(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    fail(`Failed to read snapshot directory '${storeDir()}': ${error.message}`);
  }
}

function splitLines(text) {
  return text
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function writeSnapshot(name, snapshot) {
  try {
    fs.writeFileSync(snapshotPath(name), `${JSON.stringify(snapshot, null, 2)}\n`);
  } catch (error) {
    fail(`Failed to write snapshot '${name}': ${error.message}`);
  }
}

function save(name) {
  if (!isSafeName(name)) {
    fail("Snapshot name must match [A-Za-z0-9._-]+");
  }

  ensureStoreDir();

  const workspace = latestWorkspace();
  const paths = splitLines(workspace.paths);

  if (paths.length === 0) {
    fail("The latest workspace row does not contain any folders.");
  }

  const tabs = workspaceEditors(workspace.workspace_id)
    .map((row) => ({
      paneId: row.pane_id,
      position: row.position,
      active: !!row.active,
      preview: row.preview == null ? null : !!row.preview,
      path: row.buffer_path,
    }));
  const terminals = workspaceTerminals(workspace.workspace_id)
    .map((row) => ({
      itemId: row.item_id,
      workingDirectory: row.working_directory_path,
      customTitle: row.custom_title || null,
    }));

  const snapshot = {
    name,
    savedAt: new Date().toISOString(),
    zedDbPath: dbPath(),
    sourceWorkspace: {
      workspaceId: workspace.workspace_id,
      timestamp: workspace.timestamp,
      sessionId: workspace.session_id || null,
      windowId: workspace.window_id || null,
    },
    folders: paths,
    openTabs: tabs,
    terminals,
  };

  writeSnapshot(name, snapshot);

  const savedParts = [countPhrase(snapshot.folders.length, "folder")];
  if (tabs.length) {
    savedParts.push(countPhrase(tabs.length, "tab"));
  }
  if (terminals.length) {
    savedParts.push(countPhrase(terminals.length, "terminal"));
  }
  console.log(`Saved '${name}' with ${savedParts.join(", ")}.`);
  console.log(snapshotPath(name));
}

function list() {
  ensureStoreDir();

  const files = listSnapshotFiles();

  if (files.length === 0) {
    console.log("No saved workspace snapshots.");
    return;
  }

  for (const file of files) {
    const name = path.basename(file, ".json");
    const snapshot = loadSnapshotForList(name);
    if (!snapshot) {
      continue;
    }

    let folders;
    try {
      folders = snapshotArray(snapshot, "folders");
    } catch (error) {
      if (error instanceof CliError) {
        warn(`Skipping snapshot '${name}': ${error.message}`);
        continue;
      }
      throw error;
    }

    const tabs = snapshotArray(snapshot, "openTabs");
    const terminals = snapshotArray(snapshot, "terminals");
    console.log(
      `${snapshot.name || name}\t${folders.length} folder(s)\t${tabs.length} tab(s)\t${terminals.length} terminal(s)\t${snapshot.savedAt || "unknown"}`,
    );
  }
}

function show(name) {
  const { file } = loadSnapshot(name);
  process.stdout.write(readUtf8File(file, `Failed to read snapshot '${name}'`));
}

function open(name) {
  const { snapshot } = loadSnapshot(name);
  const existingFolders = snapshotArray(snapshot, "folders").filter((folder) => fs.existsSync(folder));

  if (existingFolders.length === 0) {
    fail(`None of the saved folders for '${name}' exist anymore.`);
  }

  runZed(["-n", ...existingFolders], "opening folders");

  const existingTabs = snapshotArray(snapshot, "openTabs")
    .map((tab) => tab.path)
    .filter((tabPath) => fs.existsSync(tabPath));

  if (existingTabs.length > 0) {
    runZed(["-a", ...existingTabs], "reopening tabs");
  }

  const existingTerminals = snapshotArray(snapshot, "terminals").filter(
    (terminal) => terminal.workingDirectory && fs.existsSync(terminal.workingDirectory),
  );

  if (existingTerminals.length > 0) {
    console.log("");
    console.log(`Terminal restore hints for '${name}':`);
    for (const terminal of existingTerminals) {
      const titleSuffix = terminal.customTitle ? ` # title: ${terminal.customTitle}` : "";
      console.log(`  cd ${JSON.stringify(terminal.workingDirectory)}${titleSuffix}`);
    }
  }
}

function deleteSnapshot(name) {
  const { file } = loadSnapshot(name);
  try {
    fs.unlinkSync(file);
  } catch (error) {
    fail(`Failed to delete snapshot '${name}': ${error.message}`);
  }
  console.log(`Deleted snapshot '${name}'.`);
}

function requireArg(command, arg) {
  if (arg) {
    return arg;
  }

  usage();
  process.exit(1);
}

function main() {
  try {
    const [command, arg] = process.argv.slice(2);
    switch (command) {
      case "save":
        ensureToolExists("sqlite3");
        save(requireArg(command, arg));
        break;
      case "open":
        ensureToolExists("zed");
        open(requireArg(command, arg));
        break;
      case "list":
        list();
        break;
      case "show":
        show(requireArg(command, arg));
        break;
      case "delete":
        deleteSnapshot(requireArg(command, arg));
        break;
      default:
        usage();
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      process.exit(error.exitCode);
    }

    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

main();
