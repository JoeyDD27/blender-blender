let activeSite = 1;
let site1Pct = 60;

const frame1 = document.getElementById("frame1");
const frame2 = document.getElementById("frame2");
const dot = document.getElementById("dot");
const label = document.getElementById("label");
const slider = document.getElementById("blend-slider");
const pct1El = document.getElementById("pct1");
const pct2El = document.getElementById("pct2");
const darkSelect = document.getElementById("dark-select");

// Load URLs and percentage from storage
chrome.storage.local.get(["blendUrls", "blendPct", "blendTabName", "blendFavicon"], (data) => {
  if (data.blendTabName) document.title = data.blendTabName;
  if (data.blendFavicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = data.blendFavicon;
  }
  if (data.blendUrls) {
    frame1.src = data.blendUrls.url1;
    frame2.src = data.blendUrls.url2;
  }
  if (data.blendPct != null) {
    site1Pct = data.blendPct;
    slider.value = site1Pct;
  }
  applyBlend();
});

function applyBlend() {
  const s1 = site1Pct / 100;
  const s2 = 1 - s1;

  if (activeSite === 1) {
    // Site 1 on bottom (interactive), site 2 overlaid on top
    frame1.style.zIndex = 1;
    frame1.style.opacity = 1;
    frame1.style.pointerEvents = "auto";

    frame2.style.zIndex = 2;
    frame2.style.opacity = s2;
    frame2.style.pointerEvents = "none";

    dot.className = "";
    label.textContent = "Good student tab (" + site1Pct + "%)";
  } else {
    // Site 2 on bottom (interactive), site 1 overlaid on top
    frame2.style.zIndex = 1;
    frame2.style.opacity = 1;
    frame2.style.pointerEvents = "auto";

    frame1.style.zIndex = 2;
    frame1.style.opacity = s1;
    frame1.style.pointerEvents = "none";

    dot.className = "site2";
    label.textContent = "Bad student tab (" + (100 - site1Pct) + "%)";
  }

  pct1El.textContent = site1Pct + "%";
  pct2El.textContent = (100 - site1Pct) + "%";
}

// Percentage slider
slider.addEventListener("input", () => {
  site1Pct = parseInt(slider.value, 10);
  chrome.storage.local.set({ blendPct: site1Pct });
  applyBlend();
});

// Swap button
document.getElementById("swap-btn").addEventListener("click", () => {
  activeSite = activeSite === 1 ? 2 : 1;
  applyBlend();
});

// Dark mode dropdown
darkSelect.addEventListener("change", () => {
  const val = darkSelect.value;
  frame1.classList.toggle("darkened", val === "1");
  frame2.classList.toggle("darkened", val === "2");
});

// Listen for toggle / emergency / toggleBar from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "toggle") {
    activeSite = activeSite === 1 ? 2 : 1;
    applyBlend();
  }
  if (msg.action === "emergency") {
    activeSite = 1;
    site1Pct = 100;
    slider.value = 100;
    applyBlend();
  }
  if (msg.action === "toggleBar") {
    document.getElementById("bar").classList.toggle("visible");
  }
});

// Clean up when closing
window.addEventListener("beforeunload", () => {
  chrome.runtime.sendMessage({ action: "stopBlend" });
});
