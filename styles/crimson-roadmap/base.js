// Crimson Roadmap (Cinematic Explainer) style engine for the ai-video-editor skill.
// Unchanged from the working full.html reference, except: the player is removed (the skill's player.js replaces it)
// and TL, CUTS, SCENES are declared with var so your story.js can redefine them.
// Everything after the 'STYLE:' banner that draws the demo story (scene functions, explainer, scoreSound) is a worked example.
// NOTE: the demo draws in landscape 1280x720. In the skill's vertical mode (720x1280) write your own portrait
// layout in story.js - reuse C, SERIF/SANS/ITAL/MONO, ez, CM, rr, textW and the drawing patterns, not the fixed coords.

// =====================================================================================================
// CREATOR MOTION GRAPHICS · core helpers (CM), sound kit (SFX) — unchanged from the reference library
// =====================================================================================================
const CM = (() => {
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, u) => a + (b - a) * u;
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  const hash = (s) => { s = String(s); let h = 0x9e3779b1; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b); h ^= h >>> 13; } return h >>> 0; };
  const rng = (seed) => {
    const s = typeof seed === 'number' ? seed >>> 0 : hash(seed);
    let a = (s ^ 0xa5a5a5a5) >>> 0, b = (Math.imul(s, 0x27d4eb2d) >>> 0) || 1, c = (0x165667b1 ^ s) >>> 0, d = (rotl(s, 7) >>> 0) || 7;
    const r = () => { const res = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0; const t = b << 9; c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11); return res / 4294967296; };
    for (let i = 0; i < 8; i++) r();
    r.in = (lo, hi) => lo + r() * (hi - lo);
    r.pick = (arr) => arr[(r() * arr.length) | 0];
    return r;
  };
  const noise1 = (seed) => { const r = rng(seed), v = Float32Array.from({ length: 256 }, () => r() * 2 - 1); return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(v[i & 255], v[(i + 1) & 255], u); }; };
  const ez = {
    out3: (u) => 1 - Math.pow(1 - u, 3),
    in3: (u) => u * u * u,
    inout3: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    outExpo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
    back: (u, s = 1.7) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2)),
    spring: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.exp(-6 * u) * Math.cos(13 * u)),
  };
  const layer = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  return { clamp, lerp, span, hash, rng, noise1, ez, layer };
})();

