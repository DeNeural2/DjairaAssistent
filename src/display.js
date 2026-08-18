import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const SendMessageW = user32.func("intptr SendMessageW(void *hWnd, uint32 Msg, uintptr wParam, intptr lParam)");

const HWND_BROADCAST = 0xffff;
const WM_SYSCOMMAND = 0x0112;
const SC_MONITORPOWER = 0xf170;

const MONITOR_OFF = 2;
const MONITOR_ON = -1;

function setMonitor(state) {
  // hWnd is passed as a plain integer handle rather than a pointer object; koffi
  // accepts a number for a void* parameter.
  SendMessageW(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, state);
}

// Any mouse movement or keypress turns the display back on — that's Windows'
// own behaviour, not something this can prevent. She keeps listening while the
// screen is dark.
export function turnScreenOff() {
  try {
    setMonitor(MONITOR_OFF);
    return true;
  } catch (e) {
    console.log("Не удалось выключить экран:", e.message);
    return false;
  }
}

export function turnScreenOn() {
  try {
    setMonitor(MONITOR_ON);
    return true;
  } catch {
    return false;
  }
}
