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
  }

  blendBtn.disabled = !(marked.url1 && marked.url2);
}

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

// "Use URL" buttons toggle the URL input field
useUrl1.addEventListener("click", () => {
  const show = urlInput1.style.display === "none" || !urlInput1.style.display;
  urlInput1.style.display = show ? "" : "none";
  if (show) urlInput1.focus();
});

useUrl2.addEventListener("click", () => {
  const show = urlInput2.style.display === "none" || !urlInput2.style.display;
  urlInput2.style.display = show ? "" : "none";
  if (show) urlInput2.focus();
});

// URL input: press Enter to set a URL manually
function normalizeUrl(raw) {
  raw = raw.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  return raw;
}

urlInput1.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const url = normalizeUrl(urlInput1.value);
    if (!url) return;
    marked.url1 = url;
    marked.title1 = url.replace(/^https?:\/\//, "");
    marked.tabId1 = null;
    chrome.storage.local.set({ blendMarked: marked });
    urlInput1.value = "";
    updateUI();
  }
});

urlInput2.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const url = normalizeUrl(urlInput2.value);
    if (!url) return;
    marked.url2 = url;
    marked.title2 = url.replace(/^https?:\/\//, "");
    marked.tabId2 = null;
    chrome.storage.local.set({ blendMarked: marked });
    urlInput2.value = "";
    updateUI();
  }
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
  chrome.storage.local.set({
    blendUrls: { url1: marked.url1, url2: marked.url2 },
    blendPct: pct,
    blendTabName: tabName,
    blendFavicon: tabFavicon
  });

  chrome.runtime.sendMessage({
    action: "startBlend",
    tabId1: marked.tabId1,
    tabId2: marked.tabId2
  }, () => {
    window.close();
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
