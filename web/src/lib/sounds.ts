/**
 * Effets sonores synthétisés avec Web Audio (aucun fichier à télécharger).
 * Un seul AudioContext pour tout le site, créé au premier son (après un geste de l'utilisateur).
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // audio indisponible
  }
}

interface ToneOpts { type?: OscillatorType; gain?: number; at?: number; slideTo?: number }

/** Note brève avec attaque nette et extinction exponentielle. */
function tone(freq: number, ms: number, { type = 'sine', gain = 0.08, at = 0, slideTo }: ToneOpts = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + ms / 1000);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.02);
}

/** Bruit filtré très court : choc d'un dé ou d'un pion sur le plateau. */
function knock(ms: number, { at = 0, gain = 0.25, freq = 1800, q = 1.2 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + at;
  const len = Math.ceil((a.sampleRate * ms) / 1000);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Dé qui roule : une série de chocs de plus en plus espacés. */
  dice() {
    let at = 0;
    for (let i = 0; i < 7; i++) {
      knock(28, { at, freq: 1400 + Math.random() * 1600, gain: 0.3 - i * 0.025 });
      at += 0.045 + i * 0.012;
    }
  },
  /** Pion qui avance : petit « toc » de bois puis un léger glissé. */
  move() {
    knock(40, { freq: 900, q: 3, gain: 0.35 });
    tone(520, 90, { type: 'triangle', gain: 0.05, at: 0.02, slideTo: 700 });
  },
  /** Pion qui sort de sa base. */
  exit() {
    tone(392, 90, { type: 'triangle', gain: 0.07 });
    tone(587, 130, { type: 'triangle', gain: 0.07, at: 0.08 });
  },
  /** Prise : chute grave. */
  capture() {
    knock(60, { freq: 400, q: 1, gain: 0.4 });
    tone(330, 320, { type: 'sawtooth', gain: 0.05, slideTo: 90 });
  },
  /** Pion arrivé à la maison : arpège montant. */
  home() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 180, { type: 'triangle', gain: 0.07, at: i * 0.08 }));
  },
  /** Jeton de Puissance 4 qui tombe. */
  drop() {
    tone(500, 140, { type: 'sine', gain: 0.07, slideTo: 220 });
    knock(35, { at: 0.12, freq: 700, q: 2, gain: 0.3 });
  },
  /** Fanfare de victoire. */
  win() {
    [523, 659, 784].forEach((f, i) => tone(f, 160, { type: 'square', gain: 0.045, at: i * 0.12 }));
    tone(1047, 600, { type: 'square', gain: 0.05, at: 0.36 });
    tone(784, 600, { type: 'triangle', gain: 0.05, at: 0.36 });
  },
  /** Défaite : trois notes descendantes. */
  lose() {
    [392, 330, 262].forEach((f, i) => tone(f, i === 2 ? 520 : 220, { type: 'triangle', gain: 0.07, at: i * 0.22 }));
  },
  /** Cliquet de la roue quand une case passe sous l'aiguille. */
  tick() {
    knock(18, { freq: 3200, q: 4, gain: 0.35 });
  },
  /** Gain à la roue : carillon. */
  jackpot() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 260, { type: 'sine', gain: 0.07, at: i * 0.09 }));
  }
};

export type Sfx = keyof typeof sfx;
