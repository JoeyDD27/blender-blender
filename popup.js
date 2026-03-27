let marked = { url1: null, title1: null, url2: null, title2: null };

const title1 = document.getElementById("title1");
const title2 = document.getElementById("title2");
const mark1 = document.getElementById("mark1");
const mark2 = document.getElementById("mark2");
const clear1 = document.getElementById("clear1");
const clear2 = document.getElementById("clear2");
const blendBtn = document.getElementById("blend");

function updateUI() {
  if (marked.url1) {
    title1.textContent = marked.title1;
    title1.classList.add("set");
    clear1.style.display = "";
    mark1.textContent = "Change";
  } else {
    title1.textContent = "No tab marked";
    title1.classList.remove("set");
    clear1.style.display = "none";
    mark1.textContent = "Mark tab";
  }

  if (marked.url2) {
    title2.textContent = marked.title2;
    title2.classList.add("set");
    clear2.style.display = "";
    mark2.textContent = "Change";
  } else {
    title2.textContent = "No tab marked";
    title2.classList.remove("set");
    clear2.style.display = "none";
    mark2.textContent = "Mark tab";
  }

  blendBtn.disabled = !(marked.url1 && marked.url2);
}

function markTab(slot) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].url) return;
    const tab = tabs[0];

    if (slot === 1) {
      marked.url1 = tab.url;
      marked.title1 = tab.title || tab.url;
    } else {
      marked.url2 = tab.url;
      marked.title2 = tab.title || tab.url;
    }

    chrome.storage.local.set({ blendMarked: marked });
    updateUI();
  });
}

mark1.addEventListener("click", () => markTab(1));
mark2.addEventListener("click", () => markTab(2));

clear1.addEventListener("click", () => {
  marked.url1 = null;
  marked.title1 = null;
  chrome.storage.local.set({ blendMarked: marked });
  updateUI();
});

clear2.addEventListener("click", () => {
  marked.url2 = null;
  marked.title2 = null;
  chrome.storage.local.set({ blendMarked: marked });
  updateUI();
});

blendBtn.addEventListener("click", () => {
  chrome.storage.local.set({
    blendUrls: { url1: marked.url1, url2: marked.url2 }
  });

  chrome.runtime.sendMessage({ action: "startBlend" }, () => {
    window.close();
  });
});

// Restore on open
chrome.storage.local.get(["blendMarked"], (data) => {
  if (data.blendMarked) marked = data.blendMarked;
  updateUI();
});
