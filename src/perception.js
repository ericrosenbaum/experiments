// Camera understanding with MediaPipe, loaded only when a module asks for it.
// Hands, face and pose run on this person's own camera and travel to the
// others as numbers. Background removal ('cutout') runs here for every video
// we display, since WebRTC video carries no transparency.
//
// All coordinates are 0..1 across the picture and flipped left-to-right, to
// match the mirrored way the world draws every camera.
import { FilesetResolver, HandLandmarker, FaceLandmarker, PoseLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';

const BASE = 'https://storage.googleapis.com/mediapipe-models';
const MODELS = {
  hands: `${BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  face: `${BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  pose: `${BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  cutout: `${BASE}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`,
};
const INTERVAL_MS = 50;
const CUTOUT_WIDTH = 480;

let fileset = null;
const files = () => (fileset ??= FilesetResolver.forVisionTasks('/mp-wasm'));

const makers = {
  hands: async () => HandLandmarker.createFromOptions(await files(), { baseOptions: { modelAssetPath: MODELS.hands, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2 }),
  face: async () => FaceLandmarker.createFromOptions(await files(), { baseOptions: { modelAssetPath: MODELS.face, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1 }),
  pose: async () => PoseLandmarker.createFromOptions(await files(), { baseOptions: { modelAssetPath: MODELS.pose, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 }),
  cutout: async () => ImageSegmenter.createFromOptions(await files(), { baseOptions: { modelAssetPath: MODELS.cutout, delegate: 'GPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false }),
};

const r4 = (n) => Math.round(n * 10000) / 10000;
const ready = (v) => v && v.readyState >= 2 && v.videoWidth > 0;

export class Perception {
  // own: () => this person's <video>; videos: () => Map(id -> <video>) of everyone shown
  // onPercept({hands, face, pose}); onCutout(id, ImageBitmap); onProblem(text)
  constructor({ own, videos, onPercept, onCutout, onProblem }) {
    Object.assign(this, { own, videos, onPercept, onCutout, onProblem });
    this.needs = new Set();
    this.tasks = {}; // kind -> task | 'loading' | 'failed'
    this.running = false;
    this.mask = null;
    this.out = null;
  }

  setNeeds(list) {
    this.needs = new Set(list.filter((n) => n in makers));
    for (const kind of this.needs) this._ensure(kind);
    if (this.needs.size && !this.running) { this.running = true; this._loop(); }
  }

  _ensure(kind) {
    if (this.tasks[kind]) return;
    this.tasks[kind] = 'loading';
    makers[kind]().then((task) => { this.tasks[kind] = task; }, (err) => {
      this.tasks[kind] = 'failed';
      console.error('perception', kind, err);
      this.onProblem(`Could not load ${kind} tracking: ${err?.message ?? err}`);
    });
  }

  _task(kind) {
    const t = this.needs.has(kind) ? this.tasks[kind] : null;
    return t && typeof t === 'object' ? t : null;
  }

  async _loop() {
    while (this.needs.size) {
      const started = performance.now();
      try { this._step(started); } catch (err) { console.warn('perception step', err); }
      await new Promise((r) => setTimeout(r, Math.max(0, INTERVAL_MS - (performance.now() - started))));
    }
    this.running = false;
    this.onPercept({ hands: [], face: null, pose: null });
  }

  _step(ts) {
    const video = this.own();
    const out = { hands: [], face: null, pose: null };
    if (ready(video)) {
      const aspect = video.videoWidth / video.videoHeight;
      const hands = this._task('hands');
      if (hands) out.hands = hands.detectForVideo(video, ts).landmarks.map((pts) => ({ points: pts.map((p) => ({ x: r4(1 - p.x), y: r4(p.y) })) }));
      const face = this._task('face');
      if (face) { const l = face.detectForVideo(video, ts).faceLandmarks[0]; if (l) out.face = summariseFace(l, aspect); }
      const pose = this._task('pose');
      if (pose) { const l = pose.detectForVideo(video, ts).landmarks[0]; if (l) out.pose = l.map((p) => ({ x: r4(1 - p.x), y: r4(p.y), v: Math.round((p.visibility ?? 0) * 100) / 100 })); }
    }
    this.onPercept(out);

    const seg = this._task('cutout');
    if (seg) for (const [id, v] of this.videos()) if (ready(v)) this._cutout(seg, id, v);
  }

  _cutout(seg, id, video) {
    seg.segment(video, (result) => {
      const masks = result.confidenceMasks;
      const m = masks?.[masks.length - 1]; // the person, whether the model reports one channel or two
      if (!m) return;
      const { width: mw, height: mh } = m;
      const conf = m.getAsFloat32Array();
      if (!this.mask || this.mask.width !== mw || this.mask.height !== mh) {
        this.mask = new OffscreenCanvas(mw, mh);
        this.maskCtx = this.mask.getContext('2d');
        this.maskData = this.maskCtx.createImageData(mw, mh);
      }
      const px = this.maskData.data;
      for (let i = 0; i < conf.length; i++) {
        // soft edge between 0.35 and 0.65 confidence
        const a = (conf[i] - 0.35) / 0.3;
        px[i * 4 + 3] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255;
      }
      this.maskCtx.putImageData(this.maskData, 0, 0);
      const w = Math.min(CUTOUT_WIDTH, video.videoWidth);
      const h = Math.round(w * video.videoHeight / video.videoWidth);
      if (!this.out || this.out.width !== w || this.out.height !== h) { this.out = new OffscreenCanvas(w, h); this.outCtx = this.out.getContext('2d'); }
      const c = this.outCtx;
      c.globalCompositeOperation = 'copy';
      c.drawImage(this.mask, 0, 0, w, h);
      c.globalCompositeOperation = 'source-in';
      c.drawImage(video, 0, 0, w, h);
      this.onCutout(id, this.out.transferToImageBitmap());
    });
  }
}

// 478 face points are too many to send 20 times a second; keep the handful
// that glasses, hats, moustaches and mouth-triggered effects need.
function summariseFace(l, aspect) {
  const pt = (i) => ({ x: 1 - l[i].x, y: l[i].y });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const round = (p) => ({ x: r4(p.x), y: r4(p.y) });
  const eyes = [mid(pt(33), pt(133)), mid(pt(263), pt(362))].sort((a, b) => a.x - b.x);
  const edges = [pt(234), pt(454)].sort((a, b) => a.x - b.x);
  const forehead = pt(10);
  const chin = pt(152);
  const upper = pt(13);
  const lower = pt(14);
  return {
    leftEye: round(eyes[0]), rightEye: round(eyes[1]), nose: round(pt(1)), mouth: round(mid(upper, lower)),
    chin: round(chin), forehead: round(forehead), left: round(edges[0]), right: round(edges[1]),
    mouthOpen: Math.round(Math.min(1, (dist(upper, lower) / (dist(forehead, chin) || 1)) * 5) * 100) / 100,
    roll: r4(Math.atan2(eyes[1].y - eyes[0].y, (eyes[1].x - eyes[0].x) * aspect)),
  };
}
