// Strip X-Frame-Options and CSP so the bad student site can load on top of the good
// one. Only applies inside the blended tab — every other tab keeps its normal
// anti-framing protection.
async function enableFrameBypass(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "content-security-policy", operation: "remove" }
        ]
      },
      condition: {
        resourceTypes: ["sub_frame"],
        tabIds: [tabId]
      }
    }]
  });
}

async function disableFrameBypass() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1]
  });
}

// The running blend, or null. If its tab is gone (closed while Chrome was quitting,
// extension reloaded, etc.) the leftover state is cleared here, so the shortcuts and
// header stripping don't think a blend is still running.
async function getOverlay() {
  const { overlayState } = await chrome.storage.local.get("overlayState");
  if (!overlayState) return null;
  try {
    await chrome.tabs.get(overlayState.tabId);
    return overlayState;
  } catch (e) {
    await chrome.storage.local.remove("overlayState");
    await disableFrameBypass();
    chrome.storage.local.set({ emergencyOn: false });
    return null;
  }
}

// Chrome restarted / extension reloaded: drop any blend left over from before
chrome.runtime.onStartup.addListener(() => { getOverlay().then(syncCamera); });
chrome.runtime.onInstalled.addListener(() => { getOverlay().then(syncCamera); });

// ---------- Face emergency ----------
// The camera runs (in a hidden offscreen page) only while a blend is running AND the
// Face emergency switch is on. When someone new looks at the screen it turns the
// emergency ON — it never un-hides by itself.
let cameraQueue = Promise.resolve();
function syncCamera() {
  cameraQueue = cameraQueue.then(async () => {
    const { faceEnabled } = await chrome.storage.local.get("faceEnabled");
    const want = !!faceEnabled && !!(await getOverlay());
    const has = (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0;
    if (want && !has) {
      await chrome.offscreen.createDocument({
        url: "camera.html",
        reasons: ["USER_MEDIA"],
        justification: "Watches for someone new looking at the screen while a blend is running"
      });
    } else if (!want && has) {
      await chrome.offscreen.closeDocument();
      chrome.storage.local.set({ faceStatus: "off" });
    }
  }).catch(() => {});
  return cameraQueue;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.overlayState || changes.faceEnabled)) syncCamera();
});


// Turn the header stripping off once no blend is running
async function cleanupIfIdle() {
  if (!(await getOverlay())) {
    await disableFrameBypass();
    chrome.storage.local.set({ emergencyOn: false });
  }
}

// The tab the shortcuts should talk to (the blended good student tab)
async function targetTabIds() {
  const ov = await getOverlay();
  return ov ? [ov.tabId] : [];
}

// ---------- Blend ----------
// Every blend works the same way: the good student tab stays a real tab (so it
// connects normally) and the bad student tab is drawn on top of it by overlay.js.

async function injectOverlay(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
    return true;
  } catch (e) {
    return false;
  }
}

async function startOverlay(msg) {
  const { blendMarked: m } = await chrome.storage.local.get("blendMarked");
  if (!m || !m.url1 || !m.url2) return { ok: false, error: "Mark both tabs first." };

  const base = msg.baseSlot === 1 ? 1 : 2;
  const baseUrl = base === 1 ? m.url1 : m.url2;
  const baseTabId = base === 1 ? m.tabId1 : m.tabId2;
  const otherUrl = base === 1 ? m.url2 : m.url1;

  // Only one overlay at a time
  await stopOverlay();

  // Use the marked tab if it's still open, otherwise open the site in a new tab
  let tab = null;
  if (baseTabId != null) {
    try { tab = await chrome.tabs.get(baseTabId); } catch (e) {}
  }
  if (!tab) tab = await chrome.tabs.create({ url: baseUrl, active: true });

  await enableFrameBypass(tab.id);
  await chrome.storage.local.set({
    overlayState: {
      tabId: tab.id,
      baseSlot: base,
      otherUrl,
      tabName: msg.tabName || null,
      favicon: msg.favicon || null
    },
    emergencyOn: false
  });

  await chrome.tabs.update(tab.id, { active: true });
  try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}

  // If the page is still loading, tabs.onUpdated injects when it finishes
  if (tab.status === "complete") {
    const ok = await injectOverlay(tab.id);
    if (!ok) {
      await chrome.storage.local.remove("overlayState");
      await cleanupIfIdle();
      return { ok: false, error: "Chrome doesn't let extensions draw on this page (chrome:// pages, the Web Store, etc.)." };
    }
    injectKeys(tab.id); // frames already on the page
  }
  applyMute();
  return { ok: true };
}