// =====================================================================================================
// SFX (unchanged)
// =====================================================================================================
const SFX = (() => {
  const SEMI = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const hz = (n) => { if (typeof n === 'number') return n; const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); return 440 * Math.pow(2, (SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] - 4) * 12) / 12); };

  function kit(ac, o = {}) {
    const VO = !!o.voiceover, SR = ac.sampleRate, T0 = o.from || 0, base = ac.currentTime + (o.lead || 0);
    const at = (t) => (Math.round((base + (t - T0)) * SR) + 0.3) / SR;
    const skip = (t, dur) => at(t) + dur < ac.currentTime || (t < T0 - 0.005 && dur < 1.2);

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    const master = ac.createGain(); master.gain.value = o.master == null ? 0.85 : o.master;
    comp.connect(master); master.connect(o.dest || ac.destination);
    const mk = (g) => { const n = ac.createGain(); n.gain.value = g; n.connect(comp); return n; };
    const bus = { fx: mk(VO ? 0.78 : 0.95), music: mk(VO ? 0.3 : 0.62), amb: mk(0.45) };
    const duckIn = ac.createGain(); duckIn.connect(bus.music);
    const DUCKS = [];

    const verb = ac.createConvolver();
    { const n = Math.floor(1.5 * SR), ir = ac.createBuffer(2, n, SR);
      for (let ch = 0; ch < 2; ch++) { const r = CM.rng('plate' + ch), d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const u = i / n; lp += (0.7 - 0.5 * u) * ((r() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - u, 2.6) * 0.9; } }
      verb.buffer = ir; }
    const verbIn = ac.createGain(); verbIn.gain.value = 0.8; verbIn.connect(verb); verb.connect(comp);

    const NB = {};
    { const n = Math.floor(2 * SR);
      for (const kind of ['white', 'pink', 'brown']) {
        const b = ac.createBuffer(1, n, SR), d = b.getChannelData(0), r = CM.rng('nz' + kind); let b0 = 0, b1 = 0, b2 = 0, br = 0;
        for (let i = 0; i < n; i++) { const w = r() * 2 - 1;
          if (kind === 'white') d[i] = w;
          else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
          else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.4; } }
        NB[kind] = b; } }

    const ramp = (param, v, t) => { if (!Array.isArray(v)) { param.setValueAtTime(v, t); return; } param.setValueAtTime(v[0][1], t + v[0][0]); for (let i = 1; i < v.length; i++) param.exponentialRampToValueAtTime(Math.max(1e-3, v[i][1]), t + v[i][0]); };
    const env = (g, t, peak, dur, a = 0.004, hold = 0) => {
      a = Math.min(a, dur * 0.9); hold = Math.min(hold, dur - a);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(1e-4, t + dur); g.gain.setValueAtTime(0, t + dur + 0.002);
    };
    const level = (p, d) => (p.gain == null ? d : p.gain) * (VO && p.soft ? 0.55 : 1);
    const route = (node, p, t) => {
      const pan = ac.createStereoPanner();
      if (Array.isArray(p.pan)) { pan.pan.setValueAtTime(p.pan[0], t); pan.pan.linearRampToValueAtTime(p.pan[1], t + (p.dur || 0.2)); } else pan.pan.value = CM.clamp(p.pan || 0, -1, 1);
      node.connect(pan); pan.connect(p.bus === 'music' ? duckIn : bus[p.bus || 'fx']);
      if (p.verb) { const s = ac.createGain(); s.gain.value = p.verb; pan.connect(s); s.connect(verbIn); }
    };
    const filt = (p, t) => { if (!p.filter) return null; const f = ac.createBiquadFilter(); f.type = p.filter; f.Q.value = p.q == null ? 0.9 : p.q; ramp(f.frequency, p.ff == null ? 1200 : p.ff, t); return f; };

    function voice(time, p) {
      const dur = p.dur || 0.2; if (skip(time, dur)) return; const t = at(time);
      const osc = ac.createOscillator(); osc.type = p.type || 'sine';
      ramp(osc.frequency, Array.isArray(p.f) ? p.f.map(([d, v]) => [d, hz(v)]) : hz(p.f || 440), t);
      const g = ac.createGain(); env(g, t, level(p, 0.3), dur, p.a, p.hold);
      const f = filt(p, t); if (f) { osc.connect(f); f.connect(g); } else osc.connect(g);
      route(g, p, t); osc.start(t); osc.stop(t + dur + 0.03);
    }
    function hiss(time, p) {
      const dur = p.dur || 0.2; if (skip(time, dur)) return; const t = at(time);
      const src = ac.createBufferSource(); src.buffer = NB[p.color || 'white']; src.loop = true; if (p.rate) src.playbackRate.value = p.rate;
      const g = ac.createGain(); env(g, t, level(p, 0.3), dur, p.a, p.hold);
      const f = filt(p, t); if (f) { src.connect(f); f.connect(g); } else src.connect(g);
      route(g, p, t); src.start(t, CM.rng('off' + time)() * 1.5); src.stop(t + dur + 0.03);
    }
    function duck(t, depth = 0.5, hold = 0.25) { DUCKS.push({ t, depth, hold }); }

    const S = {
      slam: (t, o) => { voice(t, { f: [[0, 150], [0.12, 52]], dur: 0.2, gain: 0.42 * o.g, pan: o.pan, soft: o.soft }); hiss(t, { dur: 0.07, filter: 'lowpass', ff: 2600, gain: 0.22 * o.g, pan: o.pan, soft: o.soft }); hiss(t, { dur: 0.012, filter: 'highpass', ff: 5000, gain: 0.12 * o.g, pan: o.pan, soft: o.soft }); },
      boom: (t, o) => { voice(t, { f: [[0, 90], [0.08, 52], [1.6, 34]], dur: 1.7, gain: 0.7 * o.g, a: 0.006, hold: 0.12 }); hiss(t, { color: 'brown', dur: 0.6, filter: 'lowpass', ff: [[0, 600], [0.5, 90]], gain: 0.35 * o.g, verb: 0.3 }); duck(t, 0.7, 0.35); },
      pop: (t, o) => { const f = o.f || 760; voice(t, { f: [[0, f * 1.7], [0.05, f]], dur: 0.08, gain: 0.22 * o.g, pan: o.pan, soft: o.soft }); hiss(t, { dur: 0.01, filter: 'highpass', ff: 4500, gain: 0.08 * o.g, pan: o.pan, soft: o.soft }); },
      tick: (t, o) => hiss(t, { dur: 0.016, filter: 'bandpass', ff: o.f || 3800, q: 3, gain: 0.32 * o.g, pan: o.pan, soft: o.soft }),
      click: (t, o) => { hiss(t, { dur: 0.012, filter: 'bandpass', ff: 3200, q: 2, gain: 0.35 * o.g, pan: o.pan }); hiss(t + 0.045, { dur: 0.01, filter: 'bandpass', ff: 2400, q: 2, gain: 0.22 * o.g, pan: o.pan }); },
      whoosh: (t, o) => { const d = o.dur || 0.35, dir = o.dir || 1; hiss(t, { color: 'pink', dur: d, filter: 'bandpass', ff: [[0, 260], [d * 0.55, o.top || 3200], [d, 520]], q: 0.75, gain: 0.5 * o.g, a: d * 0.55, pan: [-0.7 * dir, 0.7 * dir], verb: 0.12, soft: o.soft }); hiss(t + d * 0.2, { dur: d * 0.6, filter: 'highpass', ff: [[0, 3000], [d * 0.6, 7000]], gain: 0.08 * o.g, a: d * 0.3, pan: [-0.4 * dir, 0.5 * dir], soft: o.soft }); },
      riser: (t, o) => { const d = o.dur || 0.8; hiss(t, { color: 'pink', dur: d, filter: 'bandpass', ff: [[0, 300], [d, 5200]], q: 1.1, gain: 0.32 * o.g, a: d * 0.96, verb: 0.2, soft: o.soft }); voice(t, { type: 'sawtooth', f: [[0, 110], [d, 440]], dur: d, gain: 0.06 * o.g, a: d * 0.95, filter: 'lowpass', ff: [[0, 400], [d, 2400]], soft: o.soft }); },
      glitch: (t, o) => { const r = CM.rng('gl' + t); for (let i = 0; i < 9; i++) voice(t + i * 0.021, { type: 'square', f: 180 + r() * 2200, dur: 0.018, gain: 0.07 * o.g, a: 0.001, hold: 0.012, pan: r() * 1.4 - 0.7 }); hiss(t, { dur: 0.2, filter: 'bandpass', ff: [[0, 4000], [0.2, 900]], q: 0.7, gain: 0.18 * o.g }); hiss(t + 0.1, { dur: 0.05, color: 'brown', gain: 0.25 * o.g }); },
      ping: (t, o) => { voice(t, { f: 'E6', dur: 0.5, gain: 0.16 * o.g, a: 0.003, verb: 0.3, pan: o.pan }); voice(t + 0.11, { f: 'B6', dur: 0.7, gain: 0.14 * o.g, a: 0.003, verb: 0.35, pan: o.pan }); },
      send: (t, o) => { voice(t, { f: [[0, 520], [0.11, 1500]], dur: 0.13, gain: 0.14 * o.g, pan: o.pan }); hiss(t, { dur: 0.1, filter: 'highpass', ff: [[0, 2000], [0.1, 6000]], gain: 0.07 * o.g, pan: o.pan }); },
      keys: (t, o) => { const r = CM.rng('k' + t), end = t + (o.dur || 0.4); for (let x = t; x < end; x += 0.055 + r() * 0.035) { hiss(x, { dur: 0.014, filter: 'bandpass', ff: 3200 + r() * 900, q: 3, gain: 0.2 * o.g, pan: o.pan, soft: true }); voice(x, { f: 1900 + r() * 300, dur: 0.012, gain: 0.025 * o.g, pan: o.pan, soft: true }); } },
      marker: (t, o) => { const d = o.dur || 0.25, r = CM.rng('m' + t); for (let x = 0; x < d; x += 0.022 + r() * 0.012) hiss(t + x, { dur: 0.03, filter: 'bandpass', ff: 1700 + r() * 900, q: 1.4, gain: 0.16 * o.g * (0.6 + r() * 0.5), pan: o.pan, soft: o.soft }); },
      strike: (t, o) => { hiss(t, { dur: 0.15, filter: 'bandpass', ff: [[0, 1200], [0.15, 3200]], q: 1.2, gain: 0.3 * o.g, a: 0.02, pan: o.pan }); },
      tapeStop: (t, o) => { voice(t, { type: 'sawtooth', f: [[0, 196], [0.62, 18]], dur: 0.66, gain: 0.22 * o.g, a: 0.004, hold: 0.3, filter: 'lowpass', ff: [[0, 1800], [0.6, 160]] }); voice(t, { f: [[0, 98], [0.62, 12]], dur: 0.66, gain: 0.3 * o.g, a: 0.004, hold: 0.3 }); hiss(t, { color: 'brown', dur: 0.5, filter: 'lowpass', ff: [[0, 900], [0.5, 120]], gain: 0.18 * o.g }); },
      stamp: (t, o) => { voice(t, { f: [[0, 160], [0.18, 48]], dur: 0.28, gain: 0.6 * o.g }); hiss(t, { dur: 0.06, filter: 'bandpass', ff: 1300, q: 1.1, gain: 0.4 * o.g }); hiss(t + 0.004, { dur: 0.014, filter: 'highpass', ff: 4200, gain: 0.25 * o.g }); },
      shimmer: (t, o) => { ['C6', 'E6', 'G6', 'B6', 'D7', 'E7'].forEach((n, i) => voice(t + i * 0.035, { f: n, dur: 0.75, gain: 0.045 * o.g, a: 0.003, verb: 0.45, pan: (i % 2 ? 0.35 : -0.35) })); },
      sparkle: (t, o) => { const r = CM.rng('sp' + t); for (let i = 0; i < 5; i++) voice(t + i * 0.05, { f: 2400 + r() * 2400, dur: 0.25, gain: 0.03 * o.g, a: 0.002, verb: 0.4, pan: r() * 1.2 - 0.6 }); },
    };
    function play(name, t, opts = {}) { const fn = S[name]; if (!fn) throw new Error('unknown sound ' + name); fn(t, Object.assign({}, opts, { g: opts.gain == null ? 1 : opts.gain })); }

    function music(t0, t1, p = {}) {
      const bpm = p.bpm || 98, step = 60 / bpm / 4, bar = step * 16, g = p.gain == null ? 1 : p.gain;
      const roots = p.roots || ['A1', 'F1', 'C2', 'G1'];
      const pads = p.pads || [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4']];
      let bi = 0;
      for (let tb = t0; tb < t1 - 0.05; tb += bar, bi++) {
        const root = roots[bi % roots.length], pad = pads[bi % pads.length], blen = Math.min(bar, t1 - tb);
        pad.forEach((n, k) => voice(tb, { type: 'triangle', f: n, dur: blen + 0.2, gain: 0.03 * g, a: 0.3, hold: blen - 0.5, filter: 'lowpass', ff: 1100, pan: (k - 1) * 0.35, verb: 0.3, bus: 'music' }));
        for (let s = 0; s < 16; s++) {
          const ts = tb + s * step; if (ts >= t1 - 0.02) break;
          if (s === 0 || s === 10) { voice(ts, { f: [[0, 150], [0.09, 46]], dur: 0.32, gain: 0.5 * g, bus: 'music' }); hiss(ts, { dur: 0.012, filter: 'highpass', ff: 3000, gain: 0.05 * g, bus: 'music' }); }
          if (s === 4 || s === 12) { hiss(ts, { dur: 0.16, filter: 'bandpass', ff: 1700, q: 0.8, gain: 0.26 * g, verb: 0.25, bus: 'music' }); hiss(ts + 0.008, { dur: 0.05, filter: 'highpass', ff: 4500, gain: 0.1 * g, bus: 'music' }); }
          if (s % 2 === 0) hiss(ts, { dur: s % 4 === 2 ? 0.05 : 0.028, filter: 'highpass', ff: 7500, gain: (s % 4 === 2 ? 0.06 : 0.035) * g, bus: 'music' });
          if ([0, 3, 6, 10, 14].includes(s)) voice(ts, { type: 'triangle', f: root, dur: step * 2.6, gain: 0.2 * g, a: 0.006, hold: step, filter: 'lowpass', ff: 380, bus: 'music' });
        }
      }
    }
    function drone(t0, t1, p = {}) { const d = t1 - t0, g = p.gain == null ? 1 : p.gain; voice(t0, { f: p.note || 'A1', dur: d, gain: 0.12 * g, a: d * 0.4, hold: d * 0.4, bus: 'music' }); hiss(t0, { color: 'pink', dur: d, filter: 'bandpass', ff: 900, q: 0.5, gain: 0.03 * g, a: d * 0.5, hold: d * 0.3, bus: 'amb' }); }
    function finish() {
      DUCKS.sort((a, b) => a.t - b.t);
      for (const e of DUCKS) { const s = at(e.t); if (s + e.hold < ac.currentTime) continue; duckIn.gain.setTargetAtTime(1 - e.depth, Math.max(s, ac.currentTime), 0.008); duckIn.gain.setTargetAtTime(1, s + e.hold, 0.14); }
    }
    return { play, voice, hiss, music, drone, duck, finish, hz, vo: VO };
  }
  function live(score, from, opts = {}) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const k = kit(ac, Object.assign({}, opts, { from: from || 0, lead: 0.04 })); score(k); k.finish();
    return () => { try { ac.close(); } catch (e) {} };
  }
  async function render(score, dur, sr = 48000, opts = {}) {
    const len = Math.ceil(dur * sr), ac = new OfflineAudioContext(2, len, sr);
    const k = kit(ac, Object.assign({}, opts, { from: 0 })); score(k); k.finish();
    const buf = await ac.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), inter = new Float32Array(len * 2);
    let peak = 0; for (let i = 0; i < len; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
    return { inter, peak, sr, frames: len };
  }
  return { kit, live, render, hz };
})();

