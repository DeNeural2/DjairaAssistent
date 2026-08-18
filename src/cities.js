import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CITIES_PATH = path.join(__dirname, "..", "config", "cities.json");

const { cities } = JSON.parse(fs.readFileSync(CITIES_PATH, "utf8"));

// Answers to "это <город>, верно?" are either a confirmation or a city name, so
// the recognizer for that moment is restricted to exactly that. Measured on
// noisy audio: free-form recognition turned "нет, Бая Маре" into "не твоя
// наргиз", while the same audio under this grammar still came out correct.
// "[unk]" lets Vosk report anything outside the grammar instead of forcing a
// wrong match onto it.
const CONFIRM_WORDS = [
  "да", "нет", "верно", "неверно", "точно", "ага", "угу",
  "не тот", "не тот город", "другой город", "правильно", "не правильно"
];

export const CITY_GRAMMAR = [...CONFIRM_WORDS, ...cities.map(c => c.spoken), "[unk]"];

// Longest spoken form first, so "клуж напока" wins over the bare "клуж".
const byLength = [...cities].sort((a, b) => b.spoken.length - a.spoken.length);

// Returns the geocoding query for whichever configured city the text mentions.
// Exact substring matching is enough here precisely because the grammar above
// guarantees the text can only contain these phrases.
export function findCity(text) {
  const t = text.toLowerCase();
  const hit = byLength.find(c => t.includes(c.spoken));
  return hit ? hit.query : null;
}
