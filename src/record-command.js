import portAudio from "naudiodon2";
import vosk from "vosk-koffi";

const MAX_RECORD_MS = 8000;

// Records one command utterance and returns its recognized text. Uses Vosk's own
// endpointing (acceptWaveform returns true once it detects a pause after speech)
// to know when the user is done talking, instead of a fixed duration or manual stop.
//
// The mic stream opens immediately, but incoming audio is only fed to the recognizer
// once `startAfter` resolves (defaults to already-resolved). This lets the caller open
// the stream *before* finishing a TTS prompt like "I'm listening" — by the time the
// prompt is done playing, the stream has been warming up for its whole duration instead
// of starting cold, and since audio is discarded (not accepted) until then, there's no
// risk of the prompt's own voice leaking into the recognizer through mic/speaker bleed.
// `grammar` optionally restricts recognition to a fixed list of phrases. Used when
// the expected answer is known (a yes/no plus a city name), where it's dramatically
// more robust in noise than free-form decoding. Leave it out for open-ended commands.
export function recordCommand({ model, deviceId, sampleRate, startAfter, grammar }) {
  return new Promise((resolve, reject) => {
    const recognizer = grammar
      ? new vosk.Recognizer({ model, sampleRate, grammar })
      : new vosk.Recognizer({ model, sampleRate });
    const ai = new portAudio.AudioIO({
      inOptions: {
        channelCount: 1,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate,
        deviceId,
        closeOnError: true
      }
    });

    let finished = false;
    let armed = false;
    let timeout = null;

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      ai.quit();
      const { text } = recognizer.finalResult();
      recognizer.free();
      resolve(text || "");
    }

    ai.on("data", buf => {
      if (finished || !armed) return;
      if (recognizer.acceptWaveform(buf)) finish();
    });
    ai.on("error", err => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(err);
    });

    ai.start();

    Promise.resolve(startAfter).then(() => {
      if (finished) return;
      armed = true;
      timeout = setTimeout(finish, MAX_RECORD_MS);
    });
  });
}
