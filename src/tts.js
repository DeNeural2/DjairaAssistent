import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import koffi from "koffi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPER_DIR = path.join(__dirname, "..", "tools", "piper");
const PIPER_EXE = path.join(PIPER_DIR, "piper.exe");
const VOICE_MODEL = path.join(__dirname, "..", "models", "piper-voices", "ru_RU-irina-medium.onnx");
const OUT_DIR = path.join(os.tmpdir(), "aurora-tts");

// <1.0 speeds speech up, >1.0 slows it down (piper default is 1.0).
const LENGTH_SCALE = "0.72";
// Slightly above piper defaults (0.667 / 0.8) — adds a bit more pitch/pacing
// variation so it reads less flat, without changing voice or engine.
const NOISE_SCALE = "0.75";
const NOISE_W = "0.85";

const winmm = koffi.load("winmm.dll");
const PlaySoundA = winmm.func("int PlaySoundA(const char *pszSound, void *hmod, unsigned int fdwSound)");
const SND_SYNC = 0x0000;
const SND_ASYNC = 0x0001;
const SND_FILENAME = 0x00020000;

// Piper is kept running for the whole app lifetime instead of spawned per call:
// spawning it fresh costs ~0.5-1s per utterance just reloading the voice model.
// It reads one line of text per synthesis request from stdin and prints the
// resulting wav path to stdout (--output_dir mode), so it can be reused indefinitely.
let piperProcess = null;
let pendingResolve = null;

function ensurePiper() {
  if (piperProcess) return piperProcess;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  piperProcess = spawn(PIPER_EXE, [
    "-m", VOICE_MODEL,
    "--length_scale", LENGTH_SCALE,
    "--noise_scale", NOISE_SCALE,
    "--noise_w", NOISE_W,
    "--output_dir", OUT_DIR,
    "-q"
  ], { cwd: PIPER_DIR });

  const rl = readline.createInterface({ input: piperProcess.stdout });
  rl.on("line", line => {
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(line.trim());
    }
  });

  piperProcess.on("exit", () => { piperProcess = null; });

  return piperProcess;
}

function synthesize(text) {
  ensurePiper();
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    piperProcess.stdin.write(text.replace(/\n/g, " ") + "\n", err => {
      if (err) reject(err);
    });
  });
}

export async function speak(text) {
  const wavPath = await synthesize(text);
  PlaySoundA(wavPath, null, SND_FILENAME | SND_SYNC);
  fs.rm(wavPath, () => {});
}

// Fire-and-forget: starts playback and returns without waiting for it to finish.
// Confirmed by measurement that this doesn't block/slow down concurrent LLM
// inference (unlike the synchronous PlaySoundA call speak() uses), so it's safe
// to use for a filler line spoken *while* something else is being computed —
// a later speak() call will cut it off automatically (default PlaySound behavior)
// once the real reply is ready, so no manual stop bookkeeping is needed.
export async function speakAsync(text) {
  const wavPath = await synthesize(text);
  PlaySoundA(wavPath, null, SND_FILENAME | SND_ASYNC);
  setTimeout(() => fs.rm(wavPath, () => {}), 8000);
}
