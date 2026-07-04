/* Synthesizes the full music + SFX bed for the promo into sfxmusic.wav (stereo 44.1k). */
const fs = require('fs');
const SR = 44100, DUR = 53.5;
const N = Math.round(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);

function addTone(at, dur, freq, vol, opts = {}) {
  const { type = 'sine', decay = 4, attack = 0.004, pan = 0, slide = 1, harm = 0 } = opts;
  const s0 = Math.round(at * SR), n = Math.round(dur * SR);
  const gl = Math.SQRT1_2 * (1 - pan * 0.7), gr = Math.SQRT1_2 * (1 + pan * 0.7);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = i / n;
    const f = freq * Math.pow(slide, u);
    phase += 2 * Math.PI * f / SR;
    let v = Math.sin(phase);
    if (harm) v += harm * Math.sin(2 * phase) + harm * 0.5 * Math.sin(3 * phase);
    if (type === 'tri') v = 2 / Math.PI * Math.asin(Math.sin(phase));
    const env = Math.min(1, t / attack) * Math.exp(-decay * t) * (1 - u * u);
    const s = v * env * vol;
    const j = s0 + i; if (j < 0 || j >= N) continue;
    L[j] += s * gl; R[j] += s * gr;
  }
}
/* filtered noise burst (whoosh / swish) */
function addNoise(at, dur, vol, opts = {}) {
  const { pan = 0, cut0 = 400, cut1 = 3500, shape = 'updown' } = opts;
  const s0 = Math.round(at * SR), n = Math.round(dur * SR);
  const gl = Math.SQRT1_2 * (1 - pan * 0.7), gr = Math.SQRT1_2 * (1 + pan * 0.7);
  let lp = 0, seed = (at * 9301 + 49297) % 233280;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 116640 - 1; };
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const env = shape === 'updown' ? Math.sin(Math.PI * u) ** 1.5 : Math.exp(-5 * u) * Math.min(1, u * 40);
    const cut = cut0 + (cut1 - cut0) * (shape === 'updown' ? Math.sin(Math.PI * u) : 1 - u);
    const a = Math.min(1, 2 * Math.PI * cut / SR);
    lp += a * (rnd() - lp);
    const s = lp * env * vol;
    const j = s0 + i; if (j < 0 || j >= N) continue;
    L[j] += s * gl; R[j] += s * gr;
  }
}
/* click: pitched blip + tick */
function click(at, freq, vol = 0.4, pan = 0) {
  addTone(at, 0.07, freq, vol, { decay: 30, pan, slide: 0.55, harm: 0.25 });
  addNoise(at, 0.03, vol * 0.35, { pan, shape: 'exp', cut0: 6000, cut1: 6000 });
}
function pop(at, vol = 0.5) {
  addTone(at, 0.16, 340, vol, { decay: 12, slide: 0.45, harm: 0.15 });
}
function whoosh(at, vol = 0.3, pan = 0) { addNoise(at, 0.55, vol, { pan, cut0: 300, cut1: 2600 }); }
function swish(at, vol = 0.22, pan = 0) { addNoise(at, 0.28, vol, { pan, cut0: 900, cut1: 4200 }); }
function ding(at, vol = 0.4) {
  addTone(at, 1.1, 880, vol * 0.8, { decay: 3.5, harm: 0.12 });
  addTone(at, 1.3, 1318.5, vol * 0.5, { decay: 3, });
  addTone(at, 1.5, 440, vol * 0.4, { decay: 2.5 });
}

/* ---------------- music bed ---------------- */
/* 96 bpm, chords C(add9) G Am F, pluck 8th arps + soft pad + bass */
const BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4;
const chords = [
  [261.63, 329.63, 392.0, 587.33],   // C E G D5
  [196.0, 246.94, 293.66, 392.0],    // G B D G
  [220.0, 261.63, 329.63, 440.0],    // A C E A
  [174.61, 220.0, 261.63, 349.23],   // F A C F
];
const bass = [65.41, 49.0, 55.0, 43.65];
function musicGain(t) {
  const fadeIn = Math.min(1, t / 2.0);
  const fadeOut = t > 50 ? Math.max(0, 1 - (t - 50) / 2.8) : 1;
  return fadeIn * fadeOut;
}
for (let bar = 0; bar * BAR < DUR + 0.1; bar++) {
  const t0 = bar * BAR, ch = chords[bar % 4], g = musicGain(t0);
  if (g <= 0) continue;
  /* pad: soft chord, slow attack */
  for (const f of ch.slice(0, 3)) addTone(t0, BAR * 1.05, f, 0.028 * g, { attack: 0.9, decay: 0.35 });
  /* bass */
  addTone(t0, BAR * 0.9, bass[bar % 4], 0.07 * g, { attack: 0.02, decay: 0.8, harm: 0.1 });
  /* pluck arp on 8ths */
  const seq = [0, 1, 2, 3, 2, 1, 2, 3];
  for (let e = 0; e < 8; e++) {
    const at = t0 + e * BEAT / 2 + 0.01;
    if (at > 50.5) continue;
    const f = ch[seq[e]] * (seq[e] === 3 ? 1 : 2);
    addTone(at, 0.5, f, 0.045 * g, { decay: 7, pan: (e % 2 ? 0.45 : -0.45), harm: 0.2, attack: 0.003 });
  }
}

/* ---------------- SFX events (absolute seconds) ---------------- */
pop(0.55);
for (const t of [5.9, 13.4, 20.4, 26.9, 33.9, 41.4, 46.9]) whoosh(t);
click(8.6, 900, 0.45); click(12.1, 900, 0.45);                       // A
click(15.0, 700, 0.4); click(15.6, 760, 0.4); click(16.2, 820, 0.4); // d-pad up (rising)
click(16.8, 880, 0.4); click(18.7, 620, 0.4);                        // last up, then down
click(22.0, 500, 0.42, 0.3); click(23.1, 500, 0.42, 0.3); click(24.0, 500, 0.42, 0.3); // RT
click(25.6, 440, 0.42, -0.3);                                        // LT
click(28.5, 600, 0.42, 0.3); swish(28.55, 0.24, 0.4);                // RB + tab slide
click(30.3, 600, 0.42, 0.3); swish(30.35, 0.24, 0.4);
click(32.1, 560, 0.42, -0.3); swish(32.15, 0.24, -0.4);
click(39.65, 1000, 0.45); addTone(39.85, 0.18, 1300, 0.22, { decay: 14, harm: 0.1 }); // R3 + save blip
for (let i = 0; i < 6; i++) click(42.05 + i * 0.22, 950 + i * 40, 0.13); // remap rows tick in
pop(47.35);
ding(48.5, 0.35);

/* ---------------- write WAV ---------------- */
let peak = 0;
for (let i = 0; i < N; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = peak > 0.9 ? 0.9 / peak : 1;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
fs.writeFileSync(require('path').join(__dirname, 'sfxmusic.wav'), buf);
console.log('sfxmusic.wav written, peak', peak.toFixed(3), 'norm', norm.toFixed(3));
