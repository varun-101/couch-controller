// Couch Controller — options page logic.
(() => {
  "use strict";

  let config = ccNormalizeConfig(null);
  let captureTarget = null; // { type: "button" | "combo", index }

  const bindingsEl = document.getElementById("bindings");
  const combosEl = document.getElementById("combos");
  const addComboBtn = document.getElementById("add-combo");
  const statusEl = document.getElementById("pad-status");
  const modal = document.getElementById("key-capture");
  const capturePreview = document.getElementById("capture-preview");

  chrome.storage.sync.get("config", (data) => {
    config = ccNormalizeConfig(data.config);
    renderAll();
  });

  function renderAll() {
    renderBindings();
    renderCombos();
    renderSettings();
  }

  function save() {
    chrome.storage.sync.set({ config: ccNormalizeConfig(config) });
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

      const binding = config.bindings[index];
      const select = actionSelect(actionId(binding), true);
      const details = document.createElement("span");
      details.className = "binding-detail";
      renderBindingDetails(details, binding, (nextBinding) => {
        config.bindings[index] = nextBinding;
        save();
      });

      select.addEventListener("change", () => {
        if (select.value === "customKey") {
          openKeyCapture({ type: "button", index });
        } else if (select.value === "openUrl") {
          config.bindings[index] = { action: "openUrl", url: "https://www.netflix.com/" };
          save();
          renderBindings();
        } else {
          config.bindings[index] = select.value;
          save();
          renderBindings();
        }
      });

      row.append(label, select, details);
      bindingsEl.appendChild(row);
    }
  }

  function actionSelect(selected, includeNone) {
    const select = document.createElement("select");
    for (const [id, def] of Object.entries(CC_ACTIONS)) {
      if (!includeNone && id === "none") continue;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = def.label;
      select.appendChild(opt);
    }
    select.value = selected || (includeNone ? "none" : "newTab");
    return select;
  }

  function actionId(binding) {
    return typeof binding === "string" ? binding : binding && binding.action;
  }

  function renderBindingDetails(parent, binding, onChange) {
    parent.textContent = "";
    if (binding && typeof binding === "object" && binding.action === "customKey") {
      const tag = document.createElement("span");
      tag.className = "key-tag";
      tag.textContent = describeKey(binding);
      parent.appendChild(tag);
      return;
    }
    if (binding && typeof binding === "object" && binding.action === "openUrl") {
      parent.appendChild(urlInput(binding.url, (url) => onChange({ action: "openUrl", url })));
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

  function describeButtons(buttons) {
    return buttons.map((button) => CC_BUTTON_NAMES[button] || `Button ${button}`).join(" + ");
  }

  // --------------------------------------------------------------- combos

  addComboBtn.addEventListener("click", () => {
    config.combos.push({ buttons: [4, 5], binding: "newTab" });
    save();
    renderCombos();
  });

  function renderCombos() {
    combosEl.textContent = "";
    if (!config.combos.length) {
      const empty = document.createElement("p");
      empty.className = "combo-empty";
      empty.textContent = "No combo bindings yet.";
      combosEl.appendChild(empty);
      return;
    }

    config.combos.forEach((combo, index) => {
      const row = document.createElement("div");
      row.className = "combo-row";
      row.dataset.combo = String(index);

      const heading = document.createElement("div");
      heading.className = "combo-heading";
      const title = document.createElement("strong");
      title.textContent = describeButtons(combo.buttons);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "compact danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        config.combos.splice(index, 1);
        save();
        renderCombos();
      });
      heading.append(title, remove);

      const picker = document.createElement("div");
      picker.className = "combo-picker";
      for (const [button, name] of Object.entries(CC_BUTTON_NAMES)) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = button;
        checkbox.checked = combo.buttons.includes(Number(button));
        checkbox.addEventListener("change", () => {
          const selected = selectedComboButtons(picker);
          if (selected.length < 2) {
            checkbox.checked = true;
            return;
          }
          combo.buttons = selected;
          save();
          renderCombos();
        });
        label.append(checkbox, document.createTextNode(shortButtonName(name)));
        picker.appendChild(label);
      }

      const controls = document.createElement("div");
      controls.className = "combo-controls";
      const select = actionSelect(actionId(combo.binding), false);
      const details = document.createElement("span");
      details.className = "binding-detail";
      renderBindingDetails(details, combo.binding, (nextBinding) => {
        combo.binding = nextBinding;
        save();
      });
      select.addEventListener("change", () => {
        if (select.value === "customKey") {
          openKeyCapture({ type: "combo", index });
        } else if (select.value === "openUrl") {
          combo.binding = { action: "openUrl", url: "https://www.netflix.com/" };
          save();
          renderCombos();
        } else {
          combo.binding = select.value;
          save();
          renderCombos();
        }
      });
      controls.append(select, details);

      row.append(heading, picker, controls);
      combosEl.appendChild(row);
    });
  }

  function selectedComboButtons(parent) {
    return ccNormalizeComboButtons(
      [...parent.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value)
    );
  }

  function shortButtonName(name) {
    return name.replace(/ \(.+\)/, "").replace("Left Stick Click", "L3").replace("Right Stick Click", "R3");
  }

  function urlInput(value, onCommit) {
    const input = document.createElement("input");
    input.type = "url";
    input.className = "url-input";
    input.placeholder = "https://www.netflix.com";
    input.value = value || "";
    const commit = () => {
      const url = ccNormalizeUrl(input.value);
      if (!url) {
        input.classList.add("invalid");
        return;
      }
      input.classList.remove("invalid");
      input.value = url;
      onCommit(url);
    };
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
    return input;
  }

  // ----------------------------------------------------------- key capture

  function openKeyCapture(target) {
    captureTarget = target;
    capturePreview.textContent = " ";
    modal.classList.remove("hidden");
  }

  function closeKeyCapture() {
    captureTarget = null;
    modal.classList.add("hidden");
    renderBindings();
    renderCombos();
  }

  document.getElementById("capture-cancel").addEventListener("click", closeKeyCapture);

  window.addEventListener("keydown", (e) => {
    if (!captureTarget) return;
    e.preventDefault();
    if (e.key === "Escape") return closeKeyCapture();
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

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
    setTargetBinding(captureTarget, binding);
    save();
    setTimeout(closeKeyCapture, 350);
  });

  function setTargetBinding(target, binding) {
    if (target.type === "button") config.bindings[target.index] = binding;
    else if (target.type === "combo" && config.combos[target.index]) config.combos[target.index].binding = binding;
  }

  // -------------------------------------------------------------- settings

  const RANGE_IDS = ["scrollSpeed", "cursorSpeed", "seekStep", "volumeStep", "deadzone"];

  function renderSettings() {
    for (const id of RANGE_IDS) {
      const input = document.getElementById(id);
      input.value = config.settings[id];
      updateVal(id);
      input.oninput = () => {
        config.settings[id] = Number(input.value);
        updateVal(id);
        save();
      };
    }
    const hud = document.getElementById("hudEnabled");
    hud.checked = config.settings.hudEnabled;
    hud.onchange = () => {
      config.settings.hudEnabled = hud.checked;
      save();
    };
  }

  function updateVal(id) {
    document.querySelector(`.val[data-for="${id}"]`).textContent = config.settings[id];
  }

  document.getElementById("reset").addEventListener("click", () => {
    config = ccNormalizeConfig(null);
    save();
    renderAll();
  });

  // ------------------------------------------- live gamepad row highlighting

  function pollPads() {
    requestAnimationFrame(pollPads);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);

    if (pad) {
      statusEl.textContent = `Connected: ${pad.id}`;
      statusEl.classList.add("connected");
      const pressed = new Set();
      for (let i = 0; i < pad.buttons.length; i++) {
        const btn = pad.buttons[i];
        if (btn && (btn.pressed || btn.value > 0.5)) pressed.add(i);
      }
      for (const row of bindingsEl.children) {
        const idx = Number(row.dataset.button);
        row.classList.toggle("active", pressed.has(idx));
      }
      for (const row of combosEl.children) {
        const combo = config.combos[Number(row.dataset.combo)];
        row.classList.toggle("active", !!combo && combo.buttons.every((button) => pressed.has(button)));
      }
    } else {
      statusEl.textContent = "No controller detected — press any button on your controller.";
      statusEl.classList.remove("connected");
      for (const row of bindingsEl.children) row.classList.remove("active");
      for (const row of combosEl.children) row.classList.remove("active");
    }
  }
  pollPads();
})();
