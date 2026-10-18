let marked = { url1: null, title1: null, tabId1: null, favicon1: null, url2: null, title2: null, tabId2: null, favicon2: null };
let pct = 60;

const title1 = document.getElementById("title1");
const title2 = document.getElementById("title2");
const badge1 = document.getElementById("badge1");
const badge2 = document.getElementById("badge2");
const mark1 = document.getElementById("mark1");
const mark2 = document.getElementById("mark2");
const clear1 = document.getElementById("clear1");
const clear2 = document.getElementById("clear2");
const blendBtn = document.getElementById("blend");
const pctSlider = document.getElementById("pctSlider");
const pctLabel = document.getElementById("pctLabel");
const urlInput1 = document.getElementById("urlInput1");
const urlInput2 = document.getElementById("urlInput2");
const useUrl1 = document.getElementById("useUrl1");
const useUrl2 = document.getElementById("useUrl2");
const tabNameSelect = document.getElementById("tabNameSelect");
const customTabName = document.getElementById("customTabName");

function updateUI() {
  badge1.textContent = pct + "%";
  badge2.textContent = (100 - pct) + "%";
  pctLabel.textContent = pct + " / " + (100 - pct);

  if (marked.url1) {
    title1.textContent = marked.title1;
    title1.classList.add("set");
    clear1.style.display = "";
    mark1.textContent = "Change";
    useUrl1.style.display = "none";
    urlInput1.style.display = "none";
    urlInput1.value = "";
  } else {
    title1.textContent = "No tab marked";
    title1.classList.remove("set");
    clear1.style.display = "none";
    mark1.textContent = "Mark tab";
    useUrl1.style.display = "";
    useUrl1.textContent = "Use URL";
  }

  if (marked.url2) {
    title2.textContent = marked.title2;
    title2.classList.add("set");
    clear2.style.display = "";
    mark2.textContent = "Change";
    useUrl2.style.display = "none";
    urlInput2.style.display = "none";
    urlInput2.value = "";
  } else {
    title2.textContent = "No tab marked";
    title2.classList.remove("set");
    clear2.style.display = "none";
    mark2.textContent = "Mark tab";
    useUrl2.style.display = "";
    useUrl2.textContent = "Use URL";
  }

  blendBtn.disabled = !(marked.url1 && marked.url2);
}

const noteEl = document.getElementById("note");

pctSlider.addEventListener("input", () => {
  pct = parseInt(pctSlider.value);
  chrome.storage.local.set({ blendPct: pct });
  updateUI();
});

function markTab(slot) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].url) return;
    const tab = tabs[0];

    if (slot === 1) {
      marked.url1 = tab.url;
      marked.title1 = tab.title || tab.url;
      marked.tabId1 = tab.id;
      marked.favicon1 = tab.favIconUrl || null;
    } else {
      marked.url2 = tab.url;
      marked.title2 = tab.title || tab.url;
      marked.tabId2 = tab.id;
      marked.favicon2 = tab.favIconUrl || null;
    }

    chrome.storage.local.set({ blendMarked: marked });
    updateUI();
  });
}

mark1.addEventListener("click", () => markTab(1));
mark2.addEventListener("click", () => markTab(2));

clear1.addEventListener("click", () => {
  marked.url1 = null; marked.title1 = null; marked.tabId1 = null; marked.favicon1 = null;
  chrome.storage.local.set({ blendMarked: marked });
  updateUI();
});

clear2.addEventListener("click", () => {
  marked.url2 = null; marked.title2 = null; marked.tabId2 = null; marked.favicon2 = null;
  chrome.storage.local.set({ blendMarked: marked });
  updateUI();
});

function normalizeUrl(raw) {
  raw = raw.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  return raw;
}

