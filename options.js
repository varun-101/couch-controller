// Couch Controller — options page logic.
(() => {
  "use strict";

  let config = ccNormalizeConfig(null);
  let captureButtonIndex = null; // button awaiting a custom key, or null

  const bindingsEl = document.getElementById("bindings");
  const statusEl = document.getElementById("pad-status");
  const modal = document.getElementById("key-capture");
  const capturePreview = document.getElementById("capture-preview");

  chrome.storage.sync.get("config", (data) => {
    config = ccNormalizeConfig(data.config);
    renderBindings();
    renderSettings();
  });

  function save() {
    chrome.storage.sync.set({ config });
  }

  // -------------------------------------------------------------- bindings

  function renderBindings() {
    bindingsEl.textContent = "";
    for (const [index, name] of Object.entries(CC_BUTTON_NAMES)) {
      const row = document.createElement("div");
      row.className = "binding-row";
      row.dataset.button = index;

      const label = document.createElement("span");
      label.className = "btn-name";
      label.textContent = `${index} · ${name}`;

      const select = document.createElement("select");
      for (const [id, def] of Object.entries(CC_ACTIONS)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = def.label;
        select.appendChild(opt);
      }

      const binding = config.bindings[index];
      const keyTag = document.createElement("span");
      keyTag.className = "key-tag";
      if (typeof binding === "object" && binding.action === "customKey") {
        select.value = "customKey";
        keyTag.textContent = describeKey(binding);
      } else {
        select.value = binding || "none";
      }

      select.addEventListener("change", () => {
        if (select.value === "customKey") {
          openKeyCapture(index);
        } else {
          config.bindings[index] = select.value;
          keyTag.textContent = "";
          save();
        }
      });

      row.append(label, select, keyTag);
      bindingsEl.appendChild(row);
    }
  }

  function describeKey(binding) {
    const mods = [
      binding.ctrl && "Ctrl",
      binding.alt && "Alt",
      binding.shift && "Shift",
      binding.meta && "Meta"
    ].filter(Boolean);
    const key = binding.key === " " ? "Space" : binding.key;
    return [...mods, key].join("+");
  }

  // ----------------------------------------------------------- key capture

  function openKeyCapture(buttonIndex) {
    captureButtonIndex = buttonIndex;
    capturePreview.textContent = " ";
    modal.classList.remove("hidden");
  }

  function closeKeyCapture() {
    captureButtonIndex = null;
    modal.classList.add("hidden");
    renderBindings(); // restore dropdowns to saved state
  }

  document.getElementById("capture-cancel").addEventListener("click", closeKeyCapture);

  window.addEventListener("keydown", (e) => {
    if (captureButtonIndex === null) return;
    e.preventDefault();
    if (e.key === "Escape") return closeKeyCapture();
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return; // wait for the real key

    const binding = {
      action: "customKey",
      key: e.key,
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };
    capturePreview.textContent = describeKey(binding);
    config.bindings[captureButtonIndex] = binding;
    save();
    setTimeout(closeKeyCapture, 350);
  });

  // -------------------------------------------------------------- settings

  const RANGE_IDS = ["scrollSpeed", "cursorSpeed", "seekStep", "volumeStep", "deadzone"];

  function renderSettings() {
    for (const id of RANGE_IDS) {
      const input = document.getElementById(id);
      input.value = config.settings[id];
      updateVal(id);
      input.addEventListener("input", () => {
        config.settings[id] = Number(input.value);
        updateVal(id);
        save();
      });
    }
    const hud = document.getElementById("hudEnabled");
    hud.checked = config.settings.hudEnabled;
    hud.addEventListener("change", () => {
      config.settings.hudEnabled = hud.checked;
      save();
    });
  }

  function updateVal(id) {
    document.querySelector(`.val[data-for="${id}"]`).textContent = config.settings[id];
  }

  document.getElementById("reset").addEventListener("click", () => {
    config = ccNormalizeConfig(null);
    save();
    renderBindings();
    renderSettings();
  });

  // ------------------------------------------- live gamepad row highlighting

  function pollPads() {
    requestAnimationFrame(pollPads);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);

    if (pad) {
      statusEl.textContent = `Connected: ${pad.id}`;
      statusEl.classList.add("connected");
      for (const row of bindingsEl.children) {
        const idx = Number(row.dataset.button);
        const btn = pad.buttons[idx];
        row.classList.toggle("active", !!btn && (btn.pressed || btn.value > 0.5));
      }
    } else {
      statusEl.textContent = "No controller detected — press any button on your controller.";
      statusEl.classList.remove("connected");
    }
  }
  pollPads();
})();
