import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import portAudio from "naudiodon2";
import vosk from "vosk-koffi";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { applyCommand, buildReply } from "./volume.js";
import { runPreset, buildPresetReply, verifyLaunched } from "./presets.js";
import { speak, speakAsync } from "./tts.js";
import { listenForWakeWord } from "./wake-word.js";
import { recordCommand } from "./record-command.js";
import { COMMAND_SCHEMA, SYSTEM_PROMPT } from "./command-logic.js";
import {
  detectLaptopLocation, geocodeCity, getCurrentWeather, buildWeatherReply,
  CONFIRM_CITY_SCHEMA, CONFIRM_CITY_PROMPT
} from "./weather.js";
import { startTray } from "./tray.js";
import { logWake, logExchange, logSleep } from "./conversation-log.js";
import { pauseMedia, resumeMedia } from "./media-key.js";
import { CITY_GRAMMAR, findCity } from "./cities.js";
import { listenForHotkey } from "./hotkey.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Measured on this machine: the big Russian model costs 5.4 GB RAM and 163 s to
// load, the small one 175 MB and 1.2 s — 31x the memory for a model that still
// garbled commands in practice ("да сделайте на семьдесят поставь звук"). Since
// the LLM downstream now reliably fixes garbled STT, the small model is the far
// better trade. Switch this to "vosk-model-ru" to go back to the big one.
const RU_MODEL_NAME = "vosk-model-ru-small";

const RU_MODEL_PATH = path.join(__dirname, "..", "models", RU_MODEL_NAME);
const LLM_MODEL_PATH = path.join(__dirname, "..", "models", "qwen2.5-1.5b-instruct-q4_k_m.gguf");

// Prompts here are ~750 tokens; the 32768-token default context allocated ~900 MB
// of KV cache that was never touched. Two sequences: one for the command
// classifier, one for the weather city-confirmation dialog.
const LLM_CONTEXT_SIZE = 2048;
const LLM_SEQUENCES = 2;

// Picked randomly per wake instead of LLM-generated — free (no extra inference
// latency on the hot path we just optimized), still enough variety to not feel canned.
const WAKE_GREETINGS = [
  "Я тут, слушаю команду.",
  "Да, слушаю.",
  "Готова, говорите.",
  "Слушаю вас.",
  "На связи, что нужно сделать?",
  "Да-да, я здесь.",
  "Внимательно слушаю."
];

const ANYTHING_ELSE_PHRASES = [
  "Что-нибудь ещё?",
  "Ещё что-то нужно?",
  "Что дальше?",
  "Чем ещё помочь?"
];

const GOODBYE_PHRASES = [
  "Хорошо, я в режиме ожидания.",
  "Поняла, ухожу слушать.",
  "Ладно, зову если что.",
  "Окей, засыпаю."
];

// Spoken async (fire-and-forget, doesn't block LLM classification running
// concurrently — measured) right after capturing the command, so there's no
// dead silence while the LLM thinks.
const THINKING_PHRASES = [
  "Секунду.",
  "Сейчас.",
  "Момент.",
  "Обрабатываю."
];

const MAX_EMPTY_RETRIES = 2;

// Cheap pre-check used only to decide whether to play a "thinking" filler —
// doesn't replace the real LLM classification (that still runs regardless for
// accuracy), just avoids the awkward "Секунду..." right before she says goodbye
// for an obvious decline like "иди спать"/"ничего не нужно".
const DECLINE_HINTS = ["нет", "хватит", "спасибо", "пока", "всё", "ничего", "спать", "стоп", "отбой"];

