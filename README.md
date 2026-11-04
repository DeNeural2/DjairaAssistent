# Aurora — Offline Voice Assistant for Windows

Aurora is a Russian-speaking voice assistant for Windows written in Node.js.
Speech recognition, command understanding and speech synthesis all run
**locally**, with no cloud APIs: only the weather command goes online.

Say "Аврора" (or press Ctrl+Alt+A), then give a command in Russian.

## Features

- **Wake word** "Аврора" detected with a Russian Vosk model, plus a hotkey
  (Ctrl+Alt+A) for noisy rooms.
- **Local LLM command classification** — Qwen2.5 1.5B (GGUF) via
  node-llama-cpp with a JSON schema, so the model only picks the command and its
  parameters; the actual work is done by plain JavaScript and cannot be
  hallucinated.
- **Commands:**
  - volume up / down / set to a value, mute, unmute;
  - "start work" preset: launches a configured set of apps;
  - current weather for your location or a named city (Open-Meteo);
  - current time and date;
  - screenshot;
  - turn the monitor off.
- **Offline text-to-speech** with Piper (Russian voice `ru_RU-irina-medium`).
- **Follow-up dialog** — after a command it asks "Что-нибудь ещё?" and goes back
  to standby on "нет", "хватит", "спасибо".
- Pauses media playback while listening and resumes it after.
- **System tray icon** and silent autostart at login.
- Conversation log for troubleshooting.

## Tech stack

Node.js (ES modules), Vosk (`vosk-koffi`), node-llama-cpp, Piper TTS,
PortAudio (`naudiodon2`), Windows API calls via `koffi` (user32, winmm),
`systray2`, `loudness`, Open-Meteo API.

## How a command is processed

1. Microphone audio is streamed to Vosk until the wake word is heard.
2. The command is recorded and transcribed.
3. The local LLM maps the text to one of the commands in
   `src/command-logic.js` (schema, descriptions and examples are generated from
   one registry).
4. A JavaScript handler runs the command and Piper speaks the reply.

## Setup

Requirements: Windows 10/11, Node.js 18+, a microphone.

```bash
npm install
```

Models are not stored in the repository. Put them here:

```
models/vosk-model-ru-small/                    Vosk Russian model
models/qwen2.5-1.5b-instruct-q4_k_m.gguf      LLM for command classification
models/piper-voices/ru_RU-irina-medium.onnx   Piper voice (+ .onnx.json)
tools/piper/piper.exe                          Piper TTS binary
```

Apps for the "start work" preset are set in `config/presets.json`.

Run:

```bash
node src/assistant.js
```

Autostart without a console window: add `scripts/start-hidden.vbs` to Windows
startup. Output goes to `logs/assistant.log`.

## Project structure

```
src/assistant.js       Main loop: wake word → record → classify → act → reply
src/command-logic.js   Command registry and LLM prompt/schema
src/wake-word.js       Wake word detection
src/tts.js             Piper text-to-speech
src/volume.js, presets.js, weather.js, clock.js, screenshot.js, display.js
                       Command handlers
src/tray.js, hotkey.js, media-key.js, conversation-log.js
config/                Presets and city list
scripts/               Autostart and helper scripts
```

## Author

Serhii Kucherenko — Full-Stack Developer
[LinkedIn](https://www.linkedin.com/in/serhii-kucherenko-dev) ·
[GitHub](https://github.com/DeNeural2)