// ---------- shared helpers kept from the reference ----------
const W = 1280, HH = 720;
const { clamp, lerp, span, rng, noise1, ez } = CM;
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
function track(K, t) {
  if (t <= K[0][0]) return K[0].slice(1);
  for (let i = 0; i < K.length - 1; i++) { const a = K[i], b = K[i + 1]; if (t <= b[0]) { const e = ez.inout3((t - a[0]) / Math.max(1e-6, b[0] - a[0])); return a.slice(1).map((v, j) => lerp(v, b[j + 1], e)); } }
  return K[K.length - 1].slice(1);
}
const textW = (c, s, font) => { c.save(); c.font = font; const w = c.measureText(s).width; c.restore(); return w; };
function softCard(c, x, y, w, h, r, o = {}) {
  c.save(); c.shadowColor = o.shadow || 'rgba(0,0,0,0.45)'; c.shadowBlur = o.blur == null ? 40 : o.blur; c.shadowOffsetY = o.offY == null ? 14 : o.offY;
  c.fillStyle = o.fill || '#ffffff'; rr(c, x, y, w, h, r); c.fill(); c.restore();
}
const LA = CM.layer(W, HH), LB = CM.layer(W, HH);
function sceneLayer(L, draw, t) { const x = L.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, HH); draw(x, t); return L; }
function composite(ctx, t, SCENES, CUTS, background) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  background(ctx, t);
  let idx = 0; for (const c of CUTS) if (t >= c.t) idx++;
  const cut = CUTS.find((c) => t >= c.t && t < c.t + c.d);
  if (!cut) { ctx.drawImage(sceneLayer(LA, SCENES[idx], t), 0, 0); return; }
  const u = (t - cut.t) / cut.d, e = ez.inout3(u), A = sceneLayer(LA, SCENES[idx - 1], t), B = sceneLayer(LB, SCENES[idx], t);
  if (cut.type === 'push') {
    const dir = cut.dir || 1, s = 1 - 0.05 * Math.sin(Math.PI * u);
    for (const [L, off] of [[A, -e * W * dir], [B, (1 - e) * W * dir]]) { ctx.save(); ctx.translate(640 + off, 360); ctx.scale(s, s); ctx.drawImage(L, -640, -360); ctx.restore(); }
  } else { ctx.save(); ctx.globalAlpha = 1 - e; ctx.drawImage(A, 0, 0); ctx.globalAlpha = e; ctx.drawImage(B, 0, 0); ctx.restore(); }
}
function padBed(k, t0, t1, o = {}) {
  const bpm = o.bpm || 90, beat = 60 / bpm, bar = beat * 4, chords = o.chords, g = o.gain == null ? 1 : o.gain;
  let i = 0;
  for (let tb = t0; tb < t1 - 0.1; tb += bar, i++) {
    const ch = chords[i % chords.length], len = Math.min(bar, t1 - tb);
    ch.forEach((n, j) => { k.voice(tb, { type: 'triangle', f: n, dur: len + 0.4, gain: 0.026 * g, a: 0.5, hold: Math.max(0, len - 0.9), filter: 'lowpass', ff: o.cut || 1300, pan: (j - (ch.length - 1) / 2) * 0.3, verb: 0.3, bus: 'music' }); });
    k.voice(tb, { f: k.hz(ch[0]) / 2, dur: len + 0.2, gain: 0.05 * g, a: 0.3, hold: Math.max(0, len - 0.6), bus: 'music' });
  }
}

// =====================================================================================================
// STYLE: Crimson Roadmap — "The exact blueprint to escape the Rat Race in 2027"
// Dark cinematic escape-plan explainer: black step cards with warm light pillars, a crimson journey map
// with a dashed route and glowing stage pins, white evidence clippings with a yellow marker swipe,
// kraft sticky notes, film grain and slow Ken Burns pushes. Numbers on screen are labeled arithmetic.
// =====================================================================================================
const C = { bg: '#0c0909', red: '#7a0d18', redDeep: '#4d0810', pin: '#e01330', amber: '#f0a952', cream: '#f6f2e9', ink: '#171310', hi: '#ffd23f', kraft: '#c9a06a' };
const SERIF = (px, w = 700, it = false) => `${it ? 'italic ' : ''}${w} ${px}px "Playfair Display", Georgia, serif`;
const SANS = (px, w = 800) => `${w} ${px}px "Archivo", system-ui, sans-serif`;
const ITAL = (px, w = 400) => `italic ${w} ${px}px "Instrument Serif", Georgia, serif`;
const MONO = (px, w = 500) => `${w} ${px}px "IBM Plex Mono", ui-monospace, monospace`;
const pxOf = (font) => parseFloat(/(\d+)px/.exec(font)[1]);
// a word rises from behind a mask line into place (from the reference shared helpers)
function rise(c, s, x, y, font, color, t0, t, o = {}) {
  const w = textW(c, s, font); if (t < t0) return w;
  const px = pxOf(font), X = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x, e = ez.outExpo(span(t, t0, t0 + (o.dur || 0.5)));
  c.save(); c.beginPath(); c.rect(X - 12, y - px * 1.0, w + 24, px * 1.32); c.clip();
  c.globalAlpha *= Math.min(1, e * 1.6) * (o.alpha == null ? 1 : o.alpha); c.font = font; c.fillStyle = color; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillText(s, X, y + (1 - e) * px * 0.9); c.restore(); return w;
}

