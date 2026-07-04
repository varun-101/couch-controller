// Couch Controller — service worker. Handles browser-level commands that
// content scripts can't perform themselves.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "cc-command") return;

  switch (msg.command) {
    case "nextTab":
      cycleTab(sender.tab, 1);
      break;
    case "prevTab":
      cycleTab(sender.tab, -1);
      break;
    case "newTab":
      chrome.tabs.create({});
      break;
    case "closeTab":
      if (sender.tab) chrome.tabs.remove(sender.tab.id);
      break;
    case "reopenTab":
      chrome.sessions.restore().catch(() => {});
      break;
    case "openUrl": {
      const url = safeTabUrl(msg.url);
      if (url) chrome.tabs.create({ url });
      break;
    }
    case "windowFullscreen":
      toggleWindowFullscreen(sender.tab);
      break;
  }
});

async function cycleTab(fromTab, dir) {
  if (!fromTab) return;
  const tabs = await chrome.tabs.query({ windowId: fromTab.windowId });
  if (tabs.length < 2) return;
  tabs.sort((a, b) => a.index - b.index);
  const current = tabs.findIndex((t) => t.id === fromTab.id);
  const next = tabs[(current + dir + tabs.length) % tabs.length];
  chrome.tabs.update(next.id, { active: true });
}

async function toggleWindowFullscreen(fromTab) {
  if (!fromTab) return;
  const win = await chrome.windows.get(fromTab.windowId);
  chrome.windows.update(win.id, {
    state: win.state === "fullscreen" ? "normal" : "fullscreen"
  });
}

function safeTabUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}
