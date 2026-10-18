// Decides when to turn the emergency ON from the faces the camera sees.
//
// Each check gets a list of faces: { x, y, size, yaw }  (x/y = face centre, size = face
// width, all as a fraction of the frame; yaw = degrees the head is turned,
// 0 = looking straight at the camera).
//
// Rules:
// - The biggest (closest) face is you, and stays you even if someone leans in closer.
//   Everyone else is "someone else".
// - Faces smaller than minSize are too far away to read the screen and are ignored.
// - Someone else is "looking" when their head is turned less than lookOn° toward the
//   camera. They stop looking only when they turn past lookOff°, so a head sitting
//   near the line can't flicker in and out.
// - When someone who isn't "OK" yet looks for holdMs, the emergency fires once and
//   everyone looking at that moment becomes OK. So a seatmate who doesn't care costs
//   you one ⌘X — but a different person walking up still fires, even while the
//   seatmate is there.
// - People already there when the camera starts (or a poster) are OK from the start.
// - Each OK person has a "spot" (where their face is, and how big). The spot follows
//   them while they sit and shift around (or keep looking), but NOT while they walk
//   off: if they walk out of their spot they stop being OK and the spot is dropped
//   straight away.
// - If an OK person's face is lost (turned away, hand in front) and a face of the same
//   size reappears in their spot within leaveMs, it's them again and still OK.
//   A face that walks INTO a spot from somewhere else is never OK — so a teacher who
//   walks up side-on to where the seatmate sat and then looks still fires.
// - Faces that vanish for a moment are kept for graceMs, and a face has to be seen
//   twice before it counts, so one bad frame doesn't do anything.
globalThis.FaceCountDetector = class FaceCountDetector {
  constructor(opts = {}) {
    this.minSize = opts.minSize ?? 0.08;   // face width ÷ frame width (~1.3 m away on a laptop)
    this.lookOn = opts.lookOn ?? 25;       // degrees: starts counting as looking
    this.lookOff = opts.lookOff ?? 40;     // degrees: stops counting as looking
    this.holdMs = opts.holdMs ?? 200;      // a new looker has to keep looking this long
    this.leaveMs = opts.leaveMs ?? 10000;  // lost OK face can come back to its spot within this
    this.graceMs = opts.graceMs ?? 600;    // keep a lost face this long
    this.warmupMs = opts.warmupMs ?? 1500; // learn who's already there when the camera starts
    this.walkSpeed = opts.walkSpeed ?? 2;  // face widths per second: faster = walking, not sitting
    this.tracks = [];   // faces we're following: { x, y, size, yaw, seen, hits, speed, looking, ok, spot }
    this.spots = [];    // where OK people are: { x, y, size, seen, owner }
    this.me = null;     // the track that is you
    this.startedAt = null;
    this.aboveSince = null;
    this.last = { people: 0, looking: 0, normal: 0 };
  }

  _near(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < Math.max(a.size, b.size) * 1.2;
  }

  // Is this face in this spot? (close to it AND about the same size, so someone
  // standing where a seated person was doesn't match)
  _inSpot(s, f) {
    const ratio = f.size / s.size;
    return Math.hypot(s.x - f.x, s.y - f.y) < s.size && ratio > 0.7 && ratio < 1.4;
  }

  // Match this frame's faces to the faces we were already following
  _track(faces, t) {
    const near = faces.filter((f) => f.size >= this.minSize * 0.8); // a bit lenient, so faces don't drop out at the edge
    const free = this.tracks.slice();
    for (const f of near.sort((a, b) => b.size - a.size)) {
      let best = null, bestD = Infinity;
      for (const tr of free) {
        const d = Math.hypot(tr.x - f.x, tr.y - f.y);
        if (this._near(tr, f) && d < bestD) { best = tr; bestD = d; }
      }
      if (best) {
        free.splice(free.indexOf(best), 1);
        const secs = Math.max(0.05, (t - best.seen) / 1000);
        const v = bestD / secs / Math.max(best.size, f.size); // face widths per second
        best.speed = best.speed * 0.5 + v * 0.5;
        Object.assign(best, { x: f.x, y: f.y, size: f.size, yaw: f.yaw, seen: t });
        best.hits++;
      } else {
        const tr = { x: f.x, y: f.y, size: f.size, yaw: f.yaw, seen: t, hits: 1, speed: 0, looking: false, ok: false, spot: null };
        // A face that APPEARS in an OK person's spot (their face was lost) is them again
        const spot = this.spots.find((s) => !this.tracks.includes(s.owner) && this._inSpot(s, f));
        if (spot) { tr.ok = true; tr.spot = spot; spot.owner = tr; spot.seen = t; }
        this.tracks.push(tr);
      }
    }
    this.tracks = this.tracks.filter((tr) => t - tr.seen <= this.graceMs);
    for (const tr of this.tracks) {
      if (tr.seen !== t) continue; // not seen this frame: keep its last state
      const a = Math.abs(tr.yaw);
      if (!tr.looking && a < this.lookOn && tr.size >= this.minSize) tr.looking = true;
      else if (tr.looking && (a > this.lookOff || tr.size < this.minSize * 0.8)) tr.looking = false;
    }
  }

  _makeOk(tr, t) {
    tr.ok = true;
    if (tr.spot) return;
    tr.spot = { x: tr.x, y: tr.y, size: tr.size, seen: t, owner: tr };
    this.spots.push(tr.spot);
  }

  // faces: array (empty = nobody). t: time in ms. Returns true when the emergency should fire.
  update(faces, t) {
    if (this.startedAt == null) this.startedAt = t;
    this._track(faces || [], t);

    // You = the biggest face when we first see you; kept until your face is really gone
    if (!this.tracks.includes(this.me)) this.me = this.tracks.slice().sort((a, b) => b.size - a.size)[0] || null;
    const others = this.tracks.filter((tr) => tr !== this.me);

    // OK people: the spot follows them while they sit; walking out of it = they left
    for (const tr of others) {
      if (!tr.ok || !tr.spot || tr.seen !== t) continue;
      const s = tr.spot;
      // Follows them while they sit, or while they keep looking (already fired for them)
      if ((tr.speed < this.walkSpeed && this._inSpot(s, tr)) || tr.looking) {
        Object.assign(s, { x: tr.x, y: tr.y, size: tr.size, seen: t });
      } else if (!this._inSpot(s, tr)) {
        tr.ok = false; tr.spot = null;
        this.spots = this.spots.filter((x) => x !== s);
      } else {
        s.seen = t; // moving fast but still in the spot: keep it, don't move it
      }
    }
    this.spots = this.spots.filter((s) => t - s.seen <= this.leaveMs);
    for (const tr of others) if (tr.spot && !this.spots.includes(tr.spot)) { tr.ok = false; tr.spot = null; }

    const looking = others.filter((tr) => tr.looking && tr.hits >= 2);
    const strangers = looking.filter((tr) => !tr.ok);

    let fire = false;
    if (t - this.startedAt < this.warmupMs) {
      for (const tr of looking) this._makeOk(tr, t); // poster / someone already there
    } else if (strangers.length > 0) {
      if (this.aboveSince == null) this.aboveSince = t;
      if (t - this.aboveSince >= this.holdMs) {
        fire = true;
        for (const tr of looking) this._makeOk(tr, t);
        this.aboveSince = null;
      }
    } else {
      this.aboveSince = null;
    }

    // people = other faces seen, looking = of those, looking at the screen,
    // normal = how many people are OK right now (shown in the popup)
    this.last = { people: others.length, looking: looking.length, normal: this.spots.length };
    return fire;
  }
};
