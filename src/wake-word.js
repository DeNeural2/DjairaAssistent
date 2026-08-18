import portAudio from "naudiodon2";
import vosk from "vosk-koffi";

// Listens with the RUSSIAN model, not an English one. The name is spoken in
// Russian — "а-ВРО-ра" — while English "aurora" is "o-RO-ra" with no consonant
// between the vowels, so an English model physically cannot produce the word:
// in real logs it returned "evra", "ah broaden", "nevada", "a our". Every one of
// those has the "в" the English word lacks. The Russian model has "аврора" in
// its vocabulary and transcribes it directly.
//
// Free-form recognition rather than a Vosk grammar. A grammar was measurably
// better at hearing the name (5/5 under heavy noise) but forced ordinary speech
// into its word list too: "сделай погромче" and "автора этой книги" both came
// back as "аврора". Free-form got 4-5 of 5 with zero false positives across nine
// ordinary Russian phrases at every noise level, which is the better trade for
// something listening all day.
//
// Matching is exact per word, never fuzzy: "автора" is a single edit away from
// "аврора", so any tolerance would swallow a very common Russian word.
const NAME_FORMS = new Set(["аврора", "авроры", "авроре", "аврору", "авророй", "аврор"]);

// Room for a greeting in front of the name ("привет аврора"), but not for the
// name turning up deep inside a sentence.
const MAX_NAME_POSITION = 2;
const MAX_WINDOW_WORDS = 6;

export function matchesWake(text) {
  // \b is ASCII-only in JS and never matches around Cyrillic, so words are
  // compared after splitting rather than with a word-boundary regex.
  const words = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_WINDOW_WORDS) return false;

  const limit = Math.min(words.length, MAX_NAME_POSITION + 1);
  for (let i = 0; i < limit; i++) {
    if (NAME_FORMS.has(words[i])) return true;
  }
  return false;
}

// Continuously listens on the mic for the wake phrase. Calls onWake() (awaiting it)
// each time it's detected, then resumes listening once onWake's promise settles —
// so the mic is never open for wake-spotting while the assistant is speaking/recording
// a command, avoiding any feedback loop through the speakers.
//
// Takes an already-loaded model rather than a path: the assistant has the Russian
// model in memory for commands anyway, and wake-spotting never overlaps with
// command recording, so the two share one copy instead of loading a second.
export function listenForWakeWord({ model, deviceId, sampleRate, onWake }) {
  let stopped = false;
  // The currently open listening pass, so an external trigger (the hotkey) can
  // close the mic before the command recorder tries to open it — two streams on
  // the same device at once do not coexist.
  let current = null;

  function fire() {
    if (!current || current.triggered) return false;
    current.triggered = true;
    current.ai.quit();
    current.recognizer.free();
    current = null;
    Promise.resolve(onWake()).finally(cycle);
    return true;
  }

  function cycle() {
    if (stopped) return;

    const recognizer = new vosk.Recognizer({ model, sampleRate });
    const ai = new portAudio.AudioIO({
      inOptions: {
        channelCount: 1,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate,
        deviceId,
        closeOnError: true
      }
    });

    current = { ai, recognizer, triggered: false };

    ai.on("data", buf => {
      if (!current || current.triggered) return;
      const isEndpoint = recognizer.acceptWaveform(buf);
      const text = isEndpoint ? recognizer.result().text : recognizer.partialResult().partial;

      if (matchesWake(text)) {
        fire();
      } else if (isEndpoint) {
        // Debug aid: shows what was actually heard, so NAME_FORMS can be extended
        // from real mishearings rather than guesses.
        if (text.trim()) console.log(`  (услышано, не похоже на wake word: "${text}")`);
        recognizer.reset();
      }
    });

    ai.start();
  }

  cycle();

  return {
    stop() {
      stopped = true;
    },
    // Wakes her without the wake word. Returns false if a dialog is already
    // running, so a stray press mid-conversation is ignored rather than opening
    // a second recorder on the same microphone.
    trigger: fire
  };
}
