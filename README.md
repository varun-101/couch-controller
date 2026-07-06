# 🎮 Couch Controller

A Chrome extension that turns your game controller into a TV-style remote for the
browser: control video volume and seeking, scroll pages, switch tabs, toggle
fullscreen — all remappable, including binding controller buttons to arbitrary
keyboard keys.

Works with any controller Chrome's Gamepad API recognizes (Xbox, PlayStation,
Switch Pro, most generic USB/Bluetooth pads).

## Install

**[Get it from the Chrome Web Store](https://chromewebstore.google.com/detail/odlaphcdndfenefjhmoneehgjbcpkhof)** — one click, free.

Then connect your controller and press any button on a normal web page —
a "Controller connected" toast confirms it's working.

<details>
<summary>Install from source (for development)</summary>

1. Open `chrome://extensions` in Chrome (or Edge/Brave).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this folder.
</details>

## Default controls (Xbox naming, PS equivalents apply)

| Input | Action |
|---|---|
| **Left stick** | Scroll the page (vertical & horizontal) |
| **Right stick** | Move the virtual cursor (slight tilt = precise, full tilt = fast) |
| **R3** (right stick click) | Click at the cursor |
| **L3** (left stick click) | Toggle the on-screen keyboard |
| **A** (Cross) | Play / pause video |
| **B** (Circle) | Mute / unmute |
| **X** (Square) | Toggle fullscreen |
| **Y** (Triangle) | Jump to top of page |
| **LB / RB** (L1/R1) | Previous / next tab |
| **LT / RT** (L2/R2) | Seek backward / forward |
| **D-Pad ↑↓** | Volume up / down |
| **D-Pad ←→** | Seek backward / forward |
| **Back/Select** (Share) | Browser back |
| **Start** (Options) | Browser forward |

Hold a repeatable button (volume, seek, scroll) to keep firing it.

## Virtual cursor & on-screen keyboard

The **right stick** drives a virtual cursor (extensions can't move the real
mouse pointer). Aiming at things dispatches hover events, so menus and video
player controls appear as you point. Press **R3** to click — links, buttons,
and video players all work, and clicking a text field focuses it.

Press **L3** to toggle the **on-screen keyboard**. While it's open the
controller drives the keyboard exclusively (normal bindings pause):

| Input | Keyboard action |
|---|---|
| Sticks / D-pad | Move the key selection (wraps around) |
| **A** or **R3** | Press the selected key |
| **B** | Backspace (hold to repeat) |
| **X** | Space |
| **Y** | Shift |
| **Start** | Enter |
| **Select** or **L3** | Close the keyboard |

Shift works one character at a time (mobile-style) and turns the digit row
into symbols. Enter submits search boxes / forms, or inserts a newline in
multi-line fields. The keyboard also responds to a real mouse.

## Customizing

Click the extension icon → **Buttons & settings** (or right-click the icon →
Options). There you can:

- **Rebind every button** — press a button on the controller to highlight its
  row, then pick an action. Actions include tab management (new/close/reopen
  tab), playback speed, page reload, jump to top/bottom, and more.
- **Custom key press** — bind a button to type any keyboard key (with
  modifiers) into the page. Great for site shortcuts, e.g. YouTube's `c`
  for captions or `>` for speed.
- **Combo bindings** — bind two or more controller buttons together, such as
  **LB (L1)** + **RB (R1)** for **New tab**.
- **Open specific tab** — bind a button or combo to open a URL, such as
  `netflix.com`, in a new tab.
- **Tune behavior** — scroll speed, seek step, volume step, stick deadzone,
  and the on-screen HUD toggle.

Settings sync via your Chrome profile.

## Good to know (browser limitations)

- **The focused tab has control.** Chrome only delivers gamepad input to the
  window/tab that has focus — that's a browser security rule, not a setting.
- **Chrome's own pages are off-limits.** Extensions can't run on
  `chrome://` pages, the Web Store, or the default New Tab page, so the
  controller goes quiet there. Switch tabs with LB/RB to get back to a normal
  page.
- **Fullscreen fallback.** Browsers require a "user gesture" for element
  fullscreen and gamepad input doesn't count. The extension first tries the
  site player's own fullscreen button, then the video element, and falls back
  to fullscreening the whole browser window (like F11) when the DOM API
  refuses.
- **DRM players** (Netflix and similar) may ignore direct seeking; the custom
  key-press binding mapped to the site's own shortcut keys usually works there.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 definition |
| `common.js` | Shared defaults, action catalog, button names |
| `content.js` | Gamepad polling, action execution, on-screen HUD |
| `background.js` | Tab switching, window fullscreen (service worker) |
| `options.*` | Settings/rebinding UI |
| `popup.*` | Toolbar popup with connection status |