function commitUrl(slot) {
  const input = slot === 1 ? urlInput1 : urlInput2;
  const url = normalizeUrl(input.value);
  if (!url) return false;
  if (slot === 1) {
    marked.url1 = url;
    marked.title1 = url.replace(/^https?:\/\//, "");
    marked.tabId1 = null;
  } else {
    marked.url2 = url;
    marked.title2 = url.replace(/^https?:\/\//, "");
    marked.tabId2 = null;
  }
  chrome.storage.local.set({ blendMarked: marked });
  input.value = "";
  updateUI();
  return true;
}

function setUseUrlButton(slot, mode) {
  const btn = slot === 1 ? useUrl1 : useUrl2;
  btn.textContent = mode === "go" ? "Go" : "Use URL";
}

// "Use URL" button: first click shows the input, second click commits the URL
function handleUseUrlClick(slot) {
  const input = slot === 1 ? urlInput1 : urlInput2;
  const isHidden = getComputedStyle(input).display === "none";
  if (isHidden) {
    input.style.display = "block";
    input.focus();
    setUseUrlButton(slot, "go");
    return;
  }
  if (input.value.trim()) {
    commitUrl(slot);
    setUseUrlButton(slot, "default");
  } else {
    input.style.display = "none";
    setUseUrlButton(slot, "default");
  }
}

useUrl1.addEventListener("click", () => handleUseUrlClick(1));
useUrl2.addEventListener("click", () => handleUseUrlClick(2));

// Auto-commit when the user clicks away from the input
urlInput1.addEventListener("blur", () => {
  if (urlInput1.value.trim()) commitUrl(1);
});
urlInput2.addEventListener("blur", () => {
  if (urlInput2.value.trim()) commitUrl(2);
});

// Enter still works for keyboard users
urlInput1.addEventListener("keydown", (e) => {
  if (e.key === "Enter") commitUrl(1);
});
urlInput2.addEventListener("keydown", (e) => {
  if (e.key === "Enter") commitUrl(2);
});

// Tab name selector
tabNameSelect.addEventListener("change", () => {
  customTabName.style.display = tabNameSelect.value === "custom" ? "" : "none";
});

function getChosenTabName() {
  const choice = tabNameSelect.value;
  if (choice === "tab1") return marked.title1 || "Blended View";
  if (choice === "tab2") return marked.title2 || "Blended View";
  return customTabName.value.trim() || "Blended View";
}

function getChosenFavicon() {
  const choice = tabNameSelect.value;
  if (choice === "tab1") return marked.favicon1 || null;
  if (choice === "tab2") return marked.favicon2 || null;
  return marked.favicon1 || null;
}

blendBtn.addEventListener("click", () => {
  const tabName = getChosenTabName();
  const tabFavicon = getChosenFavicon();

  // Every blend: the good student tab is the real tab, the bad student tab goes on top.
  // Don't rename the good tab to its own title (that would freeze it).
  const keepOwn = tabNameSelect.value === "tab1";
  chrome.storage.local.set({ blendPct: pct });
  chrome.runtime.sendMessage({
    action: "startOverlay",
    baseSlot: 1,
    tabName: keepOwn ? null : tabName,
    favicon: keepOwn ? null : tabFavicon
  }, (resp) => {
    if (resp && resp.ok) {
      window.close();
    } else {
      noteEl.classList.add("error");
      noteEl.textContent = (resp && resp.error) || "Couldn't start the blend.";
    }
  });
});

// Restore state on open
chrome.storage.local.get(["blendMarked", "blendPct"], (data) => {
  if (data.blendMarked) marked = data.blendMarked;
  if (data.blendPct != null) {
    pct = data.blendPct;
    pctSlider.value = pct;
  }
  updateUI();
});

// Popup visibility slider (0-100%) — dims the popup body, slider stays full opacity
const popupVis = document.getElementById("popupVis");
const popupVisLabel = document.getElementById("popupVisLabel");
const dimmable = document.getElementById("dimmable");

function applyPopupVis(v) {
  dimmable.style.opacity = v / 100;
  popupVisLabel.textContent = v + "%";
}

popupVis.addEventListener("input", () => {
  const v = parseInt(popupVis.value, 10);
  chrome.storage.local.set({ popupOpacity: v });
  applyPopupVis(v);
});

chrome.storage.local.get(["popupOpacity"], (data) => {
  const v = data.popupOpacity != null ? data.popupOpacity : 100;
  popupVis.value = v;
  applyPopupVis(v);
});

// ---- Mute tab (same switch as the Mute button on the control bar) ----
const muteBadEl = document.getElementById("muteBad");
chrome.storage.local.get("muteBad", (d) => { muteBadEl.checked = !!d.muteBad; });
muteBadEl.addEventListener("change", () => {
  chrome.storage.local.set({ muteBad: muteBadEl.checked }); // background does the muting
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && c.muteBad) muteBadEl.checked = !!c.muteBad.newValue;
});

// ---- Shortcut keys (all of them): click Change, then press the new key combo ----
let keyBindings = BB_KEYS.defaults;
const keyNote = document.getElementById("keyNote");
const KEY_NOTE = keyNote.textContent;
let capturing = null; // which binding is waiting for a key press

function showKeys() {
  for (const name of Object.keys(BB_KEYS.defaults)) {
    document.getElementById("key-" + name).textContent =
      capturing === name ? "Press keys…" : BB_KEYS.label(keyBindings[name]);
  }
  document.querySelectorAll(".change-key").forEach((a) => {
    const on = a.dataset.key === capturing;
    a.classList.toggle("capturing", on);
    a.textContent = on ? "Cancel" : "Change";
  });
}

BB_KEYS.load((b) => { keyBindings = b; showKeys(); });

document.querySelectorAll(".change-key").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    capturing = capturing === a.dataset.key ? null : a.dataset.key;
    showKeys();
  });
});

