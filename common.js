// Shared between content script, options page, and popup.
// Standard Gamepad API button layout (Xbox naming shown; PS equivalents in parens).
const CC_BUTTON_NAMES = {
  0: "A (Cross)",
  1: "B (Circle)",
  2: "X (Square)",
  3: "Y (Triangle)",
  4: "LB (L1)",
  5: "RB (R1)",
  6: "LT (L2)",
  7: "RT (R2)",
  8: "Back / Select (Share)",
  9: "Start (Options)",
  10: "Left Stick Click (L3)",
  11: "Right Stick Click (R3)",
  12: "D-Pad Up",
  13: "D-Pad Down",
  14: "D-Pad Left",
  15: "D-Pad Right",
  16: "Home / Guide"
};

// Actions the content script / background can perform.
// repeat: true means holding the button re-fires the action.
const CC_ACTIONS = {
  none:           { label: "— Unassigned —" },
  playPause:      { label: "Play / Pause video" },
  mute:           { label: "Mute / Unmute video" },
  volumeUp:       { label: "Volume up", repeat: true },
  volumeDown:     { label: "Volume down", repeat: true },
  seekForward:    { label: "Seek forward", repeat: true },
  seekBackward:   { label: "Seek backward", repeat: true },
  speedUp:        { label: "Playback speed +0.25x" },
  speedDown:      { label: "Playback speed -0.25x" },
  fullscreen:     { label: "Toggle fullscreen" },
  cursorClick:    { label: "Click (virtual cursor)" },
  toggleKeyboard: { label: "Toggle on-screen keyboard" },
  scrollUp:       { label: "Scroll up", repeat: true },
  scrollDown:     { label: "Scroll down", repeat: true },
  scrollTop:      { label: "Jump to top of page" },
  scrollBottom:   { label: "Jump to bottom of page" },
  historyBack:    { label: "Browser back" },
  historyForward: { label: "Browser forward" },
  reload:         { label: "Reload page" },
  nextTab:        { label: "Next tab" },
  prevTab:        { label: "Previous tab" },
  newTab:         { label: "New tab" },
  closeTab:       { label: "Close tab" },
  reopenTab:      { label: "Reopen closed tab" },
  customKey:      { label: "Custom key press…" }
};

// Actions that must run in the background service worker (browser-level).
const CC_BACKGROUND_ACTIONS = new Set([
  "nextTab", "prevTab", "newTab", "closeTab", "reopenTab", "windowFullscreen"
]);

// Binding values are either an action id string, or for custom keys:
// { action: "customKey", key: "k", code: "KeyK" }
const CC_DEFAULT_CONFIG = {
  bindings: {
    0: "playPause",
    1: "mute",
    2: "fullscreen",
    3: "scrollTop",
    4: "prevTab",
    5: "nextTab",
    6: "seekBackward",
    7: "seekForward",
    8: "historyBack",
    9: "historyForward",
    10: "toggleKeyboard",
    11: "cursorClick",
    12: "volumeUp",
    13: "volumeDown",
    14: "seekBackward",
    15: "seekForward",
    16: "none"
  },
  settings: {
    scrollSpeed: 28,     // max px per frame from analog stick
    cursorSpeed: 14,     // max px per frame for the virtual cursor
    seekStep: 10,        // seconds per seek press
    volumeStep: 0.05,    // volume change per press (0..1)
    deadzone: 0.2,       // analog stick deadzone
    repeatDelay: 400,    // ms before hold starts repeating
    repeatInterval: 130, // ms between repeats while held
    hudEnabled: true     // on-screen feedback toast
  }
};

function ccNormalizeConfig(raw) {
  const cfg = {
    bindings: { ...CC_DEFAULT_CONFIG.bindings },
    settings: { ...CC_DEFAULT_CONFIG.settings }
  };
  if (raw && typeof raw === "object") {
    if (raw.bindings) {
      for (const [btn, val] of Object.entries(raw.bindings)) {
        if (typeof val === "string" && CC_ACTIONS[val]) cfg.bindings[btn] = val;
        else if (val && typeof val === "object" && val.action === "customKey" && val.key) cfg.bindings[btn] = val;
      }
    }
    if (raw.settings) {
      for (const key of Object.keys(cfg.settings)) {
        if (raw.settings[key] !== undefined) cfg.settings[key] = raw.settings[key];
      }
    }
  }
  return cfg;
}
