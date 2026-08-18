import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESETS_PATH = path.join(__dirname, "..", "config", "presets.json");

// How long to give an app to show up in the process list before calling it failed.
// Kept just under the time it takes to speak the reply, so the wait overlaps with
// speech instead of adding dead air — at 6s it was costing ~3s of silence per run.
const LAUNCH_CHECK_DELAY_MS = 3500;

function loadPresets() {
  return JSON.parse(fs.readFileSync(PRESETS_PATH, "utf8"));
}

// Launches every app in the named preset. Each app is launched independently, so
// a missing/broken path for one doesn't stop the others, and they all stay running
// after this process (or the assistant) exits.
//
// Launching goes through explorer.exe rather than spawning the .exe directly.
// Spawning directly worked for Telegram but silently failed for GitHub Desktop —
// its Squirrel launcher stub exits 0 without ever starting the app, with or
// without the working directory its own shortcut uses. Handing the path to
// explorer starts it the way a double-click in the shell does, which works for
// both. explorer.exe itself exits immediately either way, so its exit code says
// nothing about the app — verifyLaunched() below is what actually confirms it.
export async function runPreset(name) {
  const presets = loadPresets();
  const preset = presets[name];
  if (!preset) return { failed: [], unknownPreset: true, message: null };

  const failed = [];

  for (const exePath of preset.apps) {
    try {
      if (!fs.existsSync(exePath)) throw new Error("file not found");
      const child = spawn("explorer.exe", [exePath], { detached: true, stdio: "ignore" });
      child.unref();
    } catch (e) {
      failed.push({ path: exePath, reason: e.message });
    }
  }

  return { failed, unknownPreset: false, message: preset.message_to_say, apps: preset.apps };
}

// A successful spawn proves nothing: launcher stubs (GitHub Desktop's, for one)
// exit 0 immediately after handing off, so an app that never actually opened
// looks identical to one that did. This checks the process list afterwards so a
// silent failure can at least be reported out loud instead of going unnoticed.
export async function verifyLaunched(apps) {
  await new Promise(r => setTimeout(r, LAUNCH_CHECK_DELAY_MS));

  let running = "";
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/fo", "csv", "/nh"], { maxBuffer: 4 * 1024 * 1024 });
    running = stdout.toLowerCase();
  } catch {
    return [];
  }

  return apps
    .map(p => path.basename(p))
    .filter(exe => !running.includes(`"${exe.toLowerCase()}"`));
}

export function buildPresetReply(result) {
  if (result.unknownPreset) {
    return "Работаем. Не нашла настроенный набор программ.";
  }

  const parts = [result.message ?? "Запускаю."];
  if (result.failed.length > 0) {
    parts.push(`Не смогла запустить: ${result.failed.map(f => path.basename(f.path)).join(", ")}.`);
  }
  return parts.join(" ");
}