// ---------- timeline: picture and sound both read this ----------
var TL = {
  D: 49.2,
  s0: { caps: 0.7, big: 1.15, sub: 2.3 },
  map: { path: [3.95, 5.6], pins: [4.75, 5.55, 6.35] },
  s1: { caps: 10.9, big: 11.35, card: 12.5, hi: 13.15, note: 14.4 },
  im1: { t0: 16.6, tag: 17.3, w: [17.85, 18.3], sub: 19.4 },
  s2: { caps: 21.9, big: 22.35, sticky: 23.65, note: 25.0 },
  s3: { caps: 32.9, big: 33.35, cardA: 34.4, cardB: 35.05, x: 36.4, note: 37.5 },
  im2: { t0: 38.6, tag: 39.3, w: [39.85, 40.3], sub: 41.4 },
  s4: { path: [43.65, 44.8], flag: 44.95, take: 46.1, w2: [47.0, 47.12, 47.24], pill: 47.7, note: 48.7 },
};
var CUTS = [
  { t: 3.4, d: 0.55, type: 'push', dir: 1 },
  { t: 10.2, d: 0.55, type: 'push', dir: -1 },
  { t: 16.6, d: 0.7, type: 'splash', seed: 'splash1' },
  { t: 21.2, d: 0.7, type: 'splash', seed: 'splash2' },
  { t: 27.6, d: 0.55, type: 'push', dir: 1 },
  { t: 38.6, d: 0.7, type: 'splash', seed: 'splash3' },
  { t: 43.2, d: 0.55, type: 'push', dir: -1 },
];

// ---------- the route ----------
const WP = [[-70, 665], [185, 535], [425, 590], [665, 400], [885, 465], [1090, 380], [1230, 330]];
const STAGES = [1, 3, 5].map((i) => ({ x: WP[i][0], y: WP[i][1], n: i === 1 ? 1 : i === 3 ? 2 : 3 }));
const ROAD = (() => {
  const mids = []; for (let i = 0; i < WP.length - 1; i++) mids.push([(WP[i][0] + WP[i + 1][0]) / 2, (WP[i][1] + WP[i + 1][1]) / 2]);
  const segs = [{ c0: WP[0], cp: WP[0], e: mids[0] }];
  for (let i = 1; i < WP.length - 1; i++) segs.push({ c0: mids[i - 1], cp: WP[i], e: mids[i] });
  segs.push({ c0: mids[mids.length - 1], cp: WP[WP.length - 1], e: WP[WP.length - 1] });
  const pts = [];
  for (const s of segs) for (let j = 0; j <= 24; j++) { const u = j / 24, a = 1 - u;
    pts.push([a * a * s.c0[0] + 2 * a * u * s.cp[0] + u * u * s.e[0], a * a * s.c0[1] + 2 * a * u * s.cp[1] + u * u * s.e[1]]); }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] };
})();
// fraction of the route at the Stage 3 pin, where the finale leg starts
const FLAG_F0 = (() => { let bi = 0, bd = 1e9; ROAD.pts.forEach((p, i) => { const d = (p[0] - 1090) ** 2 + (p[1] - 380) ** 2; if (d < bd) { bd = d; bi = i; } }); return ROAD.cum[bi] / ROAD.total; })();

// ---------- background: near-black, warm corner glow, grain, vignette ----------
function background(c, t) {
  c.fillStyle = C.bg; c.fillRect(0, 0, W, HH);
  const g = c.createRadialGradient(180, 80, 0, 180, 80, 700); g.addColorStop(0, 'rgba(122,13,24,0.16)'); g.addColorStop(1, 'rgba(122,13,24,0)'); c.fillStyle = g; c.fillRect(0, 0, W, HH);
}
const GRAIN = (() => { const n = CM.layer(160, 160), g = n.getContext('2d'), r = CM.rng('grain'), d = g.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = 60 + r() * 195; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); return n; })();
function grain(c, t) {
  c.save(); c.globalAlpha = 0.05; const ox = Math.floor((noise1('gx')(t * 6.3) * 0.5 + 0.5) * 160), oy = Math.floor((noise1('gy')(t * 6.3) * 0.5 + 0.5) * 160);
  for (let x = -ox; x < W; x += 160) for (let y = -oy; y < HH; y += 160) c.drawImage(GRAIN, x, y); c.restore();
}
function vignette(c) { const v = c.createRadialGradient(640, 360, 330, 640, 360, 880); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)'); c.fillStyle = v; c.fillRect(0, 0, W, HH); }
function cam(c, t, a, b, z0 = 1, z1 = 1.05) { const z = lerp(z0, z1, ez.inout3(span(t, a, b))); c.translate(640, 360); c.scale(z, z); c.translate(-640, -360); }

// mono caps tag, rises slightly as it appears
function tag(c, s, x, y, t0, t, col = C.amber, align = 'center', a = 0.95) {
  if (t < t0) return; const e = ez.outExpo(span(t, t0, t0 + 0.4));
  c.save(); c.globalAlpha *= e * a; c.font = MONO(20, 600); c.letterSpacing = '5px'; c.fillStyle = col; c.textAlign = align;
  c.fillText(s, x + (1 - e) * 8, y); c.letterSpacing = '0px'; c.restore();
}

// ---------- the black step card: two warm light pillars with a slow flicker ----------
function pillar(c, x, t, seed, t0) {
  const w = 26, h = 400, y0 = 170;
  const on = ez.out3(span(t, t0, t0 + 0.8));
  const flick = 0.82 + 0.18 * (0.5 + 0.5 * noise1(seed)(t * 2.3 + x * 0.01));
  const g = c.createRadialGradient(x, y0 + h / 2, 0, x, y0 + h / 2, 300);
  g.addColorStop(0, `rgba(240,169,82,${0.34 * on * flick})`); g.addColorStop(1, 'rgba(240,169,82,0)');
  c.fillStyle = g; c.fillRect(x - 320, 40, 640, 640);
  c.save(); c.globalAlpha = on;
  const b = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  b.addColorStop(0, 'rgba(240,169,82,0.25)'); b.addColorStop(0.5, `rgba(248,222,176,${0.95 * flick})`); b.addColorStop(1, 'rgba(240,169,82,0.25)');
  c.fillStyle = b; rr(c, x - w / 2, y0, w, h, 13); c.fill();
  const f = c.createRadialGradient(x, 645, 0, x, 645, 200);
  f.addColorStop(0, `rgba(240,169,82,${0.24 * on})`); f.addColorStop(1, 'rgba(240,169,82,0)');
  c.fillStyle = f; c.beginPath(); c.ellipse(x, 655, 200, 62, 0, 0, 7); c.fill();
  c.restore();
}
// pillars + mono tag + big serif stage numeral + sans subtitle (caller handles cam/restore)
function stageHead(c, t, seed, capT, tagText, bigT, bigText, subText) {
  pillar(c, 250, t, seed + 'a', capT - 0.4); pillar(c, 1030, t, seed + 'b', capT - 0.4);
  tag(c, tagText, 640, 150, capT, t);
  const e2 = ez.outExpo(span(t, bigT, bigT + 0.6));
  if (e2 > 0) { c.save(); c.globalAlpha = e2; const s = 0.94 + 0.06 * e2; c.translate(640, 282); c.scale(s, s);
    c.font = SERIF(96, 700); c.fillStyle = C.cream; c.textAlign = 'center';
    c.shadowColor = 'rgba(240,169,82,0.3)'; c.shadowBlur = 36; c.fillText(bigText, 0, 0); c.restore(); }
  const e3 = ez.outExpo(span(t, bigT + 0.25, bigT + 0.75));
  if (e3 > 0) { c.save(); c.globalAlpha = e3; c.font = SANS(46, 800); c.fillStyle = 'rgba(246,242,233,0.92)'; c.textAlign = 'center';
    c.fillText(subText, 640, 352 + (1 - e3) * 10); c.restore(); }
}