document.addEventListener("keydown", (e) => {
  if (!capturing) return;
  e.preventDefault();
  if (e.key === "Escape") {
    capturing = null;
    keyNote.textContent = KEY_NOTE;
    keyNote.classList.remove("error");
    showKeys();
    return;
  }
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return; // wait for the main key
  const combo = { code: e.code, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey };
  // Don't let two actions share one key
  const clash = Object.keys(keyBindings).find((k) => k !== capturing && BB_KEYS.same(keyBindings[k], combo));
  if (clash) {
    keyNote.textContent = BB_KEYS.label(combo) + " is already used for " + BB_KEYS.names[clash] + ". Try another.";
    keyNote.classList.add("error");
    return; // keep waiting for a different key
  }
  keyNote.textContent = KEY_NOTE;
  keyNote.classList.remove("error");
  keyBindings = { ...keyBindings, [capturing]: combo };
  chrome.storage.local.set({ keyBindings });
  capturing = null;
  showKeys();
}, true);


// ---- Face emergency ----
const faceEl = document.getElementById("faceEnabled");
const faceStatusEl = document.getElementById("faceStatus");

function showFaceStatus(enabled, status, fps, seen) {
  faceEl.checked = !!enabled;
  faceStatusEl.classList.toggle("on", !!enabled && status === "watching" && (fps == null || fps >= 4));
  faceStatusEl.classList.toggle("warn", !!enabled && status === "watching" && fps != null && fps > 0 && fps < 4);
  if (!enabled) faceStatusEl.textContent = "Hides when someone new looks";
  else if (status === "watching") {
    faceStatusEl.textContent = fps == null ? "Watching (camera on)"
      : fps === 0 ? "Warming up…"
      : fps >= 4 ? "Watching · " + fps + " checks/s"
      : "Watching · only " + fps + " checks/s (may be slow)";
    // Other people seen / looking at the screen / how many looking is OK right now
    if (seen) faceStatusEl.textContent += " · others " + seen.people + ", looking " + seen.looking + " (ok " + seen.normal + ")";
  }
  else if (status === "starting") faceStatusEl.textContent = "Starting camera…";
  else if (status === "no-camera") faceStatusEl.textContent = "No camera found";
  else faceStatusEl.textContent = "Camera turns on during a blend";
}

const refreshFace = () => chrome.storage.local.get(["faceEnabled", "faceStatus", "faceFps", "faceSeen"],
  (d) => showFaceStatus(d.faceEnabled, d.faceStatus, d.faceFps, d.faceSeen));
refreshFace();
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && (c.faceEnabled || c.faceStatus || c.faceFps || c.faceSeen)) refreshFace();
});

faceEl.addEventListener("change", async () => {
  if (!faceEl.checked) {
    chrome.storage.local.set({ faceEnabled: false });
    return;
  }
  // Needs camera permission once; a popup can't ask for it, so use a small tab
  let state = "prompt";
  try { state = (await navigator.permissions.query({ name: "camera" })).state; } catch (e) {}
  if (state === "granted") {
    chrome.storage.local.set({ faceEnabled: true });
  } else {
    faceEl.checked = false;
    chrome.tabs.create({ url: chrome.runtime.getURL("camera-setup.html") });
  }
});
