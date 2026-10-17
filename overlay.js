// Blend — injected into the good student tab. The page stays a real tab exactly as
// it is; we draw the bad student tab on top of it at the blend percentage, plus the
// control bar. "Swap" changes which site gets your clicks and typing.
(() => {
  if (window.__tochOverlay) return; // already running on this page
  window.__tochOverlay = true;

  let st = null;          // overlayState from storage
  let site1Pct = 60;      // % of the good student tab (same meaning as everywhere else)
  let activeSite = 1;     // which site gets clicks: 1 = good, 2 = bad
  let emergencySaved = null;

  let host, ov, darkLayer, dot, label, slider, pct1El, pct2El, darkSelect, bar;
  let headObserver = null, hostObserver = null;
  const originalTitle = document.title;
  const iconChanges = []; // [{ link, oldHref, created }]

  const overlaySlot = () => 3 - st.baseSlot;

  function build() {
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        #dark { position: fixed; inset: 0; pointer-events: none; display: none;
                backdrop-filter: invert(0.88) hue-rotate(180deg); }
        #ov { position: fixed; inset: 0; width: 100%; height: 100%; border: none;
              background: transparent; opacity: 0.4; pointer-events: none; }
        #ov.darkened { filter: invert(0.88) hue-rotate(180deg); }
        #bar { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
               background: rgba(10,10,24,0.94); backdrop-filter: blur(12px);
               border: 1px solid rgba(102,126,234,0.3); border-radius: 10px;
               padding: 8px 16px; display: flex; align-items: center; gap: 12px;
               font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 13px; color: #ccc;
               user-select: none; white-space: nowrap;
               opacity: 0; pointer-events: none; transition: opacity 0.15s; }
        #bar.visible { opacity: 1; pointer-events: auto; }
        #dot { width: 9px; height: 9px; border-radius: 50%; background: #667eea; flex-shrink: 0; }
        #dot.site2 { background: #c084fc; }
        #label { font-weight: 600; font-size: 12px; }
        .slider-group { display: flex; align-items: center; gap: 5px; }
        .pct-num { font-size: 11px; font-weight: 700; min-width: 28px; text-align: center; }
        .pct-1 { color: #667eea; } .pct-2 { color: #c084fc; }
        #slider { -webkit-appearance: none; appearance: none; width: 80px; height: 4px;
                  border-radius: 2px; background: linear-gradient(90deg,#667eea,#c084fc);
                  outline: none; cursor: pointer; margin: 0; }
        #slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
                  width: 14px; height: 14px; border-radius: 50%; background: #fff;
                  border: 2px solid #667eea; cursor: pointer; }
        .btn { border: none; color: #fff; font: 600 11px 'Segoe UI', Tahoma, sans-serif;
               padding: 5px 12px; border-radius: 6px; cursor: pointer; }
        .btn:hover { opacity: 0.8; }
        #swap { background: linear-gradient(135deg,#667eea,#764ba2); }
        #stop { background: rgba(255,80,80,0.25); color: #ff8a8a; }
        select { background: #2a2a4a; color: #ccc; border: 1px solid #444; border-radius: 5px;
                 padding: 4px 6px; font-size: 11px; cursor: pointer; }
        .tag { font-size: 10px; color: #888; border: 1px solid #444; border-radius: 4px; padding: 1px 5px; }
      </style>
      <div id="dark"></div>
      <iframe id="ov" allow="autoplay; fullscreen; clipboard-write"></iframe>
      <div id="bar">
        <span id="dot"></span>
        <span id="label"></span>
        <div class="slider-group">
          <span class="pct-num pct-1" id="pct1"></span>
          <input type="range" id="slider" min="0" max="100">
          <span class="pct-num pct-2" id="pct2"></span>
        </div>
        <button class="btn" id="swap">Swap</button>
        <select id="dark-select">
          <option value="none">Dark: Off</option>
          <option value="1">Dark: Good student tab</option>
          <option value="2">Dark: Bad student tab</option>
        </select>
        <button class="btn" id="stop">Stop</button>
      </div>`;

    ov = root.getElementById("ov");
    darkLayer = root.getElementById("dark");
    bar = root.getElementById("bar");
    dot = root.getElementById("dot");
    label = root.getElementById("label");
    slider = root.getElementById("slider");
    pct1El = root.getElementById("pct1");
    pct2El = root.getElementById("pct2");
    darkSelect = root.getElementById("dark-select");

    ov.src = chrome.runtime.getURL("overlay-frame.html") + "?url=" + encodeURIComponent(st.otherUrl);

    slider.addEventListener("input", () => {
      cancelEmergency();
      site1Pct = parseInt(slider.value, 10);
      chrome.storage.local.set({ blendPct: site1Pct });
      applyBlend();
    });
    root.getElementById("swap").addEventListener("click", () => {
      cancelEmergency();
      activeSite = activeSite === 1 ? 2 : 1;
      applyBlend();
    });
    darkSelect.addEventListener("change", applyDark);
    root.getElementById("stop").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "stopOverlay" });
    });

    document.documentElement.appendChild(host);

    // Some pages rebuild their DOM; if our overlay gets removed, put it back
    hostObserver = new MutationObserver(() => {
      if (!host.isConnected) document.documentElement.appendChild(host);
    });
    hostObserver.observe(document.documentElement, { childList: true });
  }

  function applyBlend() {
    const o = overlaySlot();
    const overlayPct = o === 1 ? site1Pct : 100 - site1Pct;
    ov.style.opacity = overlayPct / 100;
    ov.style.pointerEvents = activeSite === o ? "auto" : "none";

    slider.value = site1Pct;
    if (activeSite === 1) {
      dot.className = "";
      label.textContent = "Good student tab (" + site1Pct + "%)";
    } else {
      dot.className = "site2";
      label.textContent = "Bad student tab (" + (100 - site1Pct) + "%)";
    }
    pct1El.textContent = site1Pct + "%";
    pct2El.textContent = (100 - site1Pct) + "%";
  }

  // Dark mode: the overlay site gets a filter; the real page gets an inverting
  // layer laid over it (so we never touch the page's own styles).
  function applyDark() {
    const v = darkSelect.value;
    const darkOverlay = v === String(overlaySlot());
    const darkBase = v === String(st.baseSlot);
    ov.classList.toggle("darkened", darkOverlay);
    darkLayer.style.display = darkBase ? "block" : "none";
  }

  // ---- Tab name / icon disguise (keeps it even if the page changes its title) ----
  function applyTitleIcon() {
    if (st.tabName && document.title !== st.tabName) document.title = st.tabName;
    if (st.favicon) {
      const links = document.querySelectorAll("link[rel~='icon']");
      if (links.length === 0) {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = st.favicon;
        (document.head || document.documentElement).appendChild(link);
        iconChanges.push({ link, created: true });
      }
      links.forEach((link) => {
        if (link.href !== st.favicon) {
          if (!iconChanges.some((c) => c.link === link)) iconChanges.push({ link, oldHref: link.href });
          link.href = st.favicon;
        }
      });
    }
  }

  function watchHead() {
    if (!st.tabName && !st.favicon) return;
    applyTitleIcon();
    headObserver = new MutationObserver(applyTitleIcon);
    headObserver.observe(document.head || document.documentElement, {
      subtree: true, childList: true, characterData: true
    });
  }

  // ---- Emergency toggle (same behaviour as the blend tab) ----
  function enterEmergency() {
    if (emergencySaved) return;
    emergencySaved = { site1Pct, activeSite };
    activeSite = 1;
    site1Pct = 100;
    applyBlend();
  }
  function exitEmergency() {
    if (!emergencySaved) return;
    site1Pct = emergencySaved.site1Pct;
    activeSite = emergencySaved.activeSite;
    emergencySaved = null;
    applyBlend();
  }
  function cancelEmergency() {
    if (!emergencySaved) return;
    emergencySaved = null;
    chrome.storage.local.set({ emergencyOn: false });
  }

  function teardown() {
    if (hostObserver) hostObserver.disconnect();
    if (headObserver) headObserver.disconnect();
    if (host) host.remove();
    if (st && st.tabName) document.title = originalTitle;
    for (const c of iconChanges) {
      if (c.created) c.link.remove();
      else c.link.href = c.oldHref;
    }
    chrome.runtime.onMessage.removeListener(onMessage);
    window.__tochOverlay = false;
  }

  function onMessage(msg) {
    if (msg.action === "emergency") msg.on ? enterEmergency() : exitEmergency();
    if (msg.action === "toggleBar") bar.classList.toggle("visible");
    if (msg.action === "overlayStop") teardown();
  }

  chrome.storage.local.get(["overlayState", "blendPct", "emergencyOn"], (d) => {
    st = d.overlayState;
    if (!st) { window.__tochOverlay = false; return; }
    if (d.blendPct != null) site1Pct = d.blendPct;
    activeSite = st.baseSlot; // start with the real page taking your clicks
    build();
    applyBlend();
    watchHead();
    if (d.emergencyOn) enterEmergency(); // reloaded mid-emergency: stay hidden
    chrome.runtime.onMessage.addListener(onMessage);
  });
})();