// ---------- the crimson map ----------
function redBG(c) {
  c.fillStyle = C.red; c.fillRect(-40, -40, W + 80, HH + 80);
  const g = c.createRadialGradient(640, 290, 0, 640, 290, 880);
  g.addColorStop(0, 'rgba(224,19,48,0.18)'); g.addColorStop(1, 'rgba(77,8,16,0.6)');
  c.fillStyle = g; c.fillRect(-40, -40, W + 80, HH + 80);
}
function routeSeg(c, t, a, b, f0) {
  const p = ez.inout3(span(t, a, b)); if (p <= 0) return;
  c.save(); c.strokeStyle = 'rgba(246,242,233,0.95)'; c.lineWidth = 4.5; c.lineCap = 'round'; c.setLineDash([1, 13]);
  const s0 = f0 * ROAD.total, L = (f0 + p * (1 - f0)) * ROAD.total; let started = false;
  c.beginPath();
  for (let i = 0; i < ROAD.pts.length; i++) { if (ROAD.cum[i] < s0) continue; if (ROAD.cum[i] > L) break;
    const P = ROAD.pts[i]; started ? c.lineTo(P[0], P[1]) : (c.moveTo(P[0], P[1]), started = true); }
  if (started) c.stroke();
  c.setLineDash([]); c.restore();
}
function route(c, t, a, b) { routeSeg(c, t, a, b, 0); }
function glyphBulb(c) { c.save(); c.strokeStyle = '#fff'; c.lineWidth = 3.2; c.lineCap = 'round'; c.beginPath(); c.arc(0, -2, 9, -0.6, Math.PI + 0.6); c.stroke(); c.beginPath(); c.moveTo(-4, 8); c.lineTo(4, 8); c.moveTo(-3, 12); c.lineTo(3, 12); c.stroke(); c.restore(); }
function glyphBook(c) { c.save(); c.strokeStyle = '#fff'; c.lineWidth = 3.2; c.lineJoin = 'round'; c.beginPath(); c.moveTo(0, -10); c.quadraticCurveTo(-9, -13, -10, -6); c.lineTo(-10, 9); c.quadraticCurveTo(-9, 12, 0, 10); c.quadraticCurveTo(9, 12, 10, 9); c.lineTo(10, -6); c.quadraticCurveTo(9, -13, 0, -10); c.moveTo(0, -10); c.lineTo(0, 10); c.stroke(); c.restore(); }
function glyphCoin(c) { c.save(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.stroke(); c.font = '700 13px "Archivo", sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText('₹', 0, 5); c.restore(); }
function glyphFlag(c) { c.save(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); c.moveTo(-3, 11); c.lineTo(-3, -10); c.stroke(); c.beginPath(); c.moveTo(-3, -10); c.lineTo(9, -6.5); c.lineTo(-3, -3); c.closePath(); c.stroke(); c.restore(); }
function pin(c, x, y, p, glyph, active, t) {
  if (p <= 0) return; const s = ez.back(clamp(p), 2.2);
  c.save(); c.translate(x, y); c.scale(s, s);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 54);
  g.addColorStop(0, 'rgba(224,19,48,0.5)'); g.addColorStop(1, 'rgba(224,19,48,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 54, 0, 7); c.fill();
  c.fillStyle = C.pin; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, 25, 0, 7); c.fill(); c.stroke();
  glyph(c);
  if (active) { c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 34 + 3 * Math.sin(t * 3.2), 0, 7); c.stroke(); }
  c.restore();
}
function stageLabel(c, x, y, n, sub, p, side = 1) {
  if (p <= 0) return; c.save(); const e = ez.outExpo(clamp(p));
  c.globalAlpha = Math.min(1, p * 1.4); c.translate((1 - e) * 20 * side, 0);
  c.font = SERIF(36, 700); c.letterSpacing = '1px'; c.fillStyle = C.cream; c.textAlign = side > 0 ? 'left' : 'right';
  c.fillText('Stage ' + n, x, y);
  c.font = ITAL(23); c.letterSpacing = '0px'; c.fillStyle = 'rgba(246,242,233,0.78)';
  c.fillText(sub, x, y + 32); c.restore();
}

