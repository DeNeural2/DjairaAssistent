import loudness from "loudness";
import { ACTION_NAMES } from "./command-logic.js";

const DEFAULT_STEP = 10;

// Cached in-memory, not re-queried from the OS on every command: loudness's Windows
// helper doesn't reliably reflect a just-applied change to an immediate next query
// (observed race), and since this module is the sole writer during a session, trusting
// our own last-applied value is both correct and avoids that race entirely.
let cachedState = null;

async function getState() {
  if (!cachedState) {
    const [volume, muted] = await Promise.all([loudness.getVolume(), loudness.getMuted()]);
    cachedState = { volume, muted };
  }
  return cachedState;
}

// Applies a classified command to the real system volume and reports what happened,
// so the caller can build a spoken reply without re-querying state.
export async function applyCommand(action, amount) {
  const before = await getState();
  let next;

  switch (action) {
    case "volume_up": {
      const step = amount > 0 ? amount : DEFAULT_STEP;
      if (before.volume >= 100 && !before.muted) return { ...before, alreadyAtLimit: true };
      next = { volume: Math.min(100, before.volume + step), muted: false };
      break;
    }
    case "volume_down": {
      const step = amount > 0 ? amount : DEFAULT_STEP;
      if (before.volume <= 0 && !before.muted) return { ...before, alreadyAtLimit: true };
      next = { volume: Math.max(0, before.volume - step), muted: false };
      break;
    }
    case "volume_set": {
      const target = Math.max(0, Math.min(100, Math.round(amount)));
      if (before.volume === target && !before.muted) return { ...before, alreadyAtLimit: true };
      next = { volume: target, muted: false };
      break;
    }
    case "mute":
      if (before.muted) return { ...before, alreadyAtLimit: true };
      next = { ...before, muted: true };
      break;
    case "unmute":
      if (!before.muted) return { ...before, alreadyAtLimit: true };
      next = { ...before, muted: false };
      break;
    default:
      return { ...before, alreadyAtLimit: false };
  }

  if (next.muted !== before.muted) await loudness.setMuted(next.muted);
  if (next.volume !== before.volume) await loudness.setVolume(next.volume);
  cachedState = next;

  return { ...next, alreadyAtLimit: false };
}

// Builds the spoken/console reply from the classified command and what actually
// happened to the system volume — kept as plain JS, not LLM output, so the reply
// about real system state is always accurate.
export function buildReply(parsed, result) {
  const echoed = `${ACTION_NAMES[parsed.action] ?? parsed.action}.`;

  if (parsed.action === "unknown") {
    return `${echoed} Не поняла, что нужно сделать.`;
  }

  if (result.alreadyAtLimit) {
    if (parsed.action === "volume_down") return `${echoed} Звук уже выключен на нуле, дальше уменьшать некуда.`;
    if (parsed.action === "volume_up") return `${echoed} Звук уже на максимуме.`;
    if (parsed.action === "volume_set") return `${echoed} Громкость уже на этом уровне.`;
    if (parsed.action === "mute") return `${echoed} Звук и так выключен.`;
    if (parsed.action === "unmute") return `${echoed} Звук и так включён.`;
  }

  return `${echoed} Готово. Громкость ${result.volume} процентов${result.muted ? ", звук выключен" : ""}.`;
}
