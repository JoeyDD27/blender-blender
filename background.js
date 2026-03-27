// Add rules to strip iframe-blocking headers when blending starts
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
    enableFrameBypass().then(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL("blend.html") });
      chrome.storage.local.set({ blendActive: true });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === "stopBlend") {
    disableFrameBypass();
    chrome.storage.local.set({ blendActive: false });
    sendResponse({ ok: true });
    return true;
  }
});

// Clean up rules when the blend tab is closed
chrome.tabs.onRemoved.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL("blend.html") });
  if (tabs.length === 0) {
    disableFrameBypass();
    chrome.storage.local.set({ blendActive: false });
  }
});
