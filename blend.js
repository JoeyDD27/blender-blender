let activeSite = 1;

const frame1 = document.getElementById("frame1");
const frame2 = document.getElementById("frame2");
const dot = document.getElementById("dot");
const label = document.getElementById("label");

// Load the marked URLs
chrome.storage.local.get(["blendUrls"], (data) => {
  if (data.blendUrls) {
    frame1.src = data.blendUrls.url1;
    frame2.src = data.blendUrls.url2;
  }
});

function setActive(site) {
  activeSite = site;

  if (site === 1) {
    // Site 1 on bottom (interactive), site 2 overlay at 40%
    frame1.style.zIndex = 1;
    frame1.style.opacity = 1;
    frame1.style.pointerEvents = "auto";

    frame2.style.zIndex = 2;
    frame2.style.opacity = 0.4;
    frame2.style.pointerEvents = "none";

    dot.className = "";
    label.textContent = "Using: Site 1 (60%)";
  } else {
    // Site 2 on bottom (interactive), site 1 overlay at 60%
    frame2.style.zIndex = 1;
    frame2.style.opacity = 1;
    frame2.style.pointerEvents = "auto";

    frame1.style.zIndex = 2;
    frame1.style.opacity = 0.6;
    frame1.style.pointerEvents = "none";

    dot.className = "site2";
    label.textContent = "Using: Site 2 (40%)";
  }
}

// Listen for toggle from background (Ctrl+Shift+Q)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "toggle") {
    setActive(activeSite === 1 ? 2 : 1);
  }
});

// Swap button
document.getElementById("swap-btn").addEventListener("click", () => {
  setActive(activeSite === 1 ? 2 : 1);
});

// Dark mode dropdown
const darkSelect = document.getElementById("dark-select");
darkSelect.addEventListener("change", () => {
  const val = darkSelect.value;
  frame1.classList.toggle("darkened", val === "1");
  frame2.classList.toggle("darkened", val === "2");
});

// Notify background to clean up when this tab closes
window.addEventListener("beforeunload", () => {
  chrome.runtime.sendMessage({ action: "stopBlend" });
});

setActive(1);