// ---------- crimson splash wipe + AI image scenes (B-roll) ----------
const SPLASH = {};
function blobPts(seed) {
  if (SPLASH[seed]) return SPLASH[seed];
  const r = CM.rng(seed), n = 14, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([a, 0.74 + 0.26 * r()]); }
  SPLASH[seed] = pts; return pts;
}
function drawBlob(c, seed, grow, cx, cy, R, t) {
  const pts = blobPts(seed), n = pts.length, e = ez.inout3(grow), s = 0.08 + 0.92 * e;
  const rot = (CM.hash(seed) % 628) / 100 + e * 0.2;
  c.save(); c.translate(cx, cy); c.rotate(rot); c.scale(s, s);
  const V = pts.map(([a, f]) => [R * f * Math.cos(a), R * f * Math.sin(a)]);
  const mid = (i, j) => [(V[i][0] + V[j][0]) / 2, (V[i][1] + V[j][1]) / 2];
  c.beginPath(); const m0 = mid(0, 1); c.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) { const a = V[i % n], m = mid(i % n, (i + 1) % n); c.quadraticCurveTo(a[0], a[1], m[0], m[1]); }
  c.restore();
}
function compositeEx(ctx, t, SCENES, CUTS, background) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  background(ctx, t);
  let idx = 0; for (const cut of CUTS) if (t >= cut.t) idx++;
  const cut = CUTS.find((c) => t >= c.t && t < c.t + c.d);
  if (!cut) { ctx.drawImage(sceneLayer(LA, SCENES[idx], t), 0, 0); return; }
  const A = sceneLayer(LA, SCENES[idx - 1], t), B = sceneLayer(LB, SCENES[idx], t);
  const u = (t - cut.t) / cut.d;
  if (cut.type === 'splash') {
    ctx.drawImage(A, 0, 0);
    ctx.save(); drawBlob(ctx, cut.seed, u, 640, 360, 1120, t); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    const fade = u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
    if (fade > 0) { ctx.save(); drawBlob(ctx, cut.seed, u, 640, 360, 1120, t);
      ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = C.pin; ctx.lineWidth = 8 + 60 * (1 - u);
      ctx.shadowColor = 'rgba(224,19,48,0.9)'; ctx.shadowBlur = 18 + 60 * (1 - u); ctx.stroke();
      ctx.globalAlpha = 0.95 * fade; ctx.lineWidth = 3 + 10 * (1 - u); ctx.strokeStyle = '#ff2547'; ctx.shadowBlur = 26; ctx.stroke(); ctx.restore(); }
  } else {
    const e = ez.inout3(u), dir = cut.dir || 1, sc = 1 - 0.05 * Math.sin(Math.PI * u);
    for (const [L, off] of [[A, -e * W * dir], [B, (1 - e) * W * dir]]) { ctx.save(); ctx.translate(640 + off, 360); ctx.scale(sc, sc); ctx.drawImage(L, -640, -360); ctx.restore(); }
  }
}
const IMG = { desk: null, life: null };
function loadImgs() {
  const src = window.__IMG_SRC || {};
  return Promise.all(Object.keys(IMG).map((k) => new Promise((res) => {
    if (!src[k]) return res();
    const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => res(); im.src = src[k];
  })));
}
function glowWord(c, s, x, y, t0, t, col) {
  if (t < t0) return textW(c, s, SERIF(92, 700));
  const w = textW(c, s, SERIF(92, 700)), e = ez.outExpo(span(t, t0, t0 + 0.55));
  c.save(); c.beginPath(); c.rect(x - 16, y - 96, w + 32, 122); c.clip();
  c.globalAlpha = Math.min(1, e * 1.5); c.font = SERIF(92, 700); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.shadowColor = 'rgba(240,169,82,0.6)'; c.shadowBlur = 38; c.fillStyle = col;
  c.fillText(s, x, y + (1 - e) * 26); c.restore(); return w;
}
function imageScene(c, t, img, K, seed, tagText, words, subText) {
  c.save(); c.fillStyle = C.bg; c.fillRect(0, 0, W, HH);
  if (img) {
    const z = 1.12 + 0.08 * ez.inout3(span(t, K.t0 - 0.7, TL.D));
    const iw = img.width, ih = img.height, s = Math.max(W / iw, HH / ih) * z;
    const rx = iw * s - W, ry = ih * s - HH;
    const ox = lerp(0.4, 0.6, 0.5 + 0.5 * noise1(seed + 'x')(t * 0.045)) * rx;
    const oy = lerp(0.4, 0.6, 0.5 + 0.5 * noise1(seed + 'y')(t * 0.045)) * ry;
    c.drawImage(img, -ox, -oy, iw * s, ih * s);
    c.fillStyle = 'rgba(12,9,9,0.3)'; c.fillRect(0, 0, W, HH);
    const g = c.createRadialGradient(640, 330, 0, 640, 330, 880);
    g.addColorStop(0, 'rgba(122,13,24,0.08)'); g.addColorStop(1, 'rgba(77,8,16,0.45)');
    c.fillStyle = g; c.fillRect(0, 0, W, HH);
    const b = c.createLinearGradient(0, 420, 0, HH);
    b.addColorStop(0, 'rgba(12,9,9,0)'); b.addColorStop(1, 'rgba(12,9,9,0.6)');
    c.fillStyle = b; c.fillRect(0, 420, W, HH - 420);
    const tp = c.createLinearGradient(0, 0, 0, 240);
    tp.addColorStop(0, 'rgba(12,9,9,0.5)'); tp.addColorStop(1, 'rgba(12,9,9,0)');
    c.fillStyle = tp; c.fillRect(0, 0, W, 240);
  }
  tag(c, tagText, 640, 140, K.tag, t);
  const f = SERIF(92, 700), ws = words.map((wd) => ({ s: wd[0], t0: wd[1], col: wd[2] }));
  const widths = ws.map((wd) => textW(c, wd.s, f) + 28);
  let x = 640 - widths.reduce((a, b) => a + b, 0) / 2;
  const y = 400;
  for (let i = 0; i < ws.length; i++) { if (t >= ws[i].t0) { x += glowWord(c, ws[i].s, x, y, ws[i].t0, t, ws[i].col) + 28; } }
  if (t > K.sub) { c.save(); c.globalAlpha = ez.outExpo(span(t, K.sub, K.sub + 0.45)) * 0.88; c.font = MONO(22, 600); c.letterSpacing = '6px'; c.fillStyle = C.cream; c.textAlign = 'center'; c.fillText(subText, 640, 516); c.letterSpacing = '0px'; c.restore(); }
  c.restore();
}
// image scenes for this story: the daily grind, then the real why
function sceneIm1(c, t) { const K = TL.im1; imageScene(c, t, IMG.desk, K, 'kb1', 'THE DAILY GRIND', [['SHOW UP', K.w[0], C.cream], ['EARLY.', K.w[1], C.amber]], 'NOBODY CLAPS ON DAY ONE'); }
function sceneIm2(c, t) { const K = TL.im2; imageScene(c, t, IMG.life, K, 'kb2', 'THE REAL WHY', [['REMEMBER', K.w[0], C.cream], ['THIS.', K.w[1], C.amber]], 'THE PEOPLE YOU ARE DOING IT FOR'); }

// ---------- scene 0: the opening step card ----------
function sceneIntro(c, t) {
  const K = TL.s0;
  c.save(); cam(c, t, 0, 3.4, 1.0, 1.04);
  pillar(c, 305, t, 'pilL', 0.05); pillar(c, 975, t, 'pilR', 0.05);
  const e1 = ez.outExpo(span(t, K.caps, K.caps + 0.5));
  if (e1 > 0) { c.save(); c.globalAlpha = e1 * 0.92; c.font = SERIF(26, 600); c.letterSpacing = '9px'; c.fillStyle = C.cream; c.textAlign = 'center';
    c.fillText('THE ESCAPE BLUEPRINT', 640 + (1 - e1) * 12, 290); c.restore(); }
  const e2 = ez.outExpo(span(t, K.big, K.big + 0.6));
  if (e2 > 0) { c.save(); c.globalAlpha = e2; const s = 0.92 + 0.08 * e2; c.translate(640, 420); c.scale(s, s);
    c.font = SERIF(124, 700); c.fillStyle = C.cream; c.textAlign = 'center';
    c.shadowColor = 'rgba(240,169,82,0.35)'; c.shadowBlur = 44; c.fillText('2027', 0, 0); c.restore(); }
  const e3 = ez.outExpo(span(t, K.sub, K.sub + 0.5));
  if (e3 > 0) { c.save(); c.globalAlpha = e3 * 0.85; c.font = SERIF(20, 600); c.letterSpacing = '6px'; c.fillStyle = 'rgba(246,242,233,0.9)'; c.textAlign = 'center';
    c.fillText('THE RAT RACE EXITS HERE', 640, 496); c.restore(); }
  c.restore();
}

// ---------- scene 1: the full roadmap ----------
function sceneMap(c, t) {
  c.save(); cam(c, t, 3.4, 10.2, 1.0, 1.05);
  redBG(c);
  route(c, t, TL.map.path[0], TL.map.path[1]);
  const K = TL.map, fr = ROAD.cum.map((v) => v / ROAD.total);
  STAGES.forEach((st, i) => {
    const f = fr[[1, 3, 5][i]], hit = span(t, K.path[0] + (K.path[1] - K.path[0]) * f, K.path[0] + (K.path[1] - K.path[0]) * f + 0.25);
    pin(c, st.x, st.y, hit, i === 0 ? glyphBulb : i === 1 ? glyphBook : glyphCoin, t >= K.pins[Math.min(i, 2)] && t < K.pins[Math.min(i, 2)] + 0.9, t);
    const side = i === 2 ? -1 : 1;
    if (hit >= 1) stageLabel(c, st.x + side * 44, st.y - 26, st.n, ['Name your trap', 'Build a paid skill', 'Make it pay twice'][i], span(t, K.pins[i], K.pins[i] + 0.4), side);
  });
  tag(c, 'A 3-STAGE MAP OUT', 640, 96, 6.9, t, C.cream, 'center', 0.6);
  c.restore();
}

