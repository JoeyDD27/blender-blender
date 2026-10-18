// Watches the camera and turns the emergency on when someone new looks at the screen
// (see face-detector.js for the rules). Frames go to the sandboxed face tracker
// (face-sandbox.html) and never leave the computer.
const video = document.getElementById("cam");
const face = document.getElementById("face");
const detector = new FaceCountDetector();
const FRAME_MS = 100; // up to ~10 checks a second (someone walking up takes 1–2 s)

const stats = { frames: 0, since: performance.now(), lastFaces: null, fires: 0, error: null, trackMs: 0 };
let sandboxReady = false;
let reply = null; // resolves when the sandbox has handled the current frame

function status(s, fps) {
  const l = detector.last;
  chrome.runtime.sendMessage({
    action: "cameraStatus", status: s, fps,
    people: l.people, looking: l.looking, normal: l.normal
  }).catch(() => {});
}

// Report checks per second + what it sees once a second (shown in the popup)
let lastFrames = 0, lastReport = performance.now();
setInterval(() => {
  if (!sandboxReady) return;
  const now = performance.now();
  const fps = Math.round(((stats.frames - lastFrames) * 1000) / (now - lastReport));
  lastFrames = stats.frames; lastReport = now;
  status("watching", fps);
}, 1000);

window.addEventListener("message", (e) => {
  if (e.source !== face.contentWindow || !e.data) return;
  const m = e.data;
  if (m.type === "ready") sandboxReady = true;
  if (m.type === "faces") {
    stats.frames++;
    stats.lastFaces = m.faces;
    if (detector.update(m.faces, m.t)) {
      stats.fires++;
      chrome.runtime.sendMessage({ action: "faceTrigger" }).catch(() => {});
    }
  }
  if (m.type === "error") stats.error = m.message;
  if ((m.type === "faces" || m.type === "skip" || m.type === "error") && reply) {
    reply();
    reply = null;
  }
});

// Lets the tests (and future debugging) see what the camera is doing
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "cameraStats") {
    const secs = (performance.now() - stats.since) / 1000;
    sendResponse({ ...stats, ...detector.last, fps: +(stats.frames / secs).toFixed(1), sandboxReady });
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loop() {
  while (true) {
    const t0 = performance.now();
    if (sandboxReady && video.readyState >= 2) {
      const bitmap = await createImageBitmap(video);
      const done = new Promise((r) => { reply = r; });
      face.contentWindow.postMessage({ type: "frame", bitmap, t: t0 }, "*", [bitmap]);
      await Promise.race([done, sleep(1000)]); // never get stuck on one frame
      stats.trackMs = Math.round(stats.trackMs * 0.8 + (performance.now() - t0) * 0.2);
    }
    await sleep(Math.max(0, FRAME_MS - (performance.now() - t0)));
  }
}

(async () => {
  status("starting");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    status(e && e.name === "NotAllowedError" ? "no-permission" : "no-camera");
    return;
  }
  status("watching");
  loop();
})();
