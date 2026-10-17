// Runs in every frame of the blended tab (the good student page, the bad student
// overlay and anything embedded in them) so the peek / nudge keys work wherever
// the focus is. Key presses are sent to the background, which forwards them to the
// overlay in the top frame.
(() => {
  if (window.__bbKeys) return;
  window.__bbKeys = true;

  let bindings = BB_KEYS.defaults;
  let myTabId = null;
  let enabled = false; // only while this tab is the blended tab
  let peeking = false;

  BB_KEYS.load((b) => { bindings = b; });

  chrome.runtime.sendMessage({ action: "keysHello" }, (r) => {
    if (chrome.runtime.lastError || !r) return;
    myTabId = r.tabId;
    enabled = r.active;
  });

  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c.keyBindings) BB_KEYS.load((b) => { bindings = b; });
    if (c.overlayState) {
      const ov = c.overlayState.newValue;
      enabled = !!ov && ov.tabId === myTabId;
      if (!enabled) peeking = false;
    }
  });

  function send(kind, extra) {
    try {
      chrome.runtime.sendMessage({ action: "blendKey", kind, ...extra }).catch(() => {});
    } catch (e) {} // extension reloaded: this old copy can't talk any more
  }

  function stopPeek() {
    if (!peeking) return;
    peeking = false;
    send("peekEnd");
  }

  window.addEventListener("keydown", (e) => {
    if (!enabled) return;
    if (BB_KEYS.matches(bindings.peek, e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!peeking) {
        peeking = true;
        send("peekStart");
      }
      return;
    }
    const left = BB_KEYS.matches(bindings.nudgeLeft, e);
    const right = !left && BB_KEYS.matches(bindings.nudgeRight, e);
    if (left || right) {
      e.preventDefault();
      e.stopImmediatePropagation();
      send("nudge", { delta: left ? -1 : 1 }); // holding the key repeats
    }
  }, true);

  // Peek lasts while the key is held. (On a Mac, releasing ⌘ ends it — macOS doesn't
  // report the letter key being released while ⌘ is still down.)
  window.addEventListener("keyup", (e) => {
    if (peeking && BB_KEYS.isRelease(bindings.peek, e)) stopPeek();
  }, true);
  window.addEventListener("blur", stopPeek);
})();
