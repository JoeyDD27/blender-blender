// Strip X-Frame-Options and CSP so any site loads in our iframes
async function enableFrameBypass() {
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
        resourceTypes: ["sub_frame"]
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
chrome.runtime.onStartup.addListener(() => { getOverlay(); });
chrome.runtime.onInstalled.addListener(() => { getOverlay(); });

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

  await enableFrameBypass();
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
  }
  return { ok: true };
}

async function stopOverlay() {
  const ov = await getOverlay();
  if (!ov) return;
  await chrome.storage.local.remove("overlayState");
  chrome.tabs.sendMessage(ov.tabId, { action: "overlayStop" }).catch(() => {});
  await cleanupIfIdle();
}

// Page in the overlay tab reloaded or navigated: put the overlay back
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const ov = await getOverlay();
  if (ov && ov.tabId === tabId) injectOverlay(tabId);
});

// ---------- Messages ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startOverlay") {
    startOverlay(msg).then(sendResponse);
    return true;
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
function toggleEmergency() {
  emergencyQueue = emergencyQueue.then(async () => {
    const ids = await targetTabIds();
    if (ids.length === 0) return; // nothing blended, nothing to hide
    const { emergencyOn } = await chrome.storage.local.get("emergencyOn");
    const on = !emergencyOn;
    await chrome.storage.local.set({ emergencyOn: on });
    for (const id of ids) {
      chrome.tabs.sendMessage(id, { action: "emergency", on }).catch(() => {});
    }
  }).catch(() => {});
  return emergencyQueue;
}

// Keyboard shortcuts: emergency toggle / toggle the blender control bar
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "emergency") {
    toggleEmergency();
  } else if (command === "toggleBar") {
    for (const id of await targetTabIds()) {
      chrome.tabs.sendMessage(id, { action: "toggleBar" }).catch(() => {});
    }
  }
});
