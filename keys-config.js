// Peek / nudge key settings, shared by the popup and keys.js.
// These keys are handled inside the blended tab itself (not as Chrome shortcuts)
// because Chrome shortcuts can't tell when a key is released (needed for "hold to
// peek") and only allow 4 default keys per extension.
globalThis.BB_KEYS = globalThis.BB_KEYS || (() => {
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const mod = isMac
    ? { meta: true, ctrl: false, alt: false, shift: false }
    : { meta: false, ctrl: true, alt: false, shift: false };

  const defaults = {
    peek: { code: "KeyF", ...mod },
    nudgeLeft: { code: "ArrowLeft", ...mod },
    nudgeRight: { code: "ArrowRight", ...mod }
  };

  function matches(b, e) {
    return !!b && e.code === b.code &&
      !!e.metaKey === !!b.meta && !!e.ctrlKey === !!b.ctrl &&
      !!e.altKey === !!b.alt && !!e.shiftKey === !!b.shift;
  }

  // Is this keyup the release of (part of) binding b?
  function isRelease(b, e) {
    return e.code === b.code ||
      (b.meta && e.key === "Meta") || (b.ctrl && e.key === "Control") ||
      (b.alt && e.key === "Alt") || (b.shift && e.key === "Shift");
  }

  const arrows = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
  function keyName(code) {
    if (arrows[code]) return arrows[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    return code;
  }

  function label(b) {
    if (!b) return "Not set";
    if (isMac) {
      return (b.ctrl ? "⌃" : "") + (b.alt ? "⌥" : "") + (b.shift ? "⇧" : "") + (b.meta ? "⌘" : "") + keyName(b.code);
    }
    return [b.ctrl && "Ctrl", b.alt && "Alt", b.shift && "Shift", b.meta && "Win", keyName(b.code)]
      .filter(Boolean).join("+");
  }

  function load(cb) {
    chrome.storage.local.get("keyBindings", (d) => cb({ ...defaults, ...(d.keyBindings || {}) }));
  }

  return { isMac, defaults, matches, isRelease, label, load };
})();
