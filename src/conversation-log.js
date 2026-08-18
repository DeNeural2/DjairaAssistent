import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOG_PATH = path.join(os.homedir(), "Desktop", "Aurora-log.txt");

function timestamp() {
  return new Date().toLocaleString("ru-RU");
}

function append(lines) {
  fs.appendFileSync(LOG_PATH, lines.join("\n") + "\n", "utf8");
}

export function logWake() {
  append([`[${timestamp()}] === Aurora ===`]);
}

export function logExchange({ heard, sttMs, understood, llmMs, said }) {
  append([
    `[${timestamp()}] Вы: "${heard}" (распознано за ${sttMs} мс)`,
    `[${timestamp()}] Аврора поняла: ${JSON.stringify(understood)} (за ${llmMs} мс)`,
    `[${timestamp()}] Аврора ответила: "${said}"`,
    ""
  ]);
}

export function logSleep() {
  append([`[${timestamp()}] --- уснула, ждёт Aurora ---`, ""]);
}
