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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startBlend") {
    (async () => {
      // Enable iframe header stripping
      await enableFrameBypass();

      // Figure out where to put the blend tab (replace first marked tab's position)
      let index = 0;
      let windowId;
      try {
        const tab1 = await chrome.tabs.get(msg.tabId1);
        index = tab1.index;
        windowId = tab1.windowId;
      } catch (e) {}

      // Open the blend page at that position FIRST
      const blendTab = await chrome.tabs.create({
        url: chrome.runtime.getURL("blend.html"),
        index: index,
        active: true,
        windowId: windowId
      });

      // Keep the original tabs open

      chrome.storage.local.set({ blendActive: true });
      sendResponse({ ok: true });
    })();
    return true; // async sendResponse
  }

  if (msg.action === "stopBlend") {
    disableFrameBypass();
    chrome.storage.local.set({ blendActive: false, blendMarked: null });
    sendResponse({ ok: true });
    return true;
  }
});

// Clean up header rules when the last blend tab closes
chrome.tabs.onRemoved.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL("blend.html") });
  if (tabs.length === 0) {
    disableFrameBypass();
    chrome.storage.local.set({ blendActive: false });
  }
});
