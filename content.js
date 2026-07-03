// Couch Controller — content script.
// Polls the Gamepad API on the focused page and executes bound actions.
(() => {
  "use strict";

  let config = ccNormalizeConfig(null);
  let gamepadIndex = null;
  let pollHandle = null;

  // Per-button state for edge detection and hold-repeat.
  const buttonState = {}; // index -> { pressed, downAt, lastRepeat }

  chrome.storage.sync.get("config", (data) => {
    config = ccNormalizeConfig(data.config);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.config) {
      config = ccNormalizeConfig(changes.config.newValue);
    }
  });

  // ---------------------------------------------------------------- gamepad

  window.addEventListener("gamepadconnected", (e) => {
    if (gamepadIndex === null) gamepadIndex = e.gamepad.index;
    showHud("🎮", `Controller connected: ${shortName(e.gamepad.id)}`);
    startPolling();
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad.index === gamepadIndex) gamepadIndex = null;
    showHud("🎮", "Controller disconnected");
  });

  function getGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (gamepadIndex !== null && pads[gamepadIndex]) return pads[gamepadIndex];
    for (const pad of pads) {
      if (pad && pad.connected) {
        gamepadIndex = pad.index;
        return pad;
      }
    }
    return null;
  }

  function startPolling() {
    if (pollHandle !== null) return;
    const loop = () => {
      pollHandle = requestAnimationFrame(loop);
      // Chrome freezes gamepad state for unfocused pages — without this check
      // a held stick value would keep scrolling/adjusting forever.
      if (!document.hasFocus()) return;
      const pad = getGamepad();
      if (!pad) return;
      handleButtons(pad);
      handleAxes(pad);
    };
    pollHandle = requestAnimationFrame(loop);
  }

  // In case the pad was connected before this page loaded, Chrome may not
  // re-fire gamepadconnected — start polling anyway; it's cheap when idle.
  startPolling();

  function handleButtons(pad) {
    const now = performance.now();
    const { repeatDelay, repeatInterval } = config.settings;

    for (let i = 0; i < pad.buttons.length; i++) {
      const pressed = pad.buttons[i].pressed || pad.buttons[i].value > 0.5;
      const state = buttonState[i] || (buttonState[i] = { pressed: false, downAt: 0, lastRepeat: 0 });

      if (pressed && !state.pressed) {
        state.pressed = true;
        state.downAt = now;
        state.lastRepeat = now;
        pressButton(i);
      } else if (pressed && state.pressed) {
        if (buttonRepeats(i) &&
            now - state.downAt > repeatDelay && now - state.lastRepeat > repeatInterval) {
          state.lastRepeat = now;
          pressButton(i);
        }
      } else if (!pressed && state.pressed) {
        state.pressed = false;
      }
    }
  }

  // While the on-screen keyboard is open, the controller drives it and
  // nothing else — sticks/D-pad move the key selection, face buttons type.
  function pressButton(i) {
    if (oskIsOpen()) runOskButton(i);
    else runBinding(i);
  }

  function buttonRepeats(i) {
    if (oskIsOpen()) return OSK_REPEAT_BUTTONS.has(i);
    const binding = config.bindings[i];
    const actionId = typeof binding === "string" ? binding : binding && binding.action;
    return !!(actionId && CC_ACTIONS[actionId] && CC_ACTIONS[actionId].repeat);
  }

  function handleAxes(pad) {
    if (oskIsOpen()) return oskStickNav(pad);
    const dz = config.settings.deadzone;
    const axis = (n) => {
      const v = pad.axes[n] || 0;
      if (Math.abs(v) < dz) return 0;
      // Rescale so movement starts at 0 right past the deadzone.
      return (v - Math.sign(v) * dz) / (1 - dz);
    };

    // Left stick: scroll (vertical + horizontal). Pointless in fullscreen
    // video, and skipping it avoids scroll-container scans on stick drift.
    const lx = axis(0);
    const ly = axis(1);
    if ((lx || ly) && !document.fullscreenElement) {
      const speed = config.settings.scrollSpeed;
      scrollTargetBy(lx * speed, ly * speed * (Math.abs(ly) > 0.9 ? 1.6 : 1));
    }

    // Right stick: move the virtual cursor.
    const rx = axis(2);
    const ry = axis(3);
    if (rx || ry) moveCursor(rx, ry);
  }

  // ---------------------------------------------------------------- actions

  function runBinding(buttonIndex) {
    const binding = config.bindings[buttonIndex];
    if (!binding || binding === "none") return;

    if (typeof binding === "object" && binding.action === "customKey") {
      dispatchKey(binding);
      showHud("⌨️", `Key: ${binding.key}`);
      return;
    }
    runAction(binding);
  }

  function runAction(actionId) {
    const s = config.settings;
    switch (actionId) {
      case "playPause": {
        const media = findMedia();
        if (!media) return showHud("▶️", "No video found");
        if (media.paused) { media.play(); showHud("▶️", "Play"); }
        else { media.pause(); showHud("⏸️", "Pause"); }
        break;
      }
      case "mute": {
        const media = findMedia();
        if (!media) return showHud("🔇", "No video found");
        media.muted = !media.muted;
        showHud(media.muted ? "🔇" : "🔊", media.muted ? "Muted" : "Unmuted");
        break;
      }
      case "volumeUp": changeVolume(s.volumeStep); break;
      case "volumeDown": changeVolume(-s.volumeStep); break;
      case "seekForward": seekBy(s.seekStep); break;
      case "seekBackward": seekBy(-s.seekStep); break;
      case "speedUp": changeSpeed(0.25); break;
      case "speedDown": changeSpeed(-0.25); break;
      case "fullscreen": toggleFullscreen(); break;
      case "cursorClick": cursorClick(); break;
      case "toggleKeyboard": toggleOsk(); break;
      case "scrollUp": scrollTargetBy(0, -window.innerHeight * 0.25, true); break;
      case "scrollDown": scrollTargetBy(0, window.innerHeight * 0.25, true); break;
      case "scrollTop":
        window.scrollTo({ top: 0, behavior: "smooth" });
        showHud("⬆️", "Top of page");
        break;
      case "scrollBottom":
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        showHud("⬇️", "Bottom of page");
        break;
      case "historyBack": history.back(); break;
      case "historyForward": history.forward(); break;
      case "reload": location.reload(); break;
      case "nextTab":
      case "prevTab":
      case "newTab":
      case "closeTab":
      case "reopenTab":
        chrome.runtime.sendMessage({ type: "cc-command", command: actionId });
        break;
    }
  }

  // ------------------------------------------------------------------ media

  // Pick the most relevant media element: playing beats paused, bigger beats
  // smaller, video beats audio. The result is cached — analog volume/seek can
  // call this ~60x/s, and re-querying a huge DOM (YouTube) every frame makes
  // the page lag badly.
  const mediaCache = { el: null, scanAt: -Infinity };

  function findMedia() {
    const now = performance.now();
    const cached = mediaCache.el;
    if (cached && cached.isConnected && (!cached.paused || now - mediaCache.scanAt < 3000)) {
      return cached;
    }
    // Throttle rescans so a missing/paused video doesn't trigger a DOM query
    // on every analog tick.
    if (now - mediaCache.scanAt < 1000) {
      return cached && cached.isConnected ? cached : null;
    }
    mediaCache.scanAt = now;

    const candidates = [...document.querySelectorAll("video, audio")];
    if (!candidates.length) {
      // Only look inside iframes when the top document has no media, and
      // never inside ad frames — probing those is what ad blockers do, and
      // sites like YouTube watch for it.
      for (const frame of document.querySelectorAll("iframe")) {
        if (/ads|doubleclick|googlesyndication|imasdk|adservice/.test(frame.src || "")) continue;
        try {
          if (frame.contentDocument) {
            candidates.push(...frame.contentDocument.querySelectorAll("video, audio"));
          }
        } catch { /* cross-origin iframe */ }
      }
    }
    if (!candidates.length) {
      mediaCache.el = null;
      return null;
    }
    const score = (m) => {
      let s = 0;
      if (!m.paused && !m.ended) s += 1000;
      if (m.readyState > 0) s += 100;
      if (m.tagName === "VIDEO") {
        const r = m.getBoundingClientRect();
        s += Math.min(r.width * r.height / 5000, 500);
      }
      return s;
    };
    candidates.sort((a, b) => score(b) - score(a));
    mediaCache.el = candidates[0];
    return mediaCache.el;
  }

  function changeVolume(delta) {
    const media = findMedia();
    if (!media) return showHud("🔊", "No video found");
    media.volume = Math.min(1, Math.max(0, media.volume + delta));
    if (media.volume > 0 && delta > 0) media.muted = false;
    showHud(media.volume === 0 ? "🔇" : "🔊", `Volume ${Math.round(media.volume * 100)}%`, media.volume);
  }

  function seekBy(seconds) {
    const media = findMedia();
    if (!media) return showHud("⏩", "No video found");
    if (!isFinite(media.duration)) return showHud("⏩", "Live — can't seek");
    media.currentTime = Math.min(media.duration, Math.max(0, media.currentTime + seconds));
    showHud(seconds > 0 ? "⏩" : "⏪", `${seconds > 0 ? "+" : ""}${seconds}s  ·  ${fmtTime(media.currentTime)}`);
  }

  function changeSpeed(delta) {
    const media = findMedia();
    if (!media) return showHud("⏱️", "No video found");
    media.playbackRate = Math.min(4, Math.max(0.25, Math.round((media.playbackRate + delta) * 4) / 4));
    showHud("⏱️", `Speed ${media.playbackRate}x`);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      showHud("⛶", "Exit fullscreen");
      return;
    }
    // Site players' own fullscreen buttons give the best layout (controls,
    // subtitles). Try known ones first, then the raw video element, then
    // fall back to fullscreening the browser window (always works, since
    // gamepad input doesn't count as a user gesture for the DOM API).
    const siteButton = document.querySelector(
      ".ytp-fullscreen-button, [data-uia='control-fullscreen-enter'], button.fullscreen-icon, .vjs-fullscreen-control"
    );
    if (siteButton) {
      siteButton.click();
      // If the click was ignored for lack of a user gesture, fall through.
      setTimeout(() => {
        if (!document.fullscreenElement) windowFullscreen();
        else showHud("⛶", "Fullscreen");
      }, 250);
      return;
    }
    const media = findMedia();
    const target = media && media.tagName === "VIDEO" ? media : document.documentElement;
    const req = target.requestFullscreen && target.requestFullscreen();
    if (req && req.catch) {
      req.then(() => showHud("⛶", "Fullscreen")).catch(() => windowFullscreen());
    } else {
      windowFullscreen();
    }
  }

  function windowFullscreen() {
    chrome.runtime.sendMessage({ type: "cc-command", command: "windowFullscreen" });
    showHud("⛶", "Window fullscreen");
  }

  // ----------------------------------------------------------------- scroll

  let scrollTarget = null;
  let scrollScanAt = -Infinity;

  function scrollTargetBy(dx, dy, smooth = false) {
    const stale = !scrollTarget || (scrollTarget !== window && !scrollTarget.isConnected);
    if (stale) {
      // Throttled: this can be hit every frame while the stick is held.
      const now = performance.now();
      if (now - scrollScanAt < 2000) return;
      scrollScanAt = now;
      scrollTarget = findScrollable();
    }
    const opts = smooth ? { behavior: "smooth" } : undefined;
    if (scrollTarget === window) {
      window.scrollBy({ left: dx, top: dy, ...opts });
    } else {
      scrollTarget.scrollBy({ left: dx, top: dy, ...opts });
    }
  }

  function findScrollable() {
    const de = document.scrollingElement || document.documentElement;
    if (de.scrollHeight > window.innerHeight + 4) return window;
    // Page itself doesn't scroll — walk up from the viewport center looking
    // for an inner scroll container (web apps like Gmail, docs sites). Much
    // cheaper than scanning the whole DOM.
    let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    while (el && el !== de) {
      if (el.scrollHeight > el.clientHeight + 4 &&
          /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) {
        return el;
      }
      el = el.parentElement;
    }
    return window;
  }

  // ------------------------------------------------------------- custom key

  function dispatchKey(binding) {
    const target = document.activeElement || document.body;
    const init = {
      key: binding.key,
      code: binding.code || "",
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: !!binding.ctrl,
      altKey: !!binding.alt,
      shiftKey: !!binding.shift,
      metaKey: !!binding.meta
    };
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  // --------------------------------------------------------- virtual cursor

  const cursor = { x: -1, y: -1, el: null, hideTimer: null, lastHover: 0 };

  function ensureCursor() {
    if (cursor.el && cursor.el.isConnected) return;
    cursor.el = document.createElement("div");
    cursor.el.id = "couch-controller-cursor";
    cursor.el.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;" +
      "opacity:0;transition:opacity .3s;will-change:transform";
    cursor.el.innerHTML =
      `<svg width="26" height="26" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">` +
      `<path d="M4 2 L4 19 L8.6 15.4 L11.4 21.5 L14.1 20.3 L11.3 14.2 L17 13.6 Z"` +
      ` fill="#7c6cff" stroke="#fff" stroke-width="1.4"/></svg>`;
    if (cursor.x < 0) {
      cursor.x = window.innerWidth / 2;
      cursor.y = window.innerHeight / 2;
    }
    overlayParent().appendChild(cursor.el);
    positionCursor();
  }

  function positionCursor() {
    cursor.el.style.transform = `translate(${cursor.x}px,${cursor.y}px)`;
  }

  function moveCursor(dx, dy) {
    ensureCursor();
    const speed = config.settings.cursorSpeed;
    // Quadratic response: slight tilt = precise, full tilt = fast.
    cursor.x = Math.max(0, Math.min(window.innerWidth - 2, cursor.x + dx * Math.abs(dx) * speed));
    cursor.y = Math.max(0, Math.min(window.innerHeight - 2, cursor.y + dy * Math.abs(dy) * speed));
    positionCursor();
    cursor.el.style.opacity = "1";
    clearTimeout(cursor.hideTimer);
    cursor.hideTimer = setTimeout(() => { if (cursor.el) cursor.el.style.opacity = "0"; }, 3000);

    // Throttled hover events so menus open and video controls appear.
    const now = performance.now();
    if (now - cursor.lastHover > 50) {
      cursor.lastHover = now;
      const el = elementAtCursor();
      if (el) dispatchMouseAt(el, ["pointermove", "mousemove"]);
    }
  }

  function elementAtCursor() {
    return document.elementFromPoint(cursor.x, cursor.y);
  }

  function dispatchMouseAt(el, types) {
    for (const type of types) {
      const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, {
        bubbles: true, cancelable: true, composed: true, view: window,
        clientX: cursor.x, clientY: cursor.y,
        button: 0, buttons: type.endsWith("down") ? 1 : 0,
        pointerId: 1, pointerType: "mouse", isPrimary: true
      }));
    }
  }

  function cursorClick() {
    ensureCursor();
    cursor.el.style.opacity = "1";
    const svg = cursor.el.firstElementChild;
    if (svg && svg.animate) {
      svg.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.7)" }, { transform: "scale(1)" }],
        { duration: 180 }
      );
    }
    const el = elementAtCursor();
    if (!el) return;

    // Clicks on our own keyboard are handled directly.
    const oskKey = el.closest && el.closest("[data-cc-key]");
    if (oskKey) return pressOskKey(oskKey.dataset.ccKey);

    dispatchMouseAt(el, ["pointerdown", "mousedown", "pointerup", "mouseup"]);
    const clickable =
      (el.closest && el.closest("a,button,[role='button'],input,select,textarea,summary,label,video")) || el;
    if (isEditable(clickable)) {
      clickable.focus();
      lastEditable = clickable;
    }
    if (typeof clickable.click === "function") clickable.click();
    else dispatchMouseAt(el, ["click"]);
  }

  // ------------------------------------------------------ on-screen keyboard

  const OSK_ROWS = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "'"],
    ["Shift", "z", "x", "c", "v", "b", "n", "m", ",", "Backspace"],
    ["@", "-", "Space", ".", "Enter", "Close"]
  ];
  const OSK_SHIFT_MAP = {
    "1": "!", "2": "@", "3": "#", "4": "$", "5": "%",
    "6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
    "'": "\"", ",": ";", ".": ":", "-": "_", "@": "?"
  };
  const OSK_LABELS = { Shift: "⇧", Backspace: "⌫", Enter: "↵", Close: "✕", Space: " " };

  let oskEl = null;
  let oskShift = false;
  let lastEditable = null;

  document.addEventListener("focusin", (e) => {
    if (isEditable(e.target)) lastEditable = e.target;
  }, true);

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" &&
      !/^(button|submit|checkbox|radio|range|file|color|image|reset|hidden)$/i.test(el.type);
  }

  function oskIsOpen() {
    return !!(oskEl && oskEl.isConnected && oskEl.style.display !== "none");
  }

  function toggleOsk() {
    if (oskIsOpen()) {
      oskEl.style.display = "none";
      showHud("⌨️", "Keyboard hidden");
      return;
    }
    buildOsk();
    oskEl.style.display = "flex";
    oskSel.row = 2;
    oskSel.col = 4;
    updateOskSelection();
    if (cursor.el) cursor.el.style.opacity = "0"; // keyboard owns the sticks now
    showHud("⌨️", "Keyboard on — sticks move, A types");
  }

  // ----- keyboard mode: controller drives the OSK

  const oskSel = { row: 2, col: 4 };
  const OSK_REPEAT_BUTTONS = new Set([1, 12, 13, 14, 15]); // backspace + D-pad
  const oskNav = { x: { dir: 0, nextAt: 0 }, y: { dir: 0, nextAt: 0 } };

  function runOskButton(i) {
    // Whatever button opened the keyboard also closes it.
    if (config.bindings[i] === "toggleKeyboard") return toggleOsk();
    switch (i) {
      case 0: case 11: pressOskKey(oskSelectedKey()); break; // A / R3: press key
      case 1: pressOskKey("Backspace"); break;               // B
      case 2: pressOskKey("Space"); break;                   // X
      case 3: pressOskKey("Shift"); break;                   // Y
      case 9: pressOskKey("Enter"); break;                   // Start
      case 8: toggleOsk(); break;                            // Back/Select
      case 12: moveOskSelection(0, -1); break;
      case 13: moveOskSelection(0, 1); break;
      case 14: moveOskSelection(-1, 0); break;
      case 15: moveOskSelection(1, 0); break;
    }
  }

  // Both sticks move the selection in discrete steps with hold-repeat.
  function oskStickNav(pad) {
    const now = performance.now();
    const pick = (a, b) => (Math.abs(a) > Math.abs(b) ? a : b);
    const step = (value, state, dx, dy) => {
      const dir = value > 0.5 ? 1 : value < -0.5 ? -1 : 0;
      if (!dir) { state.dir = 0; return; }
      if (dir !== state.dir) {
        state.dir = dir;
        state.nextAt = now + 320;
        moveOskSelection(dx * dir, dy * dir);
      } else if (now >= state.nextAt) {
        state.nextAt = now + 140;
        moveOskSelection(dx * dir, dy * dir);
      }
    };
    step(pick(pad.axes[0] || 0, pad.axes[2] || 0), oskNav.x, 1, 0);
    step(pick(pad.axes[1] || 0, pad.axes[3] || 0), oskNav.y, 0, 1);
  }

  function moveOskSelection(dx, dy) {
    if (dy) {
      const rows = OSK_ROWS.length;
      oskSel.row = (oskSel.row + dy + rows) % rows;
      oskSel.col = Math.min(oskSel.col, OSK_ROWS[oskSel.row].length - 1);
    }
    if (dx) {
      const len = OSK_ROWS[oskSel.row].length;
      oskSel.col = (oskSel.col + dx + len) % len;
    }
    updateOskSelection();
  }

  function oskSelectedKey() {
    return OSK_ROWS[oskSel.row][oskSel.col];
  }

  function updateOskSelection() {
    if (!oskEl) return;
    for (let r = 0; r < OSK_ROWS.length; r++) {
      const rowEl = oskEl.querySelector(`[data-cc-row="${r}"]`);
      if (!rowEl) continue;
      for (let c = 0; c < rowEl.children.length; c++) {
        const on = r === oskSel.row && c === oskSel.col;
        rowEl.children[c].style.outline = on ? "3px solid #b7adff" : "none";
        rowEl.children[c].style.outlineOffset = "-2px";
      }
    }
  }

  function buildOsk() {
    if (oskEl && oskEl.isConnected) return;
    oskEl = document.createElement("div");
    oskEl.id = "couch-controller-osk";
    oskEl.style.cssText =
      "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483646;" +
      "display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:16px;" +
      "background:rgba(20,20,28,0.94);box-shadow:0 10px 32px rgba(0,0,0,0.45);" +
      "font:600 16px/1 system-ui,sans-serif";
    // Keep the page's text field focused while clicking keys with a real mouse.
    oskEl.addEventListener("mousedown", (e) => e.preventDefault());
    oskEl.addEventListener("click", (e) => {
      const key = e.target.closest("[data-cc-key]");
      if (key) pressOskKey(key.dataset.ccKey);
    });

    const legend = document.createElement("div");
    legend.textContent = "Sticks / D-pad: move · A: press · B: ⌫ · X: space · Y: ⇧ · Start: ↵ · Select: close";
    legend.style.cssText =
      "text-align:center;color:rgba(255,255,255,0.55);font:500 12px/1 system-ui,sans-serif;padding:2px 0 4px";
    oskEl.appendChild(legend);

    for (let r = 0; r < OSK_ROWS.length; r++) {
      const row = OSK_ROWS[r];
      const rowEl = document.createElement("div");
      rowEl.dataset.ccRow = r;
      rowEl.style.cssText = "display:flex;gap:6px;justify-content:center";
      for (const key of row) {
        const btn = document.createElement("button");
        btn.dataset.ccKey = key;
        const wide = key.length > 1 && key !== "Space";
        btn.style.cssText =
          `border:none;border-radius:9px;padding:12px 0;cursor:pointer;color:#fff;` +
          `background:rgba(255,255,255,${wide ? "0.2" : "0.12"});font:inherit;` +
          (key === "Space" ? "flex:1 1 220px;min-width:160px" : `min-width:${wide ? 64 : 40}px`);
        rowEl.appendChild(btn);
      }
      oskEl.appendChild(rowEl);
    }
    updateOskLabels();
    overlayParent().appendChild(oskEl);
  }

  function updateOskLabels() {
    for (const btn of oskEl.querySelectorAll("[data-cc-key]")) {
      const key = btn.dataset.ccKey;
      btn.textContent = OSK_LABELS[key] || (oskShift ? shiftedKey(key) : key);
      if (key === "Shift") {
        btn.style.background = oskShift ? "#7c6cff" : "rgba(255,255,255,0.2)";
      }
    }
  }

  function shiftedKey(key) {
    return OSK_SHIFT_MAP[key] || key.toUpperCase();
  }

  function pressOskKey(key) {
    switch (key) {
      case "Shift":
        oskShift = !oskShift;
        updateOskLabels();
        return;
      case "Close":
        toggleOsk();
        return;
      case "Backspace": {
        if (refocusEditable()) document.execCommand("delete");
        return;
      }
      case "Enter":
        oskEnter();
        return;
      case "Space":
        oskInsert(" ");
        return;
      default:
        oskInsert(oskShift ? shiftedKey(key) : key);
        if (oskShift) { // mobile-style: shift applies to one character
          oskShift = false;
          updateOskLabels();
        }
    }
  }

  function refocusEditable() {
    if (!lastEditable || !lastEditable.isConnected) {
      showHud("⌨️", "Click a text box first");
      return null;
    }
    lastEditable.focus();
    return lastEditable;
  }

  function oskInsert(text) {
    const t = refocusEditable();
    if (!t) return;
    if (!document.execCommand("insertText", false, text) &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
      // Some fields reject execCommand — set the value the way frameworks expect.
      const proto = t.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) {
        desc.set.call(t, (t.value || "") + text);
        t.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  function oskEnter() {
    const t = refocusEditable();
    if (!t) return;
    const init = { key: "Enter", code: "Enter", bubbles: true, cancelable: true, composed: true };
    const notCancelled = t.dispatchEvent(new KeyboardEvent("keydown", init));
    t.dispatchEvent(new KeyboardEvent("keyup", init));
    if (!notCancelled) return;
    if (t.tagName === "TEXTAREA") document.execCommand("insertText", false, "\n");
    else if (t.isContentEditable) document.execCommand("insertParagraph");
    else if (t.form) {
      try { t.form.requestSubmit(); } catch { /* invalid form */ }
    }
  }

  // ----------------------------------------------------------------- overlay

  // Element-fullscreen only renders the fullscreened subtree, so overlays
  // must live inside it (unless it's a bare <video>, which can't show them).
  function overlayParent() {
    const fs = document.fullscreenElement;
    if (fs && fs.tagName !== "VIDEO" && fs.tagName !== "AUDIO") return fs;
    return document.documentElement;
  }

  document.addEventListener("fullscreenchange", () => {
    const parent = overlayParent();
    for (const el of [hudEl, cursor.el, oskEl]) {
      if (el && el.parentElement !== parent) parent.appendChild(el);
    }
  });

  // -------------------------------------------------------------------- HUD

  let hudEl = null;
  let hudTimer = null;
  let hudLastAt = 0;
  let hudPending = null;
  let hudFlushTimer = null;

  // Coalesce rapid-fire updates (analog volume/seek) into at most ~12
  // renders per second; the trailing update always lands.
  function showHud(icon, text, volumeLevel) {
    if (!config.settings.hudEnabled) return;
    const now = performance.now();
    if (now - hudLastAt < 80) {
      hudPending = [icon, text, volumeLevel];
      if (!hudFlushTimer) {
        hudFlushTimer = setTimeout(() => {
          hudFlushTimer = null;
          if (hudPending) {
            const p = hudPending;
            hudPending = null;
            showHud(p[0], p[1], p[2]);
          }
        }, 90);
      }
      return;
    }
    hudLastAt = now;
    renderHud(icon, text, volumeLevel);
  }

  function renderHud(icon, text, volumeLevel) {
    if (!document.documentElement) return;
    if (!hudEl || !hudEl.isConnected) {
      hudEl = document.createElement("div");
      hudEl.id = "couch-controller-hud";
      hudEl.style.cssText = [
        "position:fixed", "top:24px", "right:24px", "z-index:2147483647",
        "display:flex", "align-items:center", "gap:10px",
        "padding:12px 18px", "border-radius:14px",
        "background:rgba(20,20,28,0.88)", "color:#fff",
        "font:600 15px/1.3 system-ui,sans-serif",
        "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
        "backdrop-filter:blur(6px)",
        "pointer-events:none", "transition:opacity .25s", "opacity:0"
      ].join(";");
      hudEl.innerHTML =
        `<span data-cc="icon" style="font-size:20px"></span>` +
        `<span style="display:flex;flex-direction:column;gap:5px">` +
        `<span data-cc="text"></span>` +
        `<span data-cc="bar-wrap" style="display:none;width:140px;height:5px;border-radius:3px;background:rgba(255,255,255,0.25)">` +
        `<span data-cc="bar" style="display:block;height:100%;border-radius:3px;background:#7c6cff;width:0%"></span>` +
        `</span></span>`;
      overlayParent().appendChild(hudEl);
    }
    hudEl.querySelector('[data-cc="icon"]').textContent = icon;
    hudEl.querySelector('[data-cc="text"]').textContent = text;
    const barWrap = hudEl.querySelector('[data-cc="bar-wrap"]');
    if (typeof volumeLevel === "number") {
      barWrap.style.display = "block";
      hudEl.querySelector('[data-cc="bar"]').style.width = `${volumeLevel * 100}%`;
    } else {
      barWrap.style.display = "none";
    }
    hudEl.style.opacity = "1";
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { if (hudEl) hudEl.style.opacity = "0"; }, 1100);
  }

  // ------------------------------------------------------------------ utils

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`;
  }

  function shortName(id) {
    return (id || "Gamepad").replace(/\s*\(.*\)\s*/g, "").slice(0, 40) || "Gamepad";
  }
})();
