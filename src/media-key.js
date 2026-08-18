import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const keybd_event = user32.func("void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)");

const KEYEVENTF_KEYUP = 0x0002;

const VK_MEDIA_PLAY_PAUSE = 0xB3;
const VK_SPACE = 0x20;

// Media play/pause instead of Space by default. Space only pauses a video when
// the player window happens to be focused — if the focus is in an editor or chat
// box, Space types a space character into it instead, and the video keeps
// playing. The media key is routed to whatever is playing regardless of focus,
// which is what "pause the video when I call her" actually needs.
// Set to "space" to send Space instead.
const PAUSE_KEY = "media";

function tap(vk) {
  keybd_event(vk, 0, 0, 0);
  keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
}

function send() {
  try {
    tap(PAUSE_KEY === "space" ? VK_SPACE : VK_MEDIA_PLAY_PAUSE);
    return true;
  } catch (e) {
    console.log("Не удалось отправить клавишу паузы:", e.message);
    return false;
  }
}

// Windows has no separate play and pause keys — there is only a toggle — so the
// pause/resume pair has to stay balanced by hand. This flag guarantees exactly
// one toggle out and one back: without it, a second wake before the first resumed
// would restart playback instead of keeping it paused, and a stray resume would
// start playing something nobody asked for.
let pausedByUs = false;

export function pauseMedia() {
  if (pausedByUs) return;
  if (send()) pausedByUs = true;
}

export function resumeMedia() {
  if (!pausedByUs) return;
  if (send()) pausedByUs = false;
}
