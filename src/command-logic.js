export const COMMAND_SCHEMA = {
  type: "object",
  properties: {
    action: {
      enum: ["volume_up", "volume_down", "volume_set", "mute", "unmute", "start_work", "get_weather", "nothing_else", "unknown"]
    },
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

// The examples cost nothing at runtime: the session is reused and this prompt
// stays in the KV cache, so it's only evaluated once per app start rather than
// per command. They exist because the 1.5B model without them confused
// "сделай тише" with mute and classified unrelated speech as get_weather.
export const SYSTEM_PROMPT = `Ты — модуль распознавания голосовых команд для ассистента в Windows.
Пользователь говорит фразу на русском языке. Определи, что он хочет:
- volume_up — сделать ГРОМЧЕ (относительно текущей громкости)
- volume_down — сделать ТИШЕ (относительно текущей громкости), но звук НЕ выключается
- volume_set — поставить громкость на конкретное названное значение
- mute — полностью ВЫКЛЮЧИТЬ звук
- unmute — включить звук обратно
- start_work — начать работать, запустить рабочие программы
- get_weather — спросить про погоду или про то, что на улице
- nothing_else — отказ продолжать: "нет", "ничего", "хватит", "спасибо", "пока", "иди спать"
- unknown — фраза не подходит ни под один вариант выше

Примеры:
"сделай тише" -> {"action":"volume_down","amount":0,"city":""}
"потише пожалуйста" -> {"action":"volume_down","amount":0,"city":""}
"убавь на 20" -> {"action":"volume_down","amount":20,"city":""}
"сделай громче" -> {"action":"volume_up","amount":0,"city":""}
"погромче на 15" -> {"action":"volume_up","amount":15,"city":""}
"поставь громкость на 70" -> {"action":"volume_set","amount":70,"city":""}
"громкость 30 процентов" -> {"action":"volume_set","amount":30,"city":""}
"выключи звук" -> {"action":"mute","amount":0,"city":""}
"включи звук" -> {"action":"unmute","amount":0,"city":""}
"работаем" -> {"action":"start_work","amount":0,"city":""}
"скажи погоду" -> {"action":"get_weather","amount":0,"city":""}
"какая погода в Казани" -> {"action":"get_weather","amount":0,"city":"Казань"}
"как там на улице" -> {"action":"get_weather","amount":0,"city":""}
"нет спасибо" -> {"action":"nothing_else","amount":0,"city":""}
"иди спать" -> {"action":"nothing_else","amount":0,"city":""}
"расскажи анекдот" -> {"action":"unknown","amount":0,"city":""}
"который час" -> {"action":"unknown","amount":0,"city":""}

Правила:
- "тише"/"убавь"/"потише" — это ВСЕГДА volume_down, а не mute.
- volume_set только если названо конкретное целевое число громкости.
- city — в именительном падеже ("Казань", а не "в Казани"), иначе пустая строка.
- Если фраза не про громкость, погоду, работу или отказ — это unknown.
Отвечай только JSON.`;

export const ACTION_NAMES = {
  volume_up: "громче",
  volume_down: "тише",
  volume_set: "поставить громкость",
  mute: "выключить звук",
  unmute: "включить звук",
  start_work: "работаем",
  get_weather: "погода",
  nothing_else: "ничего больше",
  unknown: "непонятная команда"
};