async function stopOverlay() {
  const ov = await getOverlay();
  if (!ov) return;
  await chrome.storage.local.remove("overlayState");
  // Don't leave the good student tab muted after the blend ends
  const { muteBad } = await chrome.storage.local.get("muteBad");
  if (muteBad) chrome.tabs.update(ov.tabId, { muted: false }).catch(() => {});
  chrome.tabs.sendMessage(ov.tabId, { action: "overlayStop" }).catch(() => {});
  await cleanupIfIdle();
}

// Page in the overlay tab reloaded or navigated: put the overlay back
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const ov = await getOverlay();
  if (ov && ov.tabId === tabId) injectOverlay(tabId);
});

// ---------- Peek / nudge keys ----------
// keys.js goes into every frame of the blended tab (including the bad student
// site and anything loaded later), so the keys work wherever the focus is.
function injectKeys(tabId, frameId) {
  const target = frameId == null ? { tabId, allFrames: true } : { tabId, frameIds: [frameId] };
  chrome.scripting.executeScript({ target, files: ["keys-config.js", "keys.js"] }).catch(() => {});
}

chrome.webNavigation.onDOMContentLoaded.addListener(async (d) => {
  const ov = await getOverlay();
  if (ov && ov.tabId === d.tabId) injectKeys(d.tabId, d.frameId);
});

// ---------- Mute tab ----------
// Mutes the blended tab (the bad student site plays inside it) and the original
// bad student tab if it's still open. Chrome can only mute whole tabs.
async function applyMute() {
  const { muteBad, blendMarked: m } = await chrome.storage.local.get(["muteBad", "blendMarked"]);
  const ov = await getOverlay();
  const ids = new Set();
  if (ov) ids.add(ov.tabId);
  if (m && m.tabId2 != null) ids.add(m.tabId2);
  for (const id of ids) {
    try { await chrome.tabs.update(id, { muted: !!muteBad }); } catch (e) {}
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.muteBad) applyMute();
});

// ---------- Messages ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startOverlay") {
    startOverlay(msg).then(sendResponse);
    return true;
  }

  if (msg.action === "keysHello") {
    const tabId = sender.tab && sender.tab.id;
    getOverlay().then((ov) => sendResponse({ tabId, active: !!ov && ov.tabId === tabId }));
    return true;
  }

  if (msg.action === "blendKey") {
    const tabId = sender.tab && sender.tab.id;
    getOverlay().then((ov) => {
      if (!ov || ov.tabId !== tabId) return;
      if (msg.kind === "emergency") toggleEmergency();
      else if (msg.kind === "toggleBar") {
        chrome.tabs.sendMessage(tabId, { action: "toggleBar" }, { frameId: 0 }).catch(() => {});
      } else {
        chrome.tabs.sendMessage(tabId, { action: "key", kind: msg.kind, delta: msg.delta }, { frameId: 0 }).catch(() => {});
      }
    });
    return false;
  }

  if (msg.action === "faceTrigger") {
    toggleEmergency(true);
    return false;
  }

  if (msg.action === "cameraStatus") {
    chrome.storage.local.set({
      faceStatus: msg.status,
      faceFps: msg.fps == null ? null : msg.fps,
      faceSeen: msg.people == null ? null : { people: msg.people, looking: msg.looking, normal: msg.normal }
    });
    // Permission was taken away: switch the feature off instead of retrying forever
    if (msg.status === "no-permission") chrome.storage.local.set({ faceEnabled: false });
    return false;
  }

  if (msg.action === "stopOverlay") {
    stopOverlay().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// Clean up when tabs close
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const ov = await getOverlay();
  if (ov && ov.tabId === tabId) {
    await chrome.storage.local.remove("overlayState");
    cleanupIfIdle();
  }
});

// Emergency is a toggle: 1st press snaps the blend to 100% good student tab,
// 2nd press puts it back exactly how it was before the emergency.
// Presses are queued so mashing the key can't make the on/off state get out of sync.
let emergencyQueue = Promise.resolve();
// force: undefined = toggle, true = only turn ON (used by face emergency)
function toggleEmergency(force) {
  emergencyQueue = emergencyQueue.then(async () => {
    const ids = await targetTabIds();
    if (ids.length === 0) return; // nothing blended, nothing to hide
    const { emergencyOn } = await chrome.storage.local.get("emergencyOn");
    if (force === true && emergencyOn) return; // already hidden
    const on = !emergencyOn;
    await chrome.storage.local.set({ emergencyOn: on });
    for (const id of ids) {
      chrome.tabs.sendMessage(id, { action: "emergency", on }).catch(() => {});
    }
  }).catch(() => {});
  return emergencyQueue;
}
