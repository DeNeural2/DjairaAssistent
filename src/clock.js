// Read straight from the system clock rather than asked of the model. When the
// LLM was given a clock function to call, it skipped it and answered from
// imagination ("Сейчас это 10:30"), which is the failure mode to avoid: a wrong
// answer delivered with the same confidence as a right one.
const HOURS = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать",
  "семнадцать", "восемнадцать", "девятнадцать", "двадцать", "двадцать один", "двадцать два", "двадцать три"];

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function hourWord(h) {
  if (h % 10 === 1 && h !== 11) return "час";
  if ([2, 3, 4].includes(h % 10) && ![12, 13, 14].includes(h)) return "часа";
  return "часов";
}

function minuteWord(m) {
  if (m % 10 === 1 && m !== 11) return "минута";
  if ([2, 3, 4].includes(m % 10) && ![12, 13, 14].includes(m)) return "минуты";
  return "минут";
}

// Digits are spelled out because the TTS voice reads bare numerals unreliably.
export function buildTimeReply() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();

  const time = m === 0
    ? `Сейчас ровно ${HOURS[h]} ${hourWord(h)}.`
    : `Сейчас ${HOURS[h]} ${hourWord(h)} ${m} ${minuteWord(m)}.`;

  return `${time} Сегодня ${now.getDate()} ${MONTHS[now.getMonth()]}.`;
}
