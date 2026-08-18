import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pictures rather than the Desktop: this is where Windows itself puts screenshots
// (Win+PrintScreen), and a folder that fills up over time shouldn't sit on the desktop.
const SHOTS_DIR = path.join(os.homedir(), "Pictures", "AuroraScreens");

// Static script, written once. Captures the whole virtual desktop, so a second
// monitor is included rather than silently cropped away.
const SCRIPT_PATH = path.join(__dirname, "..", ".screenshot.ps1");
fs.writeFileSync(SCRIPT_PATH, `param([string]$OutFile)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`, "utf8");

// Sortable and filesystem-safe: colons aren't legal in Windows filenames.
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Done through PowerShell rather than raw GDI calls: capturing via FFI would also
// mean hand-rolling a PNG encoder, and a screenshot is not on the latency-critical
// path the way the wake response is, so the ~1s of process startup is affordable.
export function takeScreenshot() {
  return new Promise(resolve => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const outFile = path.join(SHOTS_DIR, `${stamp()}.png`);

    const ps = spawn("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", SCRIPT_PATH, "-OutFile", outFile
    ], { stdio: "ignore" });

    ps.on("error", () => resolve({ ok: false, file: null }));
    ps.on("exit", code => {
      const ok = code === 0 && fs.existsSync(outFile);
      resolve({ ok, file: ok ? outFile : null });
    });
  });
}

export function buildScreenshotReply(result) {
  if (!result.ok) return "Не смогла сделать скриншот.";
  return `Скриншот сохранён в папку Аврора Скринс.`;
}
