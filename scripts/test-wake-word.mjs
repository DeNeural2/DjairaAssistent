// Run after editing NAME_FORMS in src/wake-word.js:
//   node scripts/test-wake-word.mjs
// Wake-spotting now uses the RUSSIAN model, so these strings are Russian — what
// the model actually transcribes. Whenever the console logs "услышано, не похоже
// на wake word", paste that text in below: into POSITIVES if it was a real call
// that got missed, NEGATIVES otherwise.
import { matchesWake } from "../src/wake-word.js";

// Should trigger. Several of these are verbatim transcripts from the noise tests,
// where the greeting itself got mangled but the name survived.
const POSITIVES = [
  "аврора",
  "хей аврора",
  "эй аврора",
  "привет аврора",
  "аврора ты тут",
  "окей аврора",        // "Хей Аврора" как её услышала модель
  "ты аврора",
  "перед аврора",
  "и аврора",
  "эй авроры",          // склонённая форма
  "аврора ты слышишь"
];

// Should NOT trigger — ordinary speech, including the phrases that a grammar-based
// matcher wrongly turned into "аврора".
const NEGATIVES = [
  "сделай погромче",
  "какая сегодня погода",
  "запусти программы работаем",
  "нет спасибо ничего не нужно",
  "я вчера смотрел новый сериал",
  "автора этой книги я не помню",     // одна буква от "аврора"
  "у меня в квартире прорвало трубу",
  "выключи звук совсем",
  "поставь громкость на семьдесят",
  "автор сценария неизвестен",
  "мы обсуждали автора вчера",
  "я долго думал про аврору и решил что это хорошее имя"  // длинная фраза
];

let missed = 0, falsePositives = 0;

console.log("=== ДОЛЖНО срабатывать ===");
for (const t of POSITIVES) {
  const n = matchesWake(t);
  if (!n) missed++;
  console.log(`  ${n ? "ДА " : "нет"}  "${t}"${n ? "" : "   <-- ПРОПУСК"}`);
}

console.log("\n=== НЕ должно срабатывать ===");
for (const t of NEGATIVES) {
  const n = matchesWake(t);
  if (n) falsePositives++;
  console.log(`  ${n ? "ЛОЖНО" : "ок   "}  "${t}"${n ? "   <-- ЛОЖНОЕ СРАБАТЫВАНИЕ" : ""}`);
}

console.log(`\nПропусков: ${missed}/${POSITIVES.length}, ложных: ${falsePositives}/${NEGATIVES.length}`);
