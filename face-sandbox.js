// Receives camera frames from camera.html, finds every face, and sends back for each one
// where it is, how big it is and how far the head is turned. Nothing leaves this computer.

const MAX_FACES = 4;
// Face-mesh landmark numbers: nose tip, cheek edges, top of forehead, chin
const NOSE = 1, CHEEK_A = 234, CHEEK_B = 454, TOP = 10, CHIN = 152;

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
let ready = false;
let busy = false;
let frameTime = 0;

// One face → { x, y, size, yaw }
function describe(lm) {
  const W = canvas.width, H = canvas.height;
  const px = (i) => [lm[i].x * W, lm[i].y * H];
  const [ax] = px(CHEEK_A), [bx] = px(CHEEK_B), [nx] = px(NOSE);
  const left = Math.min(ax, bx), right = Math.max(ax, bx);
  // Where the nose sits between the cheeks: middle = facing the camera,
  // at a cheek = side face. Turned into rough degrees.
  const r = right - left > 1 ? (nx - left) / (right - left) : 0.5;
  const yaw = (Math.asin(Math.max(-1, Math.min(1, 2 * r - 1))) * 180) / Math.PI;
  // Size from forehead→chin (stays about the same when the head turns),
  // scaled to roughly "face width ÷ frame width"
  const [tx, ty] = px(TOP), [cx, cy] = px(CHIN);
  const size = Math.hypot(tx - cx, ty - cy) / 1.25 / W;
  return {
    x: (lm[TOP].x + lm[CHIN].x) / 2,
    y: (lm[TOP].y + lm[CHIN].y) / 2,
    size: +size.toFixed(3),
    yaw: Math.round(yaw)
  };
}

const faceMesh = new FaceMesh({ locateFile: (file) => "vendor/face_mesh/" + file });
faceMesh.setOptions({
  maxNumFaces: MAX_FACES,
  refineLandmarks: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
faceMesh.onResults((r) => {
  const faces = (r.multiFaceLandmarks || []).map(describe);
  parent.postMessage({ type: "faces", faces, t: frameTime }, "*");
});
faceMesh.initialize().then(
  () => { ready = true; parent.postMessage({ type: "ready" }, "*"); },
  (e) => parent.postMessage({ type: "error", message: String(e) }, "*")
);

addEventListener("message", async (e) => {
  if (e.source !== parent || !e.data || e.data.type !== "frame") return;
  const bitmap = e.data.bitmap;
  if (!ready || busy) {
    bitmap.close();
    parent.postMessage({ type: "skip" }, "*");
    return;
  }
  busy = true;
  frameTime = e.data.t;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  try {
    await faceMesh.send({ image: canvas });
  } catch (err) {
    parent.postMessage({ type: "error", message: String(err) }, "*");
  }
  busy = false;
});
