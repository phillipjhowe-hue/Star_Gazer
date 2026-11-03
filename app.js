/* Star Gazer — a sky viewer for any place and time.
 * Positions: Astronomy Engine (MIT, Don Cross). Star catalog & constellation lines: d3-celestial (BSD-3, Olaf Frohn).
 */
(() => {
  "use strict";
  const A = window.Astronomy;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const $ = (id) => document.getElementById(id);

  // ---------- persistent settings ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sg." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sg." + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  // ---------- state ----------
  const savedLoc = store.get("loc", null);
  const state = {
    lat: savedLoc ? savedLoc.lat : 40.7128,
    lon: savedLoc ? savedLoc.lon : -74.006,
    place: savedLoc ? savedLoc.place : "—",
    time: Date.now(),
    live: true,          // follow the real clock
    playing: false,
    speed: 600,
    viewAz: 180, viewAlt: 22, fov: 100,
    opts: Object.assign({ lines: true, conNames: true, starNames: true, ground: true, daylight: true, grid: false, red: false, milkyway: true, twinkle: true, landscape: true },
      store.get("opts", {})),
    selected: null,
    compass: false,
  };

  // ---------- catalog preparation ----------
  const NS = STARS.length;
  const starEq = new Float64Array(NS * 3);   // J2000 unit vectors
  const starHor = new Float64Array(NS * 3);  // horizontal unit vectors (x north, y west, z up)
  STARS.forEach((s, i) => {
    const ra = s[0] * D2R, dec = s[1] * D2R;
    starEq[i * 3] = Math.cos(dec) * Math.cos(ra);
    starEq[i * 3 + 1] = Math.cos(dec) * Math.sin(ra);
    starEq[i * 3 + 2] = Math.sin(dec);
  });
  const NMW = MILKY_WAY.length;
  const mwEq = new Float64Array(NMW * 3), mwHor = new Float64Array(NMW * 3);
  MILKY_WAY.forEach((m, i) => { const v = radec2vec(m[0], m[1]); mwEq.set(v, i * 3); });
  const twPhase = new Float32Array(NS).map(() => Math.random() * 6.283);
  const twFreq = new Float32Array(NS).map(() => 2 + Math.random() * 4);
  const conById = {};
  CONSTELLATIONS.forEach((c) => { conById[c.id] = c; c.eq = radec2vec(c.ra, c.dec); });
  // constellation line vertices
  const lineSets = []; // {id, segs: [[eqVec,...]]}
  for (const id in CON_LINES) {
    lineSets.push({ id, segs: CON_LINES[id].map((seg) => seg.map(([ra, dec]) => ({ eq: radec2vec(ra, dec), h: [0, 0, 0] }))) });
  }
  const boundSets = {};
  for (const id in CON_BOUNDS) boundSets[id] = CON_BOUNDS[id].map((ring) => ring.map(([ra, dec]) => ({ eq: radec2vec(ra, dec), h: [0, 0, 0] })));
  // which constellation each named star belongs to (by designation suffix)
  function starConName(s) { const c = s[5] && s[5].split(" ")[1]; return c && conById[c] ? conById[c].name : ""; }

  const BODIES = [
    { name: "Sun", color: "#ffd75e" },
    { name: "Moon", color: "#e9e6dc" },
    { name: "Mercury", color: "#cdbba8" },
    { name: "Venus", color: "#fff3cf" },
    { name: "Mars", color: "#ff7b4f" },
    { name: "Jupiter", color: "#f5dcb3" },
    { name: "Saturn", color: "#ead08e" },
    { name: "Uranus", color: "#a8e6ec" },
    { name: "Neptune", color: "#86a3ff" },
  ];
  const bodyByName = {}; BODIES.forEach((b) => { bodyByName[b.name] = b; b.h = [0, 0, 1]; });

  function radec2vec(raDeg, decDeg) {
    const ra = raDeg * D2R, dec = decDeg * D2R;
    return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  }

  // ---------- astronomy ----------
  let rot = null, observer = null, astroTime = null, sunAlt = -90, limMag = 6.2;
  function rotate(m, x, y, z, out, o) {
    out[o] = m[0][0] * x + m[1][0] * y + m[2][0] * z;
    out[o + 1] = m[0][1] * x + m[1][1] * y + m[2][1] * z;
    out[o + 2] = m[0][2] * x + m[1][2] * y + m[2][2] * z;
  }
  function recompute() {
    observer = new A.Observer(state.lat, state.lon, 0);
    astroTime = A.MakeTime(new Date(state.time));
    rot = A.Rotation_EQJ_HOR(astroTime, observer).rot;
    for (let i = 0; i < NS; i++) rotate(rot, starEq[i * 3], starEq[i * 3 + 1], starEq[i * 3 + 2], starHor, i * 3);
    for (const ls of lineSets) for (const seg of ls.segs) for (const p of seg) rotate(rot, p.eq[0], p.eq[1], p.eq[2], p.h, 0);
    for (const c of CONSTELLATIONS) { c.h = [0, 0, 0]; rotate(rot, c.eq[0], c.eq[1], c.eq[2], c.h, 0); }
    for (let i = 0; i < NMW; i++) rotate(rot, mwEq[i * 3], mwEq[i * 3 + 1], mwEq[i * 3 + 2], mwHor, i * 3);
    for (const id in boundSets) for (const ring of boundSets[id]) for (const p of ring) rotate(rot, p.eq[0], p.eq[1], p.eq[2], p.h, 0);
    for (const b of BODIES) {
      const eq = A.Equator(b.name, astroTime, observer, false, true);
      const v = eq.vec, n = Math.hypot(v.x, v.y, v.z);
      rotate(rot, v.x / n, v.y / n, v.z / n, b.h, 0);
      b.dist = eq.dist;
      b.ra = eq.ra; b.dec = eq.dec;
      const eqd = A.Equator(b.name, astroTime, observer, true, true);
      const hz = A.Horizon(astroTime, observer, eqd.ra, eqd.dec, "normal");
      b.alt = hz.altitude; b.az = hz.azimuth;
      try { const il = A.Illumination(b.name, astroTime); b.mag = il.mag; b.phase = il.phase_fraction; b.phaseAngle = il.phase_angle; }
      catch (e) { b.mag = -26.7; }
    }
    sunAlt = bodyByName.Sun.alt;
    limMag = state.opts.daylight ? limitingMag(sunAlt) : 6.5;
    lastComputed = state.time;
    uiDirty = true;
  }
  function limitingMag(s) {
    // naked-eye limiting magnitude vs. solar altitude (rough, dark-site)
    const pts = [[-90, 6.2], [-18, 6.2], [-12, 4.2], [-9, 3.0], [-6, 1.6], [-3, 0.2], [0, -2.0], [5, -3.2]];
    if (s >= 5) return -3.2;
    for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) {
      const [a0, m0] = pts[i - 1], [a1, m1] = pts[i];
      return m0 + (m1 - m0) * (s - a0) / (a1 - a0);
    }
    return -3.2;
  }
  const hAlt = (h) => Math.asin(Math.max(-1, Math.min(1, h[2]))) * R2D;
  const hAz = (h) => ((Math.atan2(-h[1], h[0]) * R2D) + 360) % 360;
  function dirVec(az, alt) {
    const a = az * D2R, e = alt * D2R;
    return [Math.cos(e) * Math.cos(a), -Math.cos(e) * Math.sin(a), Math.sin(e)];
  }

  // ---------- canvas & projection ----------
  const cv = $("sky"), ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1, Rs = 1, F = [1, 0, 0], RT = [0, -1, 0], UP = [0, 0, 1];
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  function setupCamera() {
    state.viewAlt = Math.max(-89.9, Math.min(89.9, state.viewAlt));
    state.viewAz = ((state.viewAz % 360) + 360) % 360;
    state.fov = Math.max(5, Math.min(160, state.fov));
    F = dirVec(state.viewAz, state.viewAlt);
    RT = dirVec(state.viewAz + 90, 0);
    UP = dirVec(state.viewAz, state.viewAlt + 90);
    Rs = (Math.max(W, H) / 2) / Math.tan(state.fov * D2R / 4);
  }
  // returns [x, y, d] or null if too far behind
  function proj(x, y, z, minD = -0.5) {
    const d = x * F[0] + y * F[1] + z * F[2];
    if (d < minD) return null;
    const k = Rs / (1 + d);
    return [W / 2 + k * (x * RT[0] + y * RT[1] + z * RT[2]), H / 2 - k * (x * UP[0] + y * UP[1] + z * UP[2]), d];
  }
  const projV = (v, m) => proj(v[0], v[1], v[2], m);
  const onScreen = (p, m = 40) => p && p[0] > -m && p[0] < W + m && p[1] > -m && p[1] < H + m;

  // ---------- colors ----------
  function bvColor(bv) {
    const t = [[-0.4, [155, 176, 255]], [0, [202, 215, 255]], [0.3, [248, 247, 255]], [0.6, [255, 244, 234]],
      [0.9, [255, 230, 200]], [1.2, [255, 210, 161]], [1.6, [255, 190, 130]], [2.0, [255, 170, 110]]];
    if (bv <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) if (bv <= t[i][0]) {
      const f = (bv - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1].map((c, j) => Math.round(c + (t[i][1][j] - c) * f));
    }
    return t[t.length - 1][1];
  }
  const starRGB = STARS.map((s) => bvColor(s[3]).join(","));
  function mix(a, b, f) { return a.map((v, i) => Math.round(v + (b[i] - v) * f)); }
  function skyColors(s) {
    if (!state.opts.daylight) return [[3, 5, 14], [10, 16, 36]];
    const stops = [
      [-18, [3, 5, 14], [10, 16, 36]],
      [-12, [6, 10, 28], [22, 32, 70]],
      [-6, [16, 26, 66], [70, 72, 120]],
      [-2, [40, 62, 120], [210, 130, 90]],
      [3, [70, 120, 190], [190, 190, 200]],
      [15, [60, 120, 210], [150, 190, 235]],
    ];
    if (s <= stops[0][0]) return [stops[0][1], stops[0][2]];
    for (let i = 1; i < stops.length; i++) if (s <= stops[i][0]) {
      const f = (s - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return [mix(stops[i - 1][1], stops[i][1], f), mix(stops[i - 1][2], stops[i][2], f)];
    }
    return [stops[stops.length - 1][1], stops[stops.length - 1][2]];
  }
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // ---------- drawing ----------
  let hits = [];
  const CARD = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const compassName = (az) => CARD[Math.round(az / 45) % 8];

  let clock = 0;
  function nightFactor() { return state.opts.daylight ? Math.max(0, Math.min(1, (-sunAlt - 4) / 12)) : 1; }
  function draw() {
    setupCamera();
    hits = [];
    clock = performance.now() / 1000;
    const night = !state.opts.daylight || sunAlt < -6;
    drawSky();
    if (state.opts.milkyway) drawMilkyWay();
    if (state.opts.grid) drawGrid();
    if (state.opts.lines) drawLines(night);
    drawStars();
    drawBodies();
    if (state.opts.conNames) drawConNames(night);
    if (state.opts.ground) drawGround();
    drawHorizon();
    drawSelection();
    if (noisePattern) { ctx.globalAlpha = 0.035; ctx.fillStyle = noisePattern; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  // ---------- sky background ----------
  let noisePattern = null;
  (function makeNoise() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), im = g.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); noisePattern = ctx.createPattern(c, "repeat");
  })();
  function drawSky() {
    const [top, hor] = skyColors(sunAlt);
    const hz = projV(dirVec(state.viewAz, 0), -0.99);
    const zen = projV([0, 0, 1], -0.99);
    let g;
    if (hz && zen && Math.hypot(hz[0] - zen[0], hz[1] - zen[1]) > 1) {
      g = ctx.createLinearGradient(zen[0], zen[1], hz[0], hz[1]);
      g.addColorStop(0, rgb(top)); g.addColorStop(0.75, rgb(mix(top, hor, 0.55))); g.addColorStop(1, rgb(hor));
    } else { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(hor)); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const pxPerDeg = Rs * D2R / 2;
    // twilight glow toward the Sun
    if (state.opts.daylight && sunAlt > -18 && sunAlt < 12) {
      const sp = projV(dirVec(bodyByName.Sun.az, Math.max(sunAlt, -2)), -0.9);
      if (sp) {
        const k = sunAlt < -6 ? (sunAlt + 18) / 12 * 0.35 : sunAlt < 2 ? 0.35 + (sunAlt + 6) / 8 * 0.4 : 0.75 - (sunAlt - 2) / 10 * 0.6;
        const rad = 75 * pxPerDeg;
        const gl = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], rad);
        gl.addColorStop(0, `rgba(255,170,90,${k})`); gl.addColorStop(0.35, `rgba(255,120,80,${k * 0.45})`); gl.addColorStop(1, "rgba(255,120,80,0)");
        ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
      }
    }
    // faint airglow near the horizon at night
    const nf = nightFactor();
    if (nf > 0 && hz && zen) {
      const p15 = projV(dirVec(state.viewAz, 18), -0.99);
      if (p15) {
        const ag = ctx.createLinearGradient(p15[0], p15[1], hz[0], hz[1]);
        ag.addColorStop(0, "rgba(60,90,120,0)"); ag.addColorStop(1, `rgba(70,110,130,${0.22 * nf})`);
        ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);
      }
    }
  }

  // ---------- Milky Way (rendered to a small offscreen canvas, then scaled up for softness) ----------
  const mwCanvas = document.createElement("canvas"), mwCtx = mwCanvas.getContext("2d");
  const mwSprite = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d");
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(215,225,255,1)"); gr.addColorStop(0.5, "rgba(190,205,255,0.45)"); gr.addColorStop(1, "rgba(180,200,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c;
  })();
  function drawMilkyWay() {
    const nf = state.opts.daylight ? Math.max(0, Math.min(1, (-sunAlt - 12) / 5)) : 1;
    const moon = bodyByName.Moon, moonUp = moon.alt > 0 ? (moon.phase || 0) * Math.min(1, moon.alt / 20) : 0;
    const vis = nf * (1 - 0.65 * moonUp);
    if (vis < 0.03) return;
    const S = 4, w = Math.ceil(W / S), h = Math.ceil(H / S);
    if (mwCanvas.width !== w || mwCanvas.height !== h) { mwCanvas.width = w; mwCanvas.height = h; }
    mwCtx.clearRect(0, 0, w, h);
    mwCtx.globalCompositeOperation = "lighter";
    const size = Math.max(2, 2.4 * Rs * D2R / 2 / S);
    for (let i = 0; i < NMW; i++) {
      const z = mwHor[i * 3 + 2];
      if (state.opts.ground && z < -0.03) continue;
      const p = proj(mwHor[i * 3], mwHor[i * 3 + 1], z, -0.2);
      if (!onScreen(p, size * S)) continue;
      const ext = z < 0.35 ? 0.35 + 0.65 * Math.max(0, z) / 0.35 : 1;
      mwCtx.globalAlpha = Math.pow(MILKY_WAY[i][2], 1.3) * 0.075 * ext;
      mwCtx.drawImage(mwSprite, p[0] / S - size, p[1] / S - size, size * 2, size * 2);
    }
    mwCtx.globalCompositeOperation = "source-over"; mwCtx.globalAlpha = 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, vis);
    ctx.globalCompositeOperation = "screen";
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mwCanvas, 0, 0, w * S, h * S);
    ctx.restore();
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(140,170,255,0.14)"; ctx.lineWidth = 1;
    for (let alt = 15; alt < 90; alt += 15) polyline((t) => dirVec(t, alt), 0, 360, 3);
    for (let az = 0; az < 360; az += 30) polyline((t) => dirVec(az, t), state.opts.ground ? 0 : -90, 90, 3);
  }
  function polyline(fn, a, b, step) {
    ctx.beginPath(); let pen = false;
    for (let t = a; t <= b + 1e-9; t += step) {
      const p = projV(fn(t), -0.3);
      if (!p) { pen = false; continue; }
      if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      pen = true;
    }
    ctx.stroke();
  }

  function drawLines(night) {
    const selId = state.selected && state.selected.kind === "con" ? state.selected.id : null;
    const gap = 5;
    const base = night ? "rgba(125,155,255,0.32)" : "rgba(255,255,255,0.3)";
    ctx.lineCap = "round";
    for (const ls of lineSets) {
      const sel = ls.id === selId;
      const path = new Path2D();
      for (const seg of ls.segs) {
        let prev = null;
        for (const p of seg) {
          const q = projV(p.h, -0.2);
          if (q && prev) {
            const dx = q[0] - prev[0], dy = q[1] - prev[1], L = Math.hypot(dx, dy);
            if (L > gap * 2.5) {
              const ux = dx / L * gap, uy = dy / L * gap;
              path.moveTo(prev[0] + ux, prev[1] + uy); path.lineTo(q[0] - ux, q[1] - uy);
            }
          }
          prev = q;
        }
      }
      if (sel) {
        ctx.strokeStyle = "rgba(255,207,110,0.25)"; ctx.lineWidth = 7; ctx.stroke(path);
        ctx.strokeStyle = "rgba(255,215,130,0.95)"; ctx.lineWidth = 2; ctx.stroke(path);
      } else {
        ctx.strokeStyle = base; ctx.lineWidth = 1.1; ctx.stroke(path);
      }
    }
    if (selId && boundSets[selId]) drawBounds(selId);
  }
  function drawBounds(id) {
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "rgba(255,207,110,0.55)"; ctx.lineWidth = 1;
    const fill = new Path2D();
    ctx.beginPath();
    for (const ring of boundSets[id]) {
      let pen = false, prev = null;
      for (const p of ring) {
        const q = projV(p.h, -0.3);
        if (!q || (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) > Math.max(W, H))) { pen = false; prev = q; continue; }
        if (pen) { ctx.lineTo(q[0], q[1]); fill.lineTo(q[0], q[1]); } else { ctx.moveTo(q[0], q[1]); fill.moveTo(q[0], q[1]); }
        pen = true; prev = q;
      }
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,207,110,0.06)"; ctx.fill(fill, "evenodd");
    ctx.restore();
  }

  // pre-rendered star sprites by colour: soft halo + bright core; brightest stars get faint spikes
  const BV_BINS = [-0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.6];
  const binOf = (bv) => { let b = 0; for (let i = 0; i < BV_BINS.length; i++) if (bv >= BV_BINS[i] - 0.15) b = i; return b; };
  const starBin = STARS.map((s) => binOf(s[3]));
  function makeSprite(c, spikes) {
    const N = 64, cv2 = document.createElement("canvas"); cv2.width = cv2.height = N; const g = cv2.getContext("2d");
    const m = N / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.08, `rgba(${c},1)`);
    gr.addColorStop(0.2, `rgba(${c},0.45)`);
    gr.addColorStop(0.45, `rgba(${c},0.1)`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    if (spikes) {
      g.globalCompositeOperation = "lighter";
      for (const [w, h] of [[N, 1.6], [1.6, N]]) {
        const lg = w > h ? g.createLinearGradient(0, 0, N, 0) : g.createLinearGradient(0, 0, 0, N);
        lg.addColorStop(0, `rgba(${c},0)`); lg.addColorStop(0.5, `rgba(${c},0.55)`); lg.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = lg; g.fillRect(m - w / 2, m - h / 2, w, h);
      }
    }
    return cv2;
  }
  const sprites = BV_BINS.map((bv) => makeSprite(bvColor(bv).join(","), false));
  const spikeSprites = BV_BINS.map((bv) => makeSprite(bvColor(bv).join(","), true));

  function starRadius(mag) {
    const zf = Math.max(0.85, Math.min(2.2, Math.pow(90 / state.fov, 0.4)));
    return Math.max(0.5, Math.min(6.5, 0.65 + (Math.min(limMag, 6.5) + 1 - mag) * 0.55)) * zf;
  }
  function drawStars() {
    const lim = limMag + Math.max(0, Math.log2(90 / state.fov)) * 0.6; // zooming in reveals a bit more
    const labelLim = state.fov > 110 ? 1.0 : state.fov > 70 ? 1.8 : state.fov > 35 ? 2.7 : 4.5;
    const groundOn = state.opts.ground;
    const tw = state.opts.twinkle ? nightFactor() : 0;
    ctx.font = "11px system-ui, sans-serif";
    const labels = [];
    for (let i = 0; i < NS; i++) {
      const s = STARS[i];
      if (s[2] > lim) break; // sorted by magnitude
      const z = starHor[i * 3 + 2];
      if (groundOn && z < -0.002) continue;
      const p = proj(starHor[i * 3], starHor[i * 3 + 1], z, -0.3);
      if (!onScreen(p, 10)) continue;
      // atmospheric extinction near horizon
      const alt = Math.asin(z) * R2D;
      const ext = alt < 15 ? (15 - Math.max(alt, 0)) / 15 * 1.2 : 0;
      const m = s[2] + ext;
      if (m > lim + 0.3) continue;
      const r = starRadius(m);
      let a = Math.max(0.2, Math.min(1, (lim - m) / 1.6 + 0.4));
      if (tw) { // scintillation: stronger near the horizon
        const amt = tw * (0.12 + 0.3 * Math.max(0, 1 - alt / 40));
        a *= 1 - amt * (0.5 + 0.5 * Math.sin(clock * twFreq[i] + twPhase[i]));
      }
      if (r < 1.1) {
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${starRGB[i]})`;
        ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      } else {
        const big = m < 0.8;
        const S = r * (big ? 7 : 5);
        ctx.globalAlpha = a;
        ctx.drawImage(big ? spikeSprites[starBin[i]] : sprites[starBin[i]], p[0] - S / 2, p[1] - S / 2, S, S);
      }
      hits.push({ x: p[0], y: p[1], r: Math.max(r + 4, 9), sel: { kind: "star", i }, pri: 6 - s[2] });
      if (state.opts.starNames && s[4] && s[2] < labelLim) labels.push([s[4], p[0] + r + 5, p[1] + 4]);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(225,230,255,0.78)";
    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
    for (const [t, x, y] of labels) ctx.fillText(t, x, y);
    ctx.shadowBlur = 0;
  }

  function drawBodies() {
    const sun = bodyByName.Sun;
    for (const b of BODIES) {
      if (state.opts.ground && b.h[2] < -0.005) continue;
      const p = projV(b.h, -0.3);
      if (!onScreen(p, 60)) continue;
      const pxPerDeg = Rs * D2R / 2;
      let r;
      if (b.name === "Sun" || b.name === "Moon") {
        const semiDeg = b.name === "Sun" ? 0.267 : Math.atan(1737.4 / (b.dist * 1.4959787e8)) * R2D;
        r = Math.max(7, semiDeg * pxPerDeg);
      } else {
        r = Math.max(1.6, Math.min(5, 2.2 + (1 - b.mag) * 0.6)) * Math.max(1, Math.pow(90 / state.fov, 0.25));
      }
      const faint = b.mag > limMag && b.name !== "Moon" && b.name !== "Sun";
      if (b.name === "Sun") {
        const gl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 5);
        gl.addColorStop(0, "rgba(255,240,180,0.9)"); gl.addColorStop(1, "rgba(255,220,120,0)");
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p[0], p[1], r * 5, 0, 7); ctx.fill();
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
      } else if (b.name === "Moon") {
        drawMoon(p, r, b, sun);
      } else {
        ctx.globalAlpha = faint ? 0.45 : 1;
        if (!faint && b.mag < 0) {
          const gl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 4);
          gl.addColorStop(0, "rgba(255,250,230,0.35)"); gl.addColorStop(1, "rgba(255,250,230,0)");
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p[0], p[1], r * 4, 0, 7); ctx.fill();
        }
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = faint ? "rgba(255,207,110,0.5)" : "rgba(255,207,110,0.95)";
      ctx.fillText(b.name, p[0] + r + 5, p[1] - r / 2 - 2);
      hits.push({ x: p[0], y: p[1], r: r + 6, sel: { kind: "body", name: b.name }, pri: 100 });
    }
  }
  function drawMoon(p, r, b, sun) {
    // direction toward the Sun on screen
    const e = 0.02;
    const t = [b.h[0] + (sun.h[0] - b.h[0]) * e, b.h[1] + (sun.h[1] - b.h[1]) * e, b.h[2] + (sun.h[2] - b.h[2]) * e];
    const q = projV(t, -0.99);
    const ang = q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
    const k = b.phase == null ? 0.5 : b.phase;
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 4);
    gl.addColorStop(0, `rgba(240,240,225,${0.25 * k})`); gl.addColorStop(1, "rgba(240,240,225,0)");
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, r * 4, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(60,62,70,0.9)"; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    const ex = r * (1 - 2 * k);
    ctx.fillStyle = "#f1eee2";
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, Math.abs(ex), r, 0, Math.PI / 2, -Math.PI / 2, ex > 0);
    ctx.fill();
    ctx.restore();
  }

  function drawConNames(night) {
    ctx.textAlign = "center";
    const selId = state.selected && state.selected.kind === "con" ? state.selected.id : null;
    for (const c of CONSTELLATIONS) {
      const sel = c.id === selId;
      if (state.fov > 110 && c.rank > 1 && !sel) continue;
      if (state.opts.ground && c.h[2] < 0.01) continue;
      const p = projV(c.h, -0.2);
      if (!onScreen(p, 0)) continue;
      ctx.font = sel ? "600 13px Georgia, serif" : "italic 11.5px Georgia, serif";
      ctx.fillStyle = sel ? "rgba(255,215,130,1)" : night ? "rgba(160,180,255,0.62)" : "rgba(255,255,255,0.65)";
      ctx.fillText(c.name.toUpperCase().split("").join("\u200a"), p[0], p[1]);
    }
    ctx.textAlign = "left";
  }

  function circleFrom3(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-6) return null;
    const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
    const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return [ux, uy, Math.hypot(a[0] - ux, a[1] - uy)];
  }
  function groundPath() {
    const p1 = projV(dirVec(state.viewAz, 0), -0.999);
    const p2 = projV(dirVec(state.viewAz + 90, 0), -0.999);
    const p3 = projV(dirVec(state.viewAz - 90, 0), -0.999);
    const t = projV(dirVec(state.viewAz, -5), -0.999);
    const circ = p1 && p2 && p3 ? circleFrom3(p1, p2, p3) : null;
    const path = new Path2D();
    if (circ && circ[2] < 1e7) {
      const inside = t && Math.hypot(t[0] - circ[0], t[1] - circ[1]) < circ[2];
      path.arc(circ[0], circ[1], circ[2], 0, Math.PI * 2);
      if (!inside) { path.rect(-10, -10, W + 20, H + 20); }
      return { path, rule: "evenodd", circ };
    }
    // straight horizon: half-plane through p2,p3 containing t
    const dx = p3[0] - p2[0], dy = p3[1] - p2[1], L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    if (t && (t[0] - p2[0]) * nx + (t[1] - p2[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const B = 1e5, ux = dx / L * B, uy = dy / L * B;
    path.moveTo(p2[0] - ux, p2[1] - uy); path.lineTo(p2[0] + ux, p2[1] + uy);
    path.lineTo(p2[0] + ux + nx * B, p2[1] + uy + ny * B); path.lineTo(p2[0] - ux + nx * B, p2[1] - uy + ny * B);
    path.closePath();
    return { path, rule: "nonzero", line: [p2, p3] };
  }
  function drawGround() {
    const gp = groundPath();
    const day = state.opts.daylight ? Math.max(0, Math.min(1, (sunAlt + 8) / 14)) : 0;
    const groundCol = mix([7, 10, 9], [40, 50, 36], day);
    ctx.fillStyle = rgb(groundCol, 0.98);
    ctx.fill(gp.path, gp.rule);
    if (state.opts.landscape) drawLandscape(groundCol);
  }
  // procedural skyline: rolling hills with a ragged tree line (altitude in degrees by azimuth)
  function skyline(az) {
    const a = az * D2R;
    let h = 1.1 + 0.9 * Math.sin(a * 2 + 1.3) + 0.6 * Math.sin(a * 5 + 0.4) + 0.35 * Math.sin(a * 11 + 2.1);
    const t = Math.sin(a * 37) * Math.sin(a * 23 + 1) + 0.6 * Math.sin(a * 71 + 0.7);
    if (Math.sin(a * 3 + 0.5) > -0.2) h += Math.max(0, t) * 0.9; // tree clumps
    return Math.max(0.15, h);
  }
  function drawLandscape(col) {
    const step = state.fov < 40 ? 0.25 : 0.75;
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        ctx.beginPath();
        run.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
        for (let k = run.length - 1; k >= 0; k--) { const b = projV(dirVec(run[k][2], -3), -0.9); if (b) ctx.lineTo(b[0], b[1]); }
        ctx.closePath(); ctx.fill();
      }
      run = [];
    };
    ctx.fillStyle = rgb(col, 1);
    for (let az = 0; az <= 360 + 1e-9; az += step) {
      const q = projV(dirVec(az, skyline(az)), -0.6);
      if (!q) { flush(); continue; }
      q[2] = az; run.push(q);
    }
    flush();
  }
  function drawHorizon() {
    if (!state.opts.landscape || !state.opts.ground) {
      ctx.strokeStyle = "rgba(255,207,110,0.55)"; ctx.lineWidth = 1.2;
      polyline((t) => dirVec(t, 0), 0, 360, 2);
    }
    ctx.font = "700 14px system-ui, sans-serif"; ctx.textAlign = "center";
    for (let i = 0; i < 8; i++) {
      const p = projV(dirVec(i * 45, 0), 0);
      if (!onScreen(p, 0)) continue;
      ctx.fillStyle = i === 0 ? "#ff8a7a" : i % 2 ? "rgba(255,207,110,0.6)" : "rgba(255,207,110,0.95)";
      ctx.font = i % 2 ? "600 11px system-ui, sans-serif" : "700 15px system-ui, sans-serif";
      ctx.fillText(CARD[i], p[0], p[1] + 22);
    }
    const zp = projV([0, 0, 1], 0);
    if (onScreen(zp, 0)) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "11px system-ui"; ctx.fillText("+ zenith", zp[0], zp[1] + 4); }
    ctx.textAlign = "left";
  }
  function selVec(sel) {
    if (!sel) return null;
    if (sel.kind === "star") return [starHor[sel.i * 3], starHor[sel.i * 3 + 1], starHor[sel.i * 3 + 2]];
    if (sel.kind === "body") return bodyByName[sel.name].h;
    if (sel.kind === "con") return conById[sel.id].h;
    return null;
  }
  function drawSelection() {
    const v = selVec(state.selected);
    if (!v || state.selected.kind === "con") return;
    if (state.opts.ground && v[2] < -0.005) return;
    const p = projV(v, -0.3);
    if (!onScreen(p, 0)) return;
    ctx.strokeStyle = "rgba(255,207,110,0.95)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p[0], p[1], 14, 0, 7); ctx.stroke();
  }

  // ---------- facing indicator ----------
  function updateFacing() {
    $("facingLabel").textContent = `Facing ${compassName(state.viewAz)} ${Math.round(state.viewAz)}° · ` +
      `looking ${state.viewAlt >= 0 ? "up" : "down"} ${Math.abs(Math.round(state.viewAlt))}° · ${Math.round(state.fov)}° wide`;
  }

  // ---------- smooth pointing ----------
  let anim = null;
  function pointTo(az, alt, fov) {
    let dAz = ((az - state.viewAz + 540) % 360) - 180;
    anim = { t0: performance.now(), az0: state.viewAz, dAz, alt0: state.viewAlt, alt1: Math.max(-30, Math.min(89, alt)),
      fov0: state.fov, fov1: fov || state.fov };
  }
  function stepAnim(now) {
    if (!anim) return;
    const f = Math.min(1, (now - anim.t0) / 700), e = 1 - Math.pow(1 - f, 3);
    state.viewAz = anim.az0 + anim.dAz * e;
    state.viewAlt = anim.alt0 + (anim.alt1 - anim.alt0) * e;
    state.fov = anim.fov0 + (anim.fov1 - anim.fov0) * e;
    if (f >= 1) anim = null;
  }

  // ---------- interaction ----------
  const pointers = new Map();
  let dragMoved = 0, pinch0 = null;
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = 0; anim = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: state.fov }; }
    cv.classList.add("dragging");
  });
  cv.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      if (state.compass) return;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      const dpp = 2 / Rs * R2D;
      state.viewAz -= dx * dpp;
      state.viewAlt += dy * dpp;
    } else if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()];
      state.fov = pinch0.fov * pinch0.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      dragMoved += 100;
    }
  });
  const endPtr = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
    if (pointers.size === 0) {
      cv.classList.remove("dragging");
      if (dragMoved < 6 && e.type === "pointerup") pick(e.clientX, e.clientY);
    }
  };
  cv.addEventListener("pointerup", endPtr);
  cv.addEventListener("pointercancel", endPtr);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); anim = null; state.fov *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const s = state.fov / 20;
    if (e.key === "ArrowLeft") state.viewAz -= s * 2;
    else if (e.key === "ArrowRight") state.viewAz += s * 2;
    else if (e.key === "ArrowUp") state.viewAlt += s * 2;
    else if (e.key === "ArrowDown") state.viewAlt -= s * 2;
    else if (e.key === "+" || e.key === "=") state.fov /= 1.15;
    else if (e.key === "-") state.fov *= 1.15;
    else return;
    anim = null; e.preventDefault();
  });

  // screen point -> horizontal unit vector (inverse stereographic)
  function unproject(x, y) {
    const X = (x - W / 2) / Rs, Y = -(y - H / 2) / Rs, r2 = X * X + Y * Y;
    const a = 2 * X / (1 + r2), b = 2 * Y / (1 + r2), d = (1 - r2) / (1 + r2);
    return [0, 1, 2].map((k) => a * RT[k] + b * UP[k] + d * F[k]);
  }
  function toEquatorial(h) {
    const x = rot[0][0] * h[0] + rot[0][1] * h[1] + rot[0][2] * h[2];
    const y = rot[1][0] * h[0] + rot[1][1] * h[1] + rot[1][2] * h[2];
    const z = rot[2][0] * h[0] + rot[2][1] * h[1] + rot[2][2] * h[2];
    return { ra: (Math.atan2(y, x) * R2D + 360) % 360, dec: Math.asin(Math.max(-1, Math.min(1, z))) * R2D };
  }
  function pick(x, y) {
    let best = null, bd = 1e9;
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d > Math.max(h.r, 16)) continue;
      const score = d - h.pri * 1.5;
      if (score < bd) { bd = score; best = h; }
    }
    if (best) { select(best.sel); return; }
    const v = unproject(x, y);
    if (state.opts.ground && v[2] < 0) { state.selected = null; $("infocard").hidden = true; return; }
    const eq = toEquatorial(v);
    try {
      const c = A.Constellation(eq.ra / 15, eq.dec);
      if (c && conById[c.symbol]) { select({ kind: "con", id: c.symbol }); return; }
    } catch (e) { /* ignore */ }
    state.selected = null; $("infocard").hidden = true;
  }

  // ---------- info card ----------
  const fmtTime = (d) => d ? d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
  const fmtAltAz = (alt, az) => `${alt.toFixed(1)}° up, ${compassName(az)} (${az.toFixed(0)}°)`;
  const fmtRA = (h) => { const hh = Math.floor(h), m = (h - hh) * 60; return `${hh}h ${m.toFixed(1)}m`; };
  const fmtDec = (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}°`;
  function phaseName(deg) {
    const n = ["New Moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full Moon", "Waning gibbous", "Last quarter", "Waning crescent"];
    return n[Math.round(deg / 45) % 8];
  }
  function riseSet(name) {
    try {
      const r = A.SearchRiseSet(name, observer, +1, astroTime, 1.2);
      const s = A.SearchRiseSet(name, observer, -1, astroTime, 1.2);
      return [r && r.date, s && s.date];
    } catch (e) { return [null, null]; }
  }
  function select(sel, center) {
    state.selected = sel;
    renderInfo(true);
    $("infocard").scrollTop = 0;
    if (center) {
      const v = selVec(sel);
      pointTo(hAz(v), hAlt(v), sel.kind === "con" ? Math.min(state.fov, 70) : undefined);
    }
  }
  let lastInfoKey = "";
  function renderInfo(force) {
    const sel = state.selected;
    if (!sel) { $("infocard").hidden = true; lastInfoKey = ""; return; }
    let title = "", rows = [];
    const v = selVec(sel), alt = hAlt(v), az = hAz(v);
    const key = JSON.stringify(sel) + "|" + Math.round(alt) + "|" + Math.round(az) + "|" + Math.round(state.time / 60000);
    if (!force && key === lastInfoKey && !$("infocard").hidden) return;
    lastInfoKey = key;
    if (sel.kind === "star") {
      const s = STARS[sel.i];
      title = s[4] || s[5] || "Star";
      if (s[4] && s[5]) rows.push(["Designation", s[5]]);
      const cid = s[5] && s[5].split(" ")[1];
      if (cid && conById[cid]) rows.push(["Constellation", `<a href="#" data-con="${cid}">${conById[cid].name} ›</a>`]);
      rows.push(["Magnitude", s[2].toFixed(2)]);
      rows.push(["Position", fmtAltAz(alt, az)]);
      rows.push(["RA / Dec (J2000)", `${fmtRA(s[0] / 15)}, ${fmtDec(s[1])}`]);
    } else if (sel.kind === "body") {
      const b = bodyByName[sel.name];
      title = b.name;
      rows.push(["Position", fmtAltAz(b.alt, b.az)]);
      if (b.name === "Moon") {
        const ph = A.MoonPhase(astroTime);
        rows.push(["Phase", `${phaseName(ph)} · ${Math.round(b.phase * 100)}% lit`]);
        rows.push(["Distance", `${Math.round(b.dist * 1.4959787e8).toLocaleString()} km`]);
      } else if (b.name === "Sun") {
        rows.push(["Note", "Never look directly at the Sun."]);
      } else {
        rows.push(["Magnitude", b.mag.toFixed(1)]);
        rows.push(["Distance", `${b.dist.toFixed(2)} AU`]);
        const bc = A.Constellation(b.ra, b.dec);
        rows.push(["In", conById[bc.symbol] ? `<a href="#" data-con="${bc.symbol}">${bc.name} ›</a>` : bc.name]);
      }
      const [r, s] = riseSet(b.name);
      rows.push(["Next rise", fmtTime(r)]); rows.push(["Next set", fmtTime(s)]);
    } else {
      return renderConInfo(sel.id, alt, az);
    }
    const note = alt < 0 ? `<p class="small" style="color:#ff9b8a">Below the horizon right now.</p>` : "";
    $("infoBody").innerHTML = `<h4>${title}</h4><table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>${note}`;
    $("infocard").hidden = false;
  }
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function renderConInfo(id, alt, az) {
    const c = conById[id], info = CON_INFO[id] || ["", "", ""];
    const members = STARS.filter((s) => s[5] && s[5].split(" ")[1] === id);
    const brightest = members[0];
    const named = members.filter((s) => s[4]).slice(0, 4).map((s) => s[4]);
    const best = MONTHS[Math.floor(2.7 + ((((c.ra / 15 - 9) / 2) % 12) + 12) % 12) % 12];
    const north = Math.min(90, Math.round(c.dec + 90)), south = Math.max(-90, Math.round(c.dec - 90));
    const latTxt = (v) => v === 90 ? "the North Pole" : v === -90 ? "the South Pole" : `${Math.abs(v)}°${v >= 0 ? "N" : "S"}`;
    const rows = [
      ["Position", alt < 0 ? `Below the horizon (${compassName(az)})` : `${alt.toFixed(0)}° up, ${compassName(az)} (${az.toFixed(0)}°)`],
      ["Best seen", `${best} evenings (around 9 pm)`],
      ["Visible from", `${latTxt(north)} to ${latTxt(south)}`],
    ];
    if (brightest) rows.push(["Brightest star", `<a href="#" data-star="${STARS.indexOf(brightest)}">${brightest[4] || brightest[5]} ›</a> (mag ${brightest[2].toFixed(1)})`]);
    if (named.length > 1) rows.push(["Named stars", named.join(", ")]);
    rows.push(["Naked-eye stars*", String(members.length)]);
    $("infoBody").innerHTML = `<div class="kicker">Constellation · ${id}</div><h4>${c.name}</h4>` +
      (info[0] ? `<div class="meaning">${info[0]}</div>` : "") +
      (info[1] ? `<p>${info[1]}</p>` : "") +
      (info[2] ? `<p class="look"><b>Look for:</b> ${info[2]}</p>` : "") +
      `<table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>` +
      `<p class="small muted">*Stars brighter than magnitude 6, the naked-eye limit.</p>` +
      `<button class="small-btn" id="btnCenterCon">Center in view</button>`;
    $("btnCenterCon").onclick = () => select({ kind: "con", id }, true);
    $("infocard").hidden = false;
  }
  $("infoBody").addEventListener("click", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    e.preventDefault();
    if (a.dataset.con) select({ kind: "con", id: a.dataset.con });
    else if (a.dataset.star) select({ kind: "star", i: Number(a.dataset.star) }, true);
  });
  $("infoClose").onclick = () => { state.selected = null; $("infocard").hidden = true; };

  // ---------- panels ----------
  let openPanel = null;
  function showPanel(name) {
    document.querySelectorAll(".sheet").forEach((s) => (s.hidden = true));
    document.querySelectorAll("#toolbar button[data-panel]").forEach((b) => b.classList.toggle("active", b.dataset.panel === name && openPanel !== name));
    if (openPanel === name || !name) { openPanel = null; return; }
    openPanel = name;
    $("panel-" + name).hidden = false;
    uiDirty = true;
  }
  document.querySelectorAll("[data-panel]").forEach((b) => (b.onclick = () => showPanel(b.dataset.panel)));
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => showPanel(null)));

  // ---------- time controls ----------
  function setTime(t, live = false) {
    state.time = t; state.live = live;
    if (live) setPlaying(false);
    recompute();
  }
  document.querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => setTime(state.time + Number(b.dataset.step) * 1000)));
  $("btnNow").onclick = () => setTime(Date.now(), true);
  function setPlaying(p) { state.playing = p; $("btnPlay").textContent = p ? "❚❚" : "▶"; $("btnPlay").classList.toggle("active", p); if (p) state.live = false; }
  $("btnPlay").onclick = () => setPlaying(!state.playing);
  $("speedSel").onchange = (e) => { state.speed = Number(e.target.value); };
  $("dtInput").onchange = (e) => { const t = new Date(e.target.value).getTime(); if (!isNaN(t)) setTime(t); };
  const pad = (n) => String(n).padStart(2, "0");
  function toLocalInput(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  // ---------- location controls ----------
  function setLocation(lat, lon, place) {
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    geoSeq++;
    state.lat = lat; state.lon = lon; state.place = place || fmtLatLon(lat, lon);
    store.set("loc", { lat, lon, place: state.place });
    $("latInput").value = lat.toFixed(4); $("lonInput").value = lon.toFixed(4);
    recompute();
  }
  const fmtLatLon = (lat, lon, dp = 2) => `${Math.abs(lat).toFixed(dp)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(dp)}°${lon >= 0 ? "E" : "W"}`;
  // ---------- reverse geocoding: nearest city offline, then the exact town via OpenStreetMap ----------
  const US_STATES = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC" };
  function placeLabel(name, region, cc) {
    if (cc === "US" || cc === "us") return `${name}, ${US_STATES[region] || region}`;
    return [name, countryName((cc || "").toUpperCase())].filter(Boolean).join(", ");
  }
  function nearestCity(lat, lon) {
    if (!cityRows) return null;
    let best = null, bd = 1e9;
    const cl = Math.cos(lat * D2R);
    for (const c of cityRows) {
      const dy = c.lat - lat, dx = ((c.lon - lon + 540) % 360 - 180) * cl;
      const d = dy * dy + dx * dx;
      if (d < bd) { bd = d; best = c; }
    }
    return best && { city: best, km: Math.sqrt(bd) * 111.2 };
  }
  let geoSeq = 0;
  async function resolvePlaceName(lat, lon, done) {
    const seq = ++geoSeq;
    const apply = (name) => {
      if (seq !== geoSeq || state.lat !== lat || state.lon !== lon) return; // location changed meanwhile
      state.place = name; store.set("loc", { lat, lon, place: name }); uiDirty = true;
      if (done) done(name);
    };
    await loadCities();
    const n = nearestCity(lat, lon);
    if (n) {
      const lbl = placeLabel(n.city.name, n.city.region, n.city.cc);
      apply(n.km <= 12 ? lbl : n.km <= 40 ? `Near ${lbl}` : `${Math.round(n.km)} km from ${lbl}`);
    }
    try { // exact town / village / neighbourhood (works on the website; blocked inside the claude.ai preview)
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${lat}&lon=${lon}`, { signal: ctrl.signal });
      const a = (await r.json()).address || {};
      const town = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.county;
      if (town) apply(placeLabel(town, a.state || a.region || a.province || "", a.country_code));
    } catch (e) { /* offline or blocked: keep the nearest-city name */ }
  }
  // Best guess from the device's time zone: works everywhere, no permission needed.
  function timezoneEstimate() {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* ignore */ }
    const c = typeof TZ_COORDS !== "undefined" && TZ_COORDS[tz];
    if (c) return { lat: c[0], lon: c[1], place: "Near " + tz.split("/").pop().replace(/_/g, " ") };
    const lon = Math.max(-180, Math.min(180, -new Date().getTimezoneOffset() / 4)); // 15° per hour of UTC offset
    return { lat: 35, lon, place: "Rough estimate (" + (tz || "time zone") + ")" };
  }
  function gpsBlockedHere() {
    try {
      const pol = document.permissionsPolicy || document.featurePolicy;
      if (pol && typeof pol.allowsFeature === "function" && !pol.allowsFeature("geolocation")) return true;
    } catch (e) { /* ignore */ }
    return !navigator.geolocation || !window.isSecureContext;
  }
  let gpsBusy = false;
  function useGps(silent) {
    const status = $("gpsStatus");
    const fallback = (why) => {
      const est = timezoneEstimate();
      if (!silent || !store.get("loc", null)) setLocation(est.lat, est.lon, est.place);
      status.innerHTML = `${why} Using your time zone instead: <b>${est.place}</b> (${fmtLatLon(est.lat, est.lon)}), ` +
        "which is close enough for most of the sky. For an exact spot, search your town below.";
      gpsBusy = false;
    };
    if (gpsBlockedHere()) {
      fallback(window.isSecureContext === false ? "GPS needs a secure (https) page." : "This page isn't allowed to use GPS here (the embedded preview blocks it).");
      return;
    }
    if (gpsBusy) return;
    gpsBusy = true;
    status.textContent = "Finding your location… (allow location access if your browser asks)";
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; fallback("GPS didn't respond."); } }, 20000);
    const ok = (pos) => {
      if (done) return; done = true; clearTimeout(timer); gpsBusy = false;
      const { latitude: la, longitude: lo, accuracy } = pos.coords;
      setLocation(la, lo, "My location");
      const acc = `GPS accuracy ~${Math.round(accuracy).toLocaleString()} m`;
      status.textContent = `Located: ${fmtLatLon(la, lo, 4)} (${acc}). Looking up the place name…`;
      resolvePlaceName(la, lo, (name) => {
        const lead = /^near /i.test(name) ? `You're near <b>${name.slice(5)}</b>` : /km from/.test(name) ? `You're <b>${name}</b>` : `You're in <b>${name}</b>`;
        status.innerHTML = `${lead}<br>${fmtLatLon(la, lo, 4)} · ${acc}`;
      });
    };
    const fail = (err, triedHigh) => {
      if (done) return;
      if (err.code === 3 && triedHigh) { // timed out: retry with a cached/coarse fix
        navigator.geolocation.getCurrentPosition(ok, (e2) => fail(e2, false), { enableHighAccuracy: false, timeout: 10000, maximumAge: 3600000 });
        return;
      }
      done = true; clearTimeout(timer);
      const why = err.code === 1
        ? "Location permission is off for this page. Allow it in your browser or phone settings (Location → this site/browser) and tap the button again."
        : err.code === 2 ? "Your device couldn't determine its position." : "Getting a GPS fix took too long.";
      fallback(why);
    };
    try {
      navigator.geolocation.getCurrentPosition(ok, (e) => fail(e, true), { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
    } catch (e) { done = true; clearTimeout(timer); fallback("GPS isn't available here."); }
  }
  $("btnGps").onclick = () => useGps(false);
  $("btnSetLoc").onclick = () => {
    const la = parseFloat($("latInput").value), lo = parseFloat($("lonInput").value);
    setLocation(la, lo); if (state.lat === la && state.lon === lo) resolvePlaceName(la, lo);
  };
  const CITIES = [["New York", 40.7128, -74.006], ["London", 51.5074, -0.1278], ["Los Angeles", 34.0522, -118.2437],
    ["Reykjavík", 64.1466, -21.9426], ["Tokyo", 35.6762, 139.6503], ["Sydney", -33.8688, 151.2093],
    ["Atacama, Chile", -22.9087, -68.1997], ["Cape Town", -33.9249, 18.4241], ["Equator (Quito)", -0.1807, -78.4678],
    ["North Pole", 90, 0], ["South Pole", -90, 0]];
  $("cityChips").innerHTML = CITIES.map((c, i) => `<button data-city="${i}">${c[0]}</button>`).join("");
  $("cityChips").onclick = (e) => { const i = e.target.dataset.city; if (i != null) { const c = CITIES[i]; setLocation(c[1], c[2], c[0]); } };
  // ---------- place search: offline city list, coordinates, then online lookup ----------
  let cityRows = null, cityLoading = null;
  const fold = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { /* ignore */ }
  const countryName = (cc) => { try { return (regionNames && regionNames.of(cc)) || cc; } catch (e) { return cc; } };
  function loadCities() {
    if (cityRows) return Promise.resolve(cityRows);
    if (typeof CITIES_DB !== "undefined") return Promise.resolve(parseCities());
    if (!cityLoading) cityLoading = new Promise((res) => {
      const sc = document.createElement("script"); sc.src = "cities.js";
      sc.onload = () => res(parseCities()); sc.onerror = () => res(null);
      document.head.appendChild(sc);
    });
    return cityLoading;
  }
  function parseCities() {
    cityRows = CITIES_DB.split("\n").map((l) => { const f = l.split("|"); return { name: f[0], region: f[1], cc: f[2], lat: +f[3], lon: +f[4], pop: +f[5], key: fold(f[0]) }; });
    return cityRows;
  }
  $("placeInput").addEventListener("focus", () => loadCities(), { once: true });
  function parseCoords(q) {
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i);
    if (!m) return null;
    let lat = +m[1], lon = +m[3];
    if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat);
    if (m[4] && /w/i.test(m[4])) lon = -Math.abs(lon);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  }
  function searchCities(q) {
    const parts = fold(q).split(",").map((t) => t.trim()).filter(Boolean);
    const name = parts[0], ctx2 = parts.slice(1).join(" ");
    const out = [];
    for (const c of cityRows) { // already sorted by population
      if (!c.key.startsWith(name)) continue;
      if (ctx2) {
        const where = fold(c.region + " " + countryName(c.cc) + " " + c.cc);
        if (!ctx2.split(/\s+/).every((w) => where.includes(w))) continue;
      }
      out.push(c);
      if (out.length >= 8) break;
    }
    out.sort((a, b) => (b.key === name) - (a.key === name) || b.pop - a.pop);
    return out;
  }
  function showResults(list) {
    const box = $("placeResults"); box.innerHTML = "";
    list.forEach((r) => {
      const b = document.createElement("button");
      b.textContent = r.label;
      b.onclick = () => { setLocation(r.lat, r.lon, r.short); box.innerHTML = ""; $("placeInput").value = ""; $("gpsStatus").textContent = ""; };
      box.appendChild(b);
    });
  }
  // forms can't submit inside sandboxed previews, so run search from the button and the Enter key directly
  function bindSearch(formId, inputId, fn) {
    const form = $(formId), input = $(inputId);
    form.addEventListener("submit", (e) => e.preventDefault());
    form.querySelector("button").addEventListener("click", (e) => { e.preventDefault(); fn(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fn(); } });
  }
  bindSearch("searchForm", "placeInput", placeSearch);
  async function placeSearch() {
    const q = $("placeInput").value.trim(); if (!q) return;
    const co = parseCoords(q);
    if (co) { setLocation(co.lat, co.lon); resolvePlaceName(co.lat, co.lon); $("placeResults").textContent = "Location set to " + fmtLatLon(co.lat, co.lon) + "."; return; }
    $("placeResults").textContent = "Searching…";
    const rows = await loadCities();
    if (rows) {
      const hits = searchCities(q);
      if (hits.length) {
        showResults(hits.map((c) => {
          const where = [c.region, countryName(c.cc)].filter(Boolean).join(", ");
          return { lat: c.lat, lon: c.lon, short: `${c.name}, ${c.cc === "US" && c.region ? c.region : countryName(c.cc)}`, label: `${c.name} — ${where}` };
        }));
        return;
      }
    }
    try { // smaller places: try the online geocoder (blocked inside the preview, fine elsewhere)
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } });
      const js = await r.json();
      if (!js.length) throw new Error("none");
      showResults(js.map((p) => ({ lat: parseFloat(p.lat), lon: parseFloat(p.lon), short: p.display_name.split(",").slice(0, 2).join(","), label: p.display_name })));
    } catch (err) {
      $("placeResults").textContent = "No match. Try a nearby larger town (e.g. \"Springfield, Illinois\") or type coordinates like 40.71, -74.01.";
    }
  };

  // ---------- what's up ----------
  function verdict(b) {
    if (b.alt < 0) return "Below horizon";
    if (b.name === "Sun") return "Up — daytime";
    if (b.name === "Moon") return b.alt < 5 ? "Up, low" : "Up";
    if (b.mag > limMag) return sunAlt > -6 && state.opts.daylight ? "Up, lost in daylight" : b.mag > 6 ? "Up, needs a telescope" : "Up, faint";
    return b.alt < 10 ? "Visible, low" : "Visible";
  }
  function renderUp() {
    $("planetList").innerHTML = BODIES.map((b) => {
      const extra = b.name === "Moon" ? ` · ${Math.round(b.phase * 100)}% lit` : b.name === "Sun" ? "" : ` · mag ${b.mag.toFixed(1)}`;
      return `<li class="${b.alt < 0 ? "below" : ""}" data-body="${b.name}"><span class="dot" style="background:${b.color}"></span>${b.name}` +
        `<span class="meta">${verdict(b)}<br>${b.alt.toFixed(0)}° up, ${compassName(b.az)}${extra}</span></li>`;
    }).join("");
    const cons = CONSTELLATIONS.map((c) => ({ c, alt: hAlt(c.h), az: hAz(c.h) })).filter((x) => x.alt > 5).sort((a, b) => b.alt - a.alt);
    $("conList").innerHTML = cons.map((x) => `<li data-con="${x.c.id}">${x.c.name}<span class="meta">${x.alt.toFixed(0)}° up, ${compassName(x.az)}</span></li>`).join("");
    let cond;
    if (!state.opts.daylight) cond = "Daylight simulation is off — showing all stars.";
    else if (sunAlt > 0) cond = "The Sun is up. Only the Moon and the brightest planets may be visible.";
    else if (sunAlt > -6) cond = "Civil twilight — only the brightest stars and planets are showing.";
    else if (sunAlt > -12) cond = "Nautical twilight — bright stars are out.";
    else if (sunAlt > -18) cond = "Astronomical twilight — nearly dark.";
    else cond = "Full darkness — great for stargazing (from a dark site).";
    $("skyCond").textContent = cond;
  }
  $("planetList").onclick = (e) => { const li = e.target.closest("li"); if (li) { select({ kind: "body", name: li.dataset.body }, true); if (innerWidth < 760) showPanel(null); } };
  $("conList").onclick = (e) => { const li = e.target.closest("li"); if (li) { select({ kind: "con", id: li.dataset.con }, true); if (innerWidth < 760) showPanel(null); } };

  // find
  const findIndex = new Map();
  BODIES.forEach((b) => findIndex.set(b.name.toLowerCase(), { kind: "body", name: b.name }));
  CONSTELLATIONS.forEach((c) => findIndex.set(c.name.toLowerCase(), { kind: "con", id: c.id }));
  STARS.forEach((s, i) => { if (s[4] && !findIndex.has(s[4].toLowerCase())) findIndex.set(s[4].toLowerCase(), { kind: "star", i }); });
  $("findList").innerHTML = [...BODIES.map((b) => b.name), ...CONSTELLATIONS.map((c) => c.name), ...STARS.filter((s) => s[4] && s[2] < 3.5).map((s) => s[4])]
    .map((n) => `<option value="${n}">`).join("");
  bindSearch("findForm", "findInput", findObject);
  function findObject() {
    const q = $("findInput").value.trim().toLowerCase();
    let sel = findIndex.get(q);
    if (!sel) for (const [k, v] of findIndex) if (k.startsWith(q)) { sel = v; break; }
    if (sel) { select(sel, true); if (innerWidth < 760) showPanel(null); $("findInput").value = ""; }
  };

  // ---------- layers ----------
  const optMap = { optLines: "lines", optConNames: "conNames", optStarNames: "starNames", optGround: "ground", optDaylight: "daylight", optGrid: "grid", optRed: "red", optMilky: "milkyway", optTwinkle: "twinkle", optLand: "landscape" };
  for (const id in optMap) {
    $(id).checked = state.opts[optMap[id]];
    $(id).onchange = (e) => { state.opts[optMap[id]] = e.target.checked; store.set("opts", state.opts); applyOpts(); recompute(); };
  }
  function applyOpts() { $("redlight").hidden = !state.opts.red; }
  $("fovRange").oninput = (e) => { anim = null; state.fov = Number(e.target.value); };
  $("lookChips").onclick = (e) => {
    const l = e.target.dataset.look; if (l == null) return;
    if (l === "up") pointTo(state.viewAz, 89, 140); else pointTo(Number(l), 25, 90);
  };

  // ---------- device orientation ("point at the sky") ----------
  let ori = null;
  function onOrient(e) {
    let alpha = e.alpha;
    if (typeof e.webkitCompassHeading === "number") alpha = 360 - e.webkitCompassHeading;
    if (alpha == null || e.beta == null) return;
    const a = alpha * D2R, b = e.beta * D2R, g = (e.gamma || 0) * D2R;
    // camera (back of phone) direction in East-North-Up
    const E = -(Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g));
    const N = -(Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g));
    const U = -(Math.cos(b) * Math.cos(g));
    const v = [N, -E, U];
    ori = ori ? ori.map((x, i) => x * 0.8 + v[i] * 0.2) : v;
  }
  async function toggleCompass() {
    if (state.compass) {
      state.compass = false; ori = null;
      window.removeEventListener("deviceorientationabsolute", onOrient);
      window.removeEventListener("deviceorientation", onOrient);
    } else {
      if (typeof DeviceOrientationEvent === "undefined") { alert("This device doesn't report its orientation. Drag the sky to look around instead."); return; }
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        try { if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return; } catch (e) { return; }
      }
      state.compass = true;
      if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onOrient);
      else window.addEventListener("deviceorientation", onOrient);
      setTimeout(() => { if (state.compass && !ori) { toggleCompass(); alert("No compass data from this device — drag to look around instead."); } }, 2500);
    }
    $("btnCompass").classList.toggle("active", state.compass);
  }
  $("btnCompass").onclick = toggleCompass;

  // ---------- main loop ----------
  let lastComputed = 0, uiDirty = true, lastUi = 0, lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.25, (now - lastFrame) / 1000); lastFrame = now;
    if (state.live) state.time = Date.now();
    else if (state.playing) state.time += dt * 1000 * state.speed;
    const thresh = state.playing ? 0 : 1000;
    if (Math.abs(state.time - lastComputed) > thresh) recompute();
    if (state.compass && ori) {
      const n = Math.hypot(...ori);
      state.viewAz = hAz(ori.map((x) => x / n)); state.viewAlt = hAlt(ori.map((x) => x / n));
    }
    stepAnim(now);
    draw();
    updateFacing();
    if (uiDirty && now - lastUi > 250) { updateUi(); uiDirty = false; lastUi = now; }
    requestAnimationFrame(frame);
  }
  function updateUi() {
    const d = new Date(state.time);
    $("timeLabel").textContent = (state.live ? "Now · " : "") + d.toLocaleString([], { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined, hour: "numeric", minute: "2-digit" });
    $("locLabel").textContent = state.place;
    $("locCoords").textContent = fmtLatLon(state.lat, state.lon, 3);
    $("curLocName").textContent = state.place;
    $("curLocCoords").textContent = fmtLatLon(state.lat, state.lon, 4);
    if (document.activeElement !== $("dtInput")) $("dtInput").value = toLocalInput(state.time);
    $("utcLabel").textContent = "UTC: " + d.toISOString().replace("T", " ").slice(0, 16);
    const sun = bodyByName.Sun;
    $("sunInfo").textContent = `Sun is ${sun.alt.toFixed(1)}° ${sun.alt >= 0 ? "above" : "below"} the horizon.`;
    $("fovLabel").textContent = Math.round(state.fov) + "°";
    if (openPanel === "up") renderUp();
    if (state.selected) renderInfo();
  }
  setInterval(() => { $("fovRange").value = Math.round(state.fov); $("fovLabel").textContent = Math.round(state.fov) + "°"; }, 300);

  // ---------- start ----------
  resize();
  applyOpts();
  $("latInput").value = state.lat.toFixed(4); $("lonInput").value = state.lon.toFixed(4);
  recompute();
  requestAnimationFrame(frame);
  if (!savedLoc) {
    const est = timezoneEstimate();
    setLocation(est.lat, est.lon, est.place);
    if (!gpsBlockedHere()) useGps(true);
  }

  // expose for debugging/tests
  window.StarGazer = { state, recompute, bodyByName, STARS, starHor, hAlt, hAz, setLocation, setTime, select };
})();
