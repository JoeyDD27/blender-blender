// One-time camera permission. Chrome remembers the answer for the extension, so the
// hidden camera page can use the camera later without asking again.
const msg = document.getElementById("msg");

document.getElementById("allow").addEventListener("click", async () => {
  msg.className = "";
  msg.textContent = "Waiting for you to allow the camera…";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop()); // just asking — turn it straight off
    await chrome.storage.local.set({ faceEnabled: true });
    msg.className = "ok";
    msg.textContent = "All set! Face emergency is on. You can close this tab.";
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    msg.className = "err";
    msg.textContent = e && e.name === "NotAllowedError"
      ? "Camera was blocked. Click the camera icon in the address bar, allow it, then try again."
      : "Couldn't find a camera.";
  }
});
