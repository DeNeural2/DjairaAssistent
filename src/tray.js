import path from "node:path";
import { fileURLToPath } from "node:url";
import systray2Pkg from "systray2";

// systray2 is CJS transpiled from TS with esModuleInterop, so Node's CJS->ESM
// interop double-wraps it: the real constructor is one level deeper than the
// default import.
const SysTray = systray2Pkg.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_PATH = path.join(__dirname, "..", "assets", "tray-icon.ico");

// Tray icon showing Aurora is running, with a way to shut her down without
// digging through Task Manager. systray2 bundles a prebuilt native helper
// binary per platform — no compilation needed.
export function startTray({ onExit }) {
  const itemStatus = {
    title: "Аврора работает",
    tooltip: "",
    checked: false,
    enabled: false
  };

  const itemExit = {
    title: "Выключить Аврору",
    tooltip: "Остановить ассистента",
    checked: false,
    enabled: true,
    click: () => {
      systray.kill(false);
      onExit();
    }
  };

  const systray = new SysTray({
    menu: {
      icon: ICON_PATH,
      title: "Аврора",
      tooltip: "Аврора — голосовой ассистент",
      items: [itemStatus, SysTray.separator, itemExit]
    },
    debug: false,
    copyDir: false
  });

  systray.onClick(action => {
    if (action.item.click != null) action.item.click();
  });

  systray.ready().catch(err => {
    console.error("Не удалось запустить трей-иконку:", err.message);
  });

  return systray;
}