function looksLikeDecline(text) {
  const t = text.toLowerCase();
  return DECLINE_HINTS.some(hint => t.includes(hint));
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Matched by name+API rather than raw id — portaudio's device ids can shift after
// driver updates/reboots, but the name+hostAPI pairing stays stable.
const DEFAULT_DEVICE_NAME = "Microphone Array (AMD Audio Device)";
const DEFAULT_DEVICE_API = "Windows WASAPI";

async function chooseDevice() {
  const devices = portAudio.getDevices().filter(d => d.maxInputChannels > 0);

  const defaultDevice = devices.find(d => d.name === DEFAULT_DEVICE_NAME && d.hostAPIName === DEFAULT_DEVICE_API);
  if (defaultDevice) {
    console.log(`\nМикрофон по умолчанию: [${defaultDevice.id}] ${defaultDevice.name} (${defaultDevice.defaultSampleRate} Гц, ${defaultDevice.hostAPIName})`);
    return { deviceId: defaultDevice.id, sampleRate: defaultDevice.defaultSampleRate };
  }

  console.log(`\nМикрофон по умолчанию ("${DEFAULT_DEVICE_NAME}", ${DEFAULT_DEVICE_API}) не найден — выберите вручную.`);
  console.log("\nДоступные микрофоны:");
  devices.forEach(d => console.log(`  [${d.id}] ${d.name} (родная частота: ${d.defaultSampleRate} Гц, API: ${d.hostAPIName})`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  let device;
  while (!device) {
    const raw = await ask("\nВведите ID микрофона из списка выше: ");
    device = devices.find(d => d.id === parseInt(raw.trim(), 10));
    if (!device) console.log("Не найдено такое ID, попробуйте ещё раз.");
  }
  rl.close();

  if (/hands-free|hfp/i.test(device.hostAPIName + device.name) || device.defaultSampleRate <= 8000) {
    console.log("ВНИМАНИЕ: похоже на Bluetooth-гарнитуру в режиме звонков — качество распознавания там будет низким.");
  }

  return { deviceId: device.id, sampleRate: device.defaultSampleRate };
}

async function main() {
  const { deviceId, sampleRate } = await chooseDevice();
  vosk.setLogLevel(-1);

  // Loaded eagerly before wake-word listening starts: this app runs autostarted
  // in the background, so a real "Aurora" must never land mid-load.
  const loadStart = performance.now();
  console.log("\nЗагружаю модели...");
  const ruModel = new vosk.Model(RU_MODEL_PATH);
  const llama = await getLlama();
  const llmModel = await llama.loadModel({ modelPath: LLM_MODEL_PATH });
  const context = await llmModel.createContext({ contextSize: LLM_CONTEXT_SIZE, sequences: LLM_SEQUENCES });
  const grammar = await llama.createGrammarForJsonSchema(COMMAND_SCHEMA);
  const confirmCityGrammar = await llama.createGrammarForJsonSchema(CONFIRM_CITY_SCHEMA);

  // One long-lived session instead of a fresh one per command: recreating it
  // forced the ~750-token system prompt to be re-evaluated every time (~5.8 s
  // per command). Reusing it keeps that prompt in the KV cache, so only the
  // short user phrase is evaluated (~1.6 s). resetChatHistory() between commands
  // keeps them independent — nothing carries over from the previous one.
  const commandSession = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: SYSTEM_PROMPT });
  const confirmSession = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: CONFIRM_CITY_PROMPT });

  // The very first inference in a process costs ~6.5 s; every one after it takes
  // ~1.4 s. Measured: that penalty is a one-off startup cost, not decay during
  // idle — a call after 90 s of doing nothing was still 1.5 s, and periodic
  // "keep-warm" pings changed nothing. So the cost is paid here, at startup,
  // where nobody is waiting, instead of landing on the first real command.
  const warmStart = performance.now();
  await commandSession.prompt("проверка", { grammar, maxTokens: 20 });
  commandSession.resetChatHistory();
  console.log(`(прогрев LLM: ${((performance.now() - warmStart) / 1000).toFixed(1)} с)`);

  console.log(`(модели загружены за ${((performance.now() - loadStart) / 1000).toFixed(1)} с, RSS ${Math.round(process.memoryUsage().rss / 1024 / 1024)} МБ)`);

  // Weather needs a city. If none was mentioned, guess one from the laptop's IP
  // location and ask for confirmation instead of acting on a guess silently —
  // IP geolocation is approximate and can be a city or two off.
  // Asks for a city with recognition restricted to the configured list. Free-form
  // recognition mangles uncommon place names badly ("Бая Маре" came back as
  // "Барбаракенд"); under this grammar the same words survive even heavy noise.
  async function askForCity(question) {
    const asking = speak(question);
    console.log("Слушаю город...");
    const answerText = await recordCommand({
      model: ruModel, deviceId, sampleRate, startAfter: asking, grammar: CITY_GRAMMAR
    });
    console.log(`Ответ: "${answerText}"`);
    return answerText;
  }

  async function handleWeather(city) {
    let targetCity, lat, lon;

    if (city && city.trim()) {
      let geo = await geocodeCity(city.trim());
      if (!geo) {
        // The name came through free-form recognition and may be garbled, so
        // re-ask under the city grammar instead of giving up on it.
        const retry = await askForCity(`Не нашла город ${city}. Повторите название.`);
        const known = findCity(retry);
        geo = known ? await geocodeCity(known) : null;
        if (!geo) return `Всё равно не разобрала город. Добавьте его в список городов.`;
      }
      ({ city: targetCity, lat, lon } = geo);
    } else {
      let detected;
      try {
        detected = await detectLaptopLocation();
      } catch {
        return "Не смогла определить город по геолокации, назовите его явно.";
      }

      const answerText = await askForCity(`Это ${detected.city}, верно?`);

      // The grammar guarantees any city in the answer is spelled exactly as
      // configured, so it's matched directly — no LLM guessing at the name,
      // which is what once turned "в ноябре" into the city "Noviembre".
      const named = findCity(answerText);
      if (named) {
        const geo = await geocodeCity(named);
        if (!geo) return `Не нашла город ${named}.`;
        ({ city: targetCity, lat, lon } = geo);
      } else {
        if (answerText.trim()) speakAsync(pickRandom(THINKING_PHRASES));
        const raw = await confirmSession.prompt(answerText || "да", { grammar: confirmCityGrammar, maxTokens: 60 });
        const confirmParsed = confirmCityGrammar.parse(raw);
        confirmSession.resetChatHistory();

        if (confirmParsed.confirmed || !confirmParsed.city?.trim()) {
          ({ city: targetCity, lat, lon } = detected);
        } else {
          const geo = await geocodeCity(confirmParsed.city.trim());
          if (!geo) return `Не нашла город ${confirmParsed.city}.`;
          ({ city: targetCity, lat, lon } = geo);
        }
      }
    }

    try {
      const weather = await getCurrentWeather(lat, lon);
      return buildWeatherReply(targetCity, weather);
    } catch {
      return `Не смогла получить погоду для города ${targetCity}, проверьте интернет.`;
    }
  }

  // Keeps taking commands in the same wake without requiring "Aurora" again —
  // after each one it asks "anything else?" and loops back, until the answer
  // classifies as nothing_else (or recognition comes up empty a couple times in
  // a row, e.g. the user just walked away).
  async function handleCommand(greeting) {
    let readySignal = greeting;
    let emptyRetries = 0;

    while (true) {
      // recordCommand opens the mic immediately and only starts actually listening
      // once readySignal resolves, so the stream is already warm by the time Aurora
      // stops talking.
      const sttStart = performance.now();
      console.log("Слушаю команду...");
      const text = await recordCommand({ model: ruModel, deviceId, sampleRate, startAfter: readySignal });
      const sttMs = performance.now() - sttStart;
      console.log(`[STT ${sttMs.toFixed(0)} мс] Команда: "${text}"`);

      if (!text.trim()) {
        emptyRetries++;
        if (emptyRetries > MAX_EMPTY_RETRIES) {
          await speak("Не слышу, засыпаю.");
          logSleep();
          return;
        }
        readySignal = speak("Не расслышала, повторите.");
        continue;
      }
      emptyRetries = 0;

      // Fired without awaiting: confirmed this doesn't slow down the LLM call
      // below since it runs concurrently, not before it — just fills the silence.
      // Skipped for obvious declines ("иди спать", "хватит") — she's about to say
      // goodbye right after, so "секунду, обрабатываю" first would be jarring.
      if (!looksLikeDecline(text)) speakAsync(pickRandom(THINKING_PHRASES));

      const llmStart = performance.now();
      const answer = await commandSession.prompt(text, { grammar, maxTokens: 60 });
      const parsed = grammar.parse(answer);
      commandSession.resetChatHistory();
      const llmMs = performance.now() - llmStart;
      console.log(`[LLM ${llmMs.toFixed(0)} мс] JSON:`, JSON.stringify(parsed));

      if (parsed.action === "nothing_else") {
        const said = pickRandom(GOODBYE_PHRASES);
        await speak(said);
        logExchange({ heard: text, sttMs: sttMs.toFixed(0), understood: parsed, llmMs: llmMs.toFixed(0), said });
        logSleep();
        return;
      }

      let reply;
      let pendingLaunchCheck = null;
      if (parsed.action === "start_work") {
        const result = await runPreset("start_work");
        reply = buildPresetReply(result);
        // Checked in the background: it needs several seconds for windows to
        // appear, and the spoken reply shouldn't wait on that.
        pendingLaunchCheck = verifyLaunched(result.apps ?? []);
      } else if (parsed.action === "get_weather") {
        // Prefer a configured city found in what was actually said over the LLM's
        // reading of it: on "скажи погоду бая маре" the model answered "Байкал",
        // which geocodes fine and so failed silently to a real but wrong place.
        reply = await handleWeather(findCity(text) ?? parsed.city);
      } else {
        const result = await applyCommand(parsed.action, parsed.amount);
        reply = buildReply(parsed, result);
      }
      console.log(`Ответ: ${reply}`);
      logExchange({ heard: text, sttMs: sttMs.toFixed(0), understood: parsed, llmMs: llmMs.toFixed(0), said: reply });
      await speak(reply);

      if (pendingLaunchCheck) {
        const missing = await pendingLaunchCheck;
        if (missing.length > 0) {
          const warning = `Кстати, не открылось: ${missing.join(", ")}.`;
          console.log(warning);
          logExchange({ heard: "(проверка запуска)", sttMs: 0, understood: { missing }, llmMs: 0, said: warning });
          await speak(warning);
        }
      }

      readySignal = speak(pickRandom(ANYTHING_ELSE_PHRASES));
    }
  }

  async function onWake() {
    console.log("\n[Aurora]");
    logWake();
    // Before greeting, not after: silencing the video first also stops it from
    // bleeding into the mic while the command is being recorded.
    pauseMedia();
    const greeting = speak(pickRandom(WAKE_GREETINGS));
    try {
      await handleCommand(greeting);
    } finally {
      // In `finally` and placed here rather than inside handleCommand: the dialog
      // can end several ways (declined, nothing heard, an error mid-command), and
      // the video should come back in all of them, not just the tidy one. By this
      // point she has finished speaking, so playback doesn't talk over her.
      resumeMedia();
    }
    console.log("\nЖду \"Aurora\"...");
  }

  startTray({
    onExit: () => {
      console.log("\nВыключение по команде из трея.");
      process.exit(0);
    }
  });

  // Spoken before the wake-word mic stream opens, not after. The trigger is now
  // the bare name, and this line says it out loud twice — with the listener live
  // it would reliably wake her on her own announcement.
  await speak("Аврора готова к работе. Жду команду Хей Аврора.");
  console.log("\nСлушаю \"Aurora\", либо Ctrl+Alt+A. Ctrl+C для выхода.\n");
  const wake = listenForWakeWord({ model: ruModel, deviceId, sampleRate, onWake });

  // Deterministic alternative to the wake word for when the room is too loud for
  // it to be heard — goes through the wake listener so the microphone is handed
  // over properly instead of being opened twice.
  listenForHotkey({ onTrigger: () => { if (wake.trigger()) console.log("(разбудили горячей клавишей)"); } });
}

main().catch(err => {
  console.error("Ошибка:", err);
  process.exit(1);
});
