import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import portAudio from "naudiodon2";
import vosk from "vosk-koffi";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { applyCommand, buildReply } from "./volume.js";
import { speak } from "./tts.js";
import { COMMAND_SCHEMA, SYSTEM_PROMPT } from "./command-logic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOSK_MODEL_PATH = path.join(__dirname, "..", "models", "vosk-model-ru");
const LLM_MODEL_PATH = path.join(__dirname, "..", "models", "qwen2.5-1.5b-instruct-q4_k_m.gguf");
const LAST_RECORDING_PATH = path.join(__dirname, "..", "last-recording.wav");

// Writes a minimal PCM16 mono WAV header, so the last recording can be opened
// and listened to for debugging capture quality (clipping, wrong device, etc).
function writeWav(filePath, pcmChunks, sampleRate) {
  const data = Buffer.concat(pcmChunks);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, data]));
}

async function main() {
  console.log("Загружаю Vosk (STT)...");
  vosk.setLogLevel(-1);
  const voskModel = new vosk.Model(VOSK_MODEL_PATH);

  console.log("Загружаю LLM (это может занять время при первом запуске)...");
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: LLM_MODEL_PATH });
  const context = await model.createContext();
  const grammar = await llama.createGrammarForJsonSchema(COMMAND_SCHEMA);

  const devices = portAudio.getDevices().filter(d => d.maxInputChannels > 0);
  console.log("\nДоступные микрофоны:");
  devices.forEach(d => console.log(`  [${d.id}] ${d.name} (родная частота: ${d.defaultSampleRate} Гц, API: ${d.hostAPIName})`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  let device;
  while (!device) {
    const deviceIdRaw = await ask("\nВведите ID микрофона из списка выше (без Enter по умолчанию — выберите явно, это важно): ");
    device = devices.find(d => d.id === parseInt(deviceIdRaw.trim(), 10));
    if (!device) console.log("Не найдено такое ID, попробуйте ещё раз.");
  }
  const deviceId = device.id;
  const sampleRate = device.defaultSampleRate;

  console.log(`\nВыбрано: "${device.name}", запись на ${sampleRate} Гц.`);
  if (/hands-free|hfp/i.test(device.hostAPIName + device.name) || sampleRate <= 8000) {
    console.log("ВНИМАНИЕ: похоже на Bluetooth-гарнитуру в режиме звонков (Hands-Free) — качество мика там низкое (обычно 8кГц, сжатие). Для распознавания речи лучше использовать встроенный микрофон ноутбука.");
  }

  console.log("\nГотово. Нажмите Enter, чтобы начать запись, ещё раз Enter — чтобы остановить. Ctrl+C для выхода.\n");

  while (true) {
    await ask("Нажмите Enter чтобы начать запись...");

    const recognizer = new vosk.Recognizer({ model: voskModel, sampleRate });
    const ai = new portAudio.AudioIO({
      inOptions: {
        channelCount: 1,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate,
        deviceId,
        closeOnError: true
      }
    });

    const chunks = [];
    let recording = true;
    ai.on("data", buf => {
      if (recording) {
        recognizer.acceptWaveform(buf);
        chunks.push(buf);
      }
    });
    ai.start();

    // Даём драйверу время реально начать поток, прежде чем разрешаем говорить —
    // иначе первые произнесённые слова теряются до того, как буфер пошёл.
    await new Promise(resolve => setTimeout(resolve, 400));
    console.log("Говорите!");

    await ask("Идёт запись... нажмите Enter чтобы остановить.");
    recording = false;
    ai.quit();

    writeWav(LAST_RECORDING_PATH, chunks, sampleRate);
    console.log(`(запись сохранена в ${LAST_RECORDING_PATH} — можно прослушать, если распознавание снова будет странным)`);

    const sttStart = performance.now();
    const { text } = recognizer.finalResult();
    const sttMs = (performance.now() - sttStart).toFixed(0);
    recognizer.free();

    console.log(`\n[STT, ${sttMs} мс] Распознано: "${text}"`);

    if (!text || text.trim() === "") {
      console.log("Пусто, ничего не распознано.\n");
      continue;
    }

    const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: SYSTEM_PROMPT });
    const llmStart = performance.now();
    const answer = await session.prompt(text, { grammar, maxTokens: 100 });
    const llmMs = (performance.now() - llmStart).toFixed(0);

    const parsed = grammar.parse(answer);
    console.log(`[LLM, ${llmMs} мс] JSON:`, JSON.stringify(parsed));

    const result = await applyCommand(parsed.action, parsed.amount);
    const reply = buildReply(parsed, result);
    console.log(`Ответ: ${reply}`);

    await speak(reply);
    console.log("");

    await session.dispose({ disposeSequence: true });
  }
}

main().catch(err => {
  console.error("Ошибка:", err);
  process.exit(1);
});
