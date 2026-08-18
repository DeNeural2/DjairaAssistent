import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const GetAsyncKeyState = user32.func("int16 GetAsyncKeyState(int vKey)");

const VK_CONTROL = 0x11;
const VK_MENU = 0x12; // Alt
const VK_A = 0x41;

const POLL_MS = 120;

function isDown(vk) {
  // High bit of the return value means the key is currently held.
  return (GetAsyncKeyState(vk) & 0x8000) !== 0;
}

// A second way to wake her, for when the room is too loud for the wake word to
// land — measured speaker-ID scores collapse in exactly that situation, so a
// deterministic trigger is the honest fix rather than a smarter voice gate.
//
// Polled rather than registered as a system hotkey: RegisterHotKey needs a
// window message loop, which this process doesn't have, and polling two key
// states every 120 ms is far cheaper than the wake-word recognizer already
// running continuously.
export function listenForHotkey({ onTrigger }) {
  let wasDown = false;
  let busy = false;

  const timer = setInterval(async () => {
    const down = isDown(VK_CONTROL) && isDown(VK_MENU) && isDown(VK_A);
    // Edge-triggered: fires once per press, not repeatedly while held.
    if (down && !wasDown && !busy) {
      busy = true;
      try {
        await onTrigger();
      } finally {
        busy = false;
      }
    }
    wasDown = down;
  }, POLL_MS);

  return { stop() { clearInterval(timer); } };
}
