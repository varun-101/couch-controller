const statusEl = document.getElementById("status");

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function poll() {
  requestAnimationFrame(poll);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find((p) => p && p.connected);
  if (pad) {
    statusEl.textContent = `Connected: ${pad.id.replace(/\s*\(.*\)\s*/g, "").slice(0, 50)}`;
    statusEl.classList.add("connected");
  } else {
    statusEl.innerHTML = "No controller detected.<br>Press any button on your controller.";
    statusEl.classList.remove("connected");
  }
}
poll();