// ---------- scene 2: STAGE 1 — name your trap (evidence clipping) ----------
function sceneStage1(c, t) {
  const K = TL.s1;
  c.save(); cam(c, t, 10.2, 16.6, 1.0, 1.04);
  stageHead(c, t, 's1', K.caps, 'STAGE 1 · NAME YOUR TRAP', K.big, 'STAGE 1', 'Name your trap');
  const p = ez.outExpo(span(t, K.card, K.card + 0.55));
  if (p > 0) {
    c.save(); c.translate(920, 500); c.rotate(-0.03); c.translate((1 - p) * 60, (1 - p) * 30); c.globalAlpha = Math.min(1, p * 1.5);
    softCard(c, -210, -105, 420, 210, 14, { shadow: 'rgba(0,0,0,0.5)', blur: 46, offY: 18 });
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(23,19,16,0.08)'; c.lineWidth = 1.5; rr(c, -210, -105, 420, 210, 14); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(23,19,16,0.55)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-180, -75); c.lineTo(180, -75); c.stroke();
    const F = SANS(26, 800), w480 = textW(c, '480', F);
    c.font = F; c.fillStyle = C.ink; c.textAlign = 'left';
    const hp = span(t, K.hi, K.hi + 0.4);
    if (hp > 0) { c.save(); c.rotate(-0.012); c.fillStyle = C.hi; rr(c, -151, -74, (w480 + 16) * ez.out3(hp), 34, 4); c.fill(); c.restore(); }
    c.fillText('480 paydays.', -145, -46);
    c.font = SANS(24, 800); c.fillText('A whole career, one salary.', -145, -8);
    c.font = ITAL(19); c.fillStyle = 'rgba(23,19,16,0.78)';
    c.fillText('One customer. One raise a year —', -145, 38);
    c.fillText('and only if you ask nicely.', -145, 62);
    if (t > K.note) { c.save(); c.globalAlpha = ez.outExpo(span(t, K.note, K.note + 0.4)); c.font = MONO(11.5, 600); c.letterSpacing = '1px'; c.fillStyle = 'rgba(23,19,16,0.45)'; c.fillText('MATH: 40 YRS × 12', -145, 90); c.restore(); }
    c.restore();
  }
  c.restore();
}

// ---------- scene 3: STAGE 2 — build a paid skill (kraft sticky note) ----------
function sceneStage2(c, t) {
  const K = TL.s2;
  c.save(); cam(c, t, 21.2, 27.6, 1.0, 1.04);
  stageHead(c, t, 's2', K.caps, 'STAGE 2 · BUILD A PAID SKILL', K.big, 'STAGE 2', 'Build a paid skill');
  const p = span(t, K.sticky, K.sticky + 0.4);
  if (p > 0) {
    const s = ez.back(clamp(p), 2.0);
    c.save(); c.translate(640, 505); c.rotate(0.03); c.scale(s, s); c.globalAlpha = Math.min(1, p * 2);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 34; c.shadowOffsetY = 16;
    c.fillStyle = C.kraft; rr(c, -175, -85, 350, 170, 10); c.fill(); c.restore();
    c.fillStyle = 'rgba(0,0,0,0.10)'; rr(c, -175, -85, 350, 26, 10); c.fill();
    c.font = SANS(34, 800); c.fillStyle = '#fff'; c.textAlign = 'center';
    c.fillText('1 HR/DAY', 0, 6);
    c.font = MONO(15, 600); c.letterSpacing = '2px'; c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText('→ 365 HRS A YEAR', 0, 44);
    c.font = MONO(11, 600); c.letterSpacing = '3px'; c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('EVERY SINGLE DAY', 0, 72);
    c.restore();
  }
  if (t > K.note) { c.save(); c.globalAlpha = ez.outExpo(span(t, K.note, K.note + 0.4)) * 0.6; c.font = MONO(18, 600); c.letterSpacing = '3px'; c.fillStyle = C.cream; c.textAlign = 'center'; c.fillText('MATH: 365 DAYS × 1 HR', 640, 668); c.restore(); }
  c.restore();
}

// ---------- scene 4: STAGE 3 — make it pay twice (comparison cards) ----------
function duoCard(c, x, y, t0, t, title, sub) {
  const e = ez.outExpo(span(t, t0, t0 + 0.55)); if (e <= 0) return;
  c.save(); c.globalAlpha = e; c.translate(x, y + (1 - e) * 30);
  softCard(c, -170, -88, 340, 176, 14, { shadow: 'rgba(0,0,0,0.5)', blur: 46, offY: 18 });
  c.fillStyle = '#fff'; c.strokeStyle = 'rgba(23,19,16,0.08)'; c.lineWidth = 1.5; rr(c, -170, -88, 340, 176, 14); c.fill(); c.stroke();
  c.font = SANS(28, 800); c.fillStyle = C.ink; c.textAlign = 'center';
  c.fillText(title, 0, -14);
  c.font = ITAL(21); c.fillStyle = 'rgba(23,19,16,0.78)';
  c.fillText(sub, 0, 26);
  c.restore();
}
function sceneStage3(c, t) {
  const K = TL.s3;
  c.save(); cam(c, t, 32.2, 38.6, 1.0, 1.04);
  stageHead(c, t, 's3', K.caps, 'STAGE 3 · MAKE IT PAY TWICE', K.big, 'STAGE 3', 'Make it pay twice');
  duoCard(c, 320, 480, K.cardA, t, 'ONE BOSS', '× one salary, forever');
  duoCard(c, 960, 480, K.cardB, t, '100 CUSTOMERS', '× your own product');
  const x = span(t, K.x, K.x + 0.55);
  if (x > 0) { const sc = Math.max(0.001, ez.back(clamp(x), 1.8));
    c.save(); c.translate(640, 505); c.scale(sc, sc); c.globalAlpha = Math.min(1, x * 2);
    c.font = SANS(64, 800); c.fillStyle = C.amber; c.textAlign = 'center';
    c.shadowColor = 'rgba(240,169,82,0.45)'; c.shadowBlur = 30; c.fillText('×100', 0, 0); c.restore(); }
  if (t > K.note) { c.save(); c.globalAlpha = ez.outExpo(span(t, K.note, K.note + 0.4)) * 0.6; c.font = MONO(18, 600); c.letterSpacing = '3px'; c.fillStyle = C.cream; c.textAlign = 'center'; c.fillText('SAME SKILL × BIGGER AUDIENCE', 640, 668); c.restore(); }
  c.restore();
}

