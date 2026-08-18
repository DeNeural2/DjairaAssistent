// One entry per command, and everything the model sees is generated from it —
// the JSON schema, the description list and the few-shot examples in the prompt.
// Adding a command means adding an entry here plus its handler in assistant.js,
// instead of editing an enum, a prompt and a name map separately.
//
// Deliberately NOT the LLM's own tool calling, which would have removed the
// registry entirely. Measured on this 1.5B model: tool calling classified 8 of 11
// commands against 15 of 15 here, took 3.4 s per command against 1.6 s (it needs
// a second inference pass to phrase the reply), and — for the very case that
// motivated trying it — never called the clock function, inventing times like
// "Сейчас это 10:30" instead. Classification stays here; the actual work is done
// by plain JS, so an answer like the time can't be hallucinated.
export const COMMANDS = [
  {
    action: "volume_down",
    describe: "сделать ТИШЕ (относительно текущей громкости), но звук НЕ выключается",
    examples: [
      ["сделай тише", {}],
      ["потише пожалуйста", {}],
      ["убавь на 20", { amount: 20 }]
    ]
  },
  {
    action: "volume_up",
    describe: "сделать ГРОМЧЕ (относительно текущей громкости)",
    examples: [
      ["сделай громче", {}],
      ["погромче на 15", { amount: 15 }]
    ]
  },
  {
    action: "volume_set",
    describe: "поставить громкость на конкретное названное значение",
    examples: [
      ["поставь громкость на 70", { amount: 70 }],
      ["громкость 30 процентов", { amount: 30 }]
    ]
  },
  {
    action: "mute",
    describe: "полностью ВЫКЛЮЧИТЬ звук",
    examples: [["выключи звук", {}]]
  },
  {
    action: "unmute",
    describe: "включить звук обратно",
    examples: [["включи звук", {}]]
  },
  {
    action: "start_work",
    describe: "начать работать, запустить рабочие программы",
    examples: [["работаем", {}]]
  },
  {
    action: "get_weather",
    describe: "спросить про погоду или про то, что на улице",
    examples: [
      ["скажи погоду", {}],
      ["какая погода в Казани", { city: "Казань" }],
      ["как там на улице", {}]
    ]
  },
  {
    action: "get_time",
    describe: "спросить текущее время или дату",
    examples: [
      ["сколько времени", {}],
      ["который час", {}],
      ["какое сегодня число", {}]
    ]
  },
  {
    action: "screenshot",
    describe: "сделать снимок экрана",
    examples: [
      ["сделай скриншот", {}],
      ["скриншот", {}],
      ["сними экран", {}]
    ]
  },
  {
    action: "screen_off",
    describe: "погасить монитор, выключить экран (компьютер продолжает работать)",
    examples: [
      ["выключи экран", {}],
      ["погаси монитор", {}],
      ["выключи монитор", {}]
    ]
  },
  {
    action: "nothing_else",
    describe: 'отказ продолжать: "нет", "ничего", "хватит", "спасибо", "пока", "иди спать"',
    examples: [
      ["нет спасибо", {}],
      ["иди спать", {}]
    ]
  },
  {
    action: "unknown",
    describe: "фраза не подходит ни под один вариант выше",
    examples: [
      ["расскажи анекдот", {}],
      ["спой песню", {}]
    ]
  }
];

export const COMMAND_SCHEMA = {
  type: "object",
  properties: {
    action: { enum: COMMANDS.map(c => c.action) },
    amount: {
      type: "number",
      description: "Meaning depends on action: for volume_up/volume_down, how many percent to change by (0 if not mentioned). For volume_set, the exact target volume percent (0-100)."
    },
    city: {
      type: "string",
      description: "Only for get_weather: city name mentioned by the user, in nominative case (e.g. 'Казань', not 'в Казани'). Empty string if no city was mentioned or action isn't get_weather."
    }
  }
};

// Examples are written out in full because the model copies their shape; a
// partial object would teach it to omit fields. They cost nothing at runtime —
// the session is reused, so this prompt is evaluated once per app start rather
// than per command. Without them the model confused "сделай тише" with mute and
// classified unrelated speech as get_weather.
function exampleLine(text, fields) {
  const json = JSON.stringify({
    action: fields.action,
    amount: fields.amount ?? 0,
    city: fields.city ?? ""
  });
  return `"${text}" -> ${json}`;
}

export const SYSTEM_PROMPT = `Ты — модуль распознавания голосовых команд для ассистента в Windows.
Пользователь говорит фразу на русском языке. Определи, что он хочет:
${COMMANDS.map(c => `- ${c.action} — ${c.describe}`).join("\n")}

Примеры:
${COMMANDS.flatMap(c => c.examples.map(([text, fields]) => exampleLine(text, { ...fields, action: c.action }))).join("\n")}

Правила:
- "тише"/"убавь"/"потише" — это ВСЕГДА volume_down, а не mute.
- volume_set только если названо конкретное целевое число громкости.
- city — в именительном падеже ("Казань", а не "в Казани"), иначе пустая строка.
- Если фраза не подходит ни под один вариант — это unknown.
Отвечай только JSON.`;

export const ACTION_NAMES = {
  volume_up: "громче",
  volume_down: "тише",
  volume_set: "поставить громкость",
  mute: "выключить звук",
  unmute: "включить звук",
  start_work: "работаем",
  get_weather: "погода",
  get_time: "время",
  screenshot: "скриншот",
  screen_off: "выключить экран",
  nothing_else: "ничего больше",
  unknown: "непонятная команда"
};