// ---------- scene 5: the finale — last leg of the route + takeaway ----------
function sceneFinale(c, t) {
  const F = TL.s4;
  c.save(); cam(c, t, 43.2, TL.D, 1.0, 1.05);
  redBG(c);
  // the journey so far, as quiet recap dots
  if (t > 43.8) STAGES.forEach((st) => { c.save(); c.globalAlpha = 0.55; c.fillStyle = C.pin; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.5; c.beginPath(); c.arc(st.x, st.y, 16, 0, 7); c.fill(); c.stroke(); c.restore(); });
  // the last leg draws to the flag
  routeSeg(c, t, F.path[0], F.path[1], FLAG_F0);
  pin(c, WP[6][0], WP[6][1], span(t, F.flag, F.flag + 0.3), glyphFlag, t >= F.flag && t < F.flag + 1.1, t);
  // takeaway
  const e = ez.outExpo(span(t, F.take, F.take + 0.5));
  if (e > 0) { c.save(); c.globalAlpha = e; c.font = SERIF(58, 700); c.fillStyle = C.cream; c.textAlign = 'center';
    c.fillText('The exit isn\u2019t luck.', 640, 452 + (1 - e) * 12); c.restore(); }
  if (t > F.w2[0]) { c.save(); const w2 = F.w2;
    const f2 = SERIF(58, 700), it2 = SERIF(58, 700, true);
    const wA = textW(c, 'It\u2019s ', f2), wB = textW(c, 'a ', f2), wC = textW(c, 'map.', it2);
    const x0 = 640 - (wA + wB + wC) / 2, y = 530;
    const pp = span(t, F.pill, F.pill + 0.4);
    if (pp > 0) { c.save(); c.fillStyle = C.hi; rr(c, x0 + wA - 10, y - 44, (wB + wC + 20) * ez.out3(pp), 62, 10); c.fill(); c.restore(); }
    rise(c, 'It\u2019s ', x0, y, f2, C.cream, w2[0], t);
    rise(c, 'a ', x0 + wA, y, f2, pp > 0.55 ? C.ink : C.cream, w2[1], t);
    rise(c, 'map.', x0 + wA + wB, y, it2, pp > 0.55 ? C.ink : C.amber, w2[2], t);
    c.restore(); }
  if (t > F.note) { c.save(); c.globalAlpha = ez.outExpo(span(t, F.note, F.note + 0.4)) * 0.7; c.font = MONO(20, 600); c.letterSpacing = '6px'; c.fillStyle = C.cream; c.textAlign = 'center'; c.fillText('THE BLUEPRINT · 2027', 640, 640); c.restore(); }
  c.restore();
}

var SCENES = [sceneIntro, sceneMap, sceneStage1, sceneIm1, sceneStage2, sceneStage3, sceneIm2, sceneFinale];
function explainer(ctx, t) {
  compositeEx(ctx, t, SCENES, CUTS, background);
  grain(ctx, t);
  vignette(ctx);
}

// =================================== SOUND SCORE ===================================
// Dark and cinematic: a low drone under the intro, a warm minor pad once the map appears, pin booms that
// climb, a marker swipe on every highlighter, a stamp on the sticky note and the final line, ticks counting
// the ×100, and a soft chord landing under "It's a map."
function scoreSound(k) {
  { const k0 = k, G = 1.9; k = Object.assign({}, k0, { voice: (t, p) => k0.voice(t, Object.assign({}, p, { gain: (p.gain == null ? 0.3 : p.gain) * G })), hiss: (t, p) => k0.hiss(t, Object.assign({}, p, { gain: (p.gain == null ? 0.3 : p.gain) * G })), play: (n, t, o = {}) => k0.play(n, t, Object.assign({}, o, { gain: (o.gain == null ? 1 : o.gain) * G })) }); }
  const A = TL.s0, M = TL.map, S1 = TL.s1, I1 = TL.im1, S2 = TL.s2, S3 = TL.s3, I2 = TL.im2, F = TL.s4;
  padBed(k, 3.8, 48.8, { bpm: 76, gain: 0.9, cut: 1150, chords: [['A2', 'C3', 'E3'], ['F2', 'A2', 'C3'], ['C3', 'E3', 'G3'], ['G2', 'B2', 'D3']], hats: [12.0, 22.2, 33.4, 44.4] });
  // intro
  k.drone(0, 3.6, { note: 'A1', gain: 0.8 });
  k.play('whoosh', 0.05, { dur: 0.5, gain: 0.3, dir: 1, top: 1600 });
  k.voice(A.caps, { f: 'E4', dur: 1.6, gain: 0.04, a: 0.02, verb: 0.4 });
  k.play('boom', A.big, { gain: 0.5 });
  // scene cuts: whoosh on every cut, a deep boom under each splash
  CUTS.forEach((cut, i) => { k.play('whoosh', cut.t - 0.15, { dur: 0.5, gain: 0.4, dir: i % 2 ? -1 : 1, top: 2000 }); if (cut.type === 'splash') k.play('boom', cut.t + 0.02, { gain: 0.5 }); });
  // map: route draw + three pin booms, climbing
  k.drone(3.8, 10.0, { note: 'F1', gain: 0.55 });
  k.hiss(M.path[0], { color: 'pink', dur: M.path[1] - M.path[0], filter: 'bandpass', ff: [[0, 500], [1.6, 2400]], q: 1, gain: 0.05, a: 0.5, soft: true });
  M.pins.forEach((t, i) => { k.play('boom', t, { gain: 0.42 - i * 0.04 }); k.voice(t + 0.02, { f: ['E5', 'A5', 'C#6'][i], dur: 0.9, gain: 0.05, a: 0.003, verb: 0.45 }); k.voice(t + 0.08, { f: ['E4', 'A4', 'C#5'][i], dur: 0.8, gain: 0.035, a: 0.01, verb: 0.4 }); });
  k.play('ping', 6.9, { gain: 0.4 });
  // stage 1
  k.play('boom', S1.big, { gain: 0.4 });
  k.play('pop', S1.card, { f: 560, gain: 0.45, pan: 0.3 });
  k.play('marker', S1.hi, { dur: 0.36, gain: 0.9, pan: 0.3 });
  k.play('tick', S1.note, { f: 3000, gain: 0.3, soft: true });
  // image scene 1: the daily grind
  k.voice(I1.tag, { f: 'E4', dur: 1.2, gain: 0.04, a: 0.02, verb: 0.4 });
  I1.w.forEach((tw, j) => { k.play('tick', tw, { f: 2200 + j * 300, gain: 0.3, soft: true }); k.voice(tw, { f: ['E5', 'A5'][j], dur: 0.8, gain: 0.05, a: 0.003, verb: 0.45 }); });
  k.play('marker', I1.sub, { dur: 0.3, gain: 0.6 });
  // stage 2
  k.play('boom', S2.big, { gain: 0.4 });
  k.play('stamp', S2.sticky, { gain: 0.55 });
  k.play('shimmer', S2.sticky + 0.25, { gain: 0.5 });
  k.play('tick', S2.note, { f: 3000, gain: 0.3, soft: true });
  // stage 3
  k.play('pop', S3.cardA, { f: 520, gain: 0.45, pan: -0.4 });
  k.play('pop', S3.cardB, { f: 760, gain: 0.45, pan: 0.4 });
  for (let i = 1; i <= 6; i++) k.play('tick', S3.x + (i / 6) * 0.5, { f: 2000 + i * 180, gain: 0.32, soft: true });
  k.play('boom', S3.x + 0.55, { gain: 0.5 });
  // image scene 2: the real why
  k.voice(I2.tag, { f: 'A4', dur: 1.2, gain: 0.04, a: 0.02, verb: 0.4 });
  I2.w.forEach((tw, j) => { k.play('tick', tw, { f: 2200 + j * 300, gain: 0.3, soft: true }); k.voice(tw, { f: ['E5', 'A5'][j], dur: 0.8, gain: 0.05, a: 0.003, verb: 0.45 }); });
  k.play('marker', I2.sub, { dur: 0.3, gain: 0.6 });
  // finale
  k.drone(43.4, 49.0, { note: 'F1', gain: 0.6 });
  k.hiss(F.path[0], { color: 'pink', dur: F.path[1] - F.path[0], filter: 'bandpass', ff: [[0, 500], [1.1, 2200]], q: 1, gain: 0.05, a: 0.4, soft: true });
  k.play('boom', F.flag, { gain: 0.45 });
  k.play('ping', F.flag + 0.15, { gain: 0.5 });
  k.play('marker', F.pill, { dur: 0.3, gain: 0.7 });
  ['A3', 'E4', 'A4', 'C#5'].forEach((n, i) => k.voice(F.pill + 0.2 + i * 0.07, { f: n, dur: 2.2, gain: 0.05, a: 0.01, verb: 0.5, pan: (i - 1.5) * 0.2 }));
  k.play('stamp', F.note, { gain: 0.5 });
}

