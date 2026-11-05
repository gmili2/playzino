/**
 * Effets sonores : enregistrements réels (public/sfx, Kenney CC0) joués avec Web Audio, plusieurs prises par son
 * pour éviter la répétition. Tant qu'un enregistrement n'est pas décodé (ou si le navigateur ne lit pas l'OGG),
 * le son synthétisé d'origine est joué à la place.
 * Un seul AudioContext pour tout le site, créé au premier son (après un geste de l'utilisateur).
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    loadSamples(ctx);
    return ctx;
  } catch {
    return null; // audio indisponible
  }
}

/** Nombre de prises par son : public/sfx/<nom>-1.ogg … <nom>-N.ogg. */
const SAMPLES = { shake: 3, dice: 4, move: 3, exit: 2, capture: 4, drop: 3, home: 1, sticker: 2, click: 3, select: 2, turn: 2, coins: 1, win: 1, lose: 1 } as const;
type Sample = keyof typeof SAMPLES;
const buffers = new Map<Sample, AudioBuffer[]>();
let samplesRequested = false;

function loadSamples(a: AudioContext) {
  if (samplesRequested) return;
  samplesRequested = true;
  for (const [name, count] of Object.entries(SAMPLES) as [Sample, number][]) {
    const takes = Array.from({ length: count }, (_, i) =>
      fetch(`${import.meta.env.BASE_URL}sfx/${name}-${i + 1}.ogg`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((b) => a.decodeAudioData(b))
    );
    Promise.all(takes).then((list) => buffers.set(name, list)).catch(() => undefined); // reste en synthèse
  }
}

/** Décode les enregistrements à l'avance (écran de partie) pour que le premier son soit déjà réaliste. */
export function preloadSfx() {
  audio();
}

/** Joue une prise au hasard, légèrement variée en hauteur ; false si l'enregistrement n'est pas disponible. */
function sample(name: Sample, { gain = 0.9, at = 0, vary = true } = {}): boolean {
  const a = audio();
  const list = buffers.get(name);
  if (!a || !list?.length) return false;
  const src = a.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  // Bruitages légèrement variés en hauteur ; les jingles (mélodies) gardent leur tonalité.
  src.playbackRate.value = vary ? 0.94 + Math.random() * 0.12 : 1;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g).connect(a.destination);
  src.start(a.currentTime + at);
  return true;
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

/**
 * Dés secoués dans la main pendant que le serveur tire le résultat ; renvoie la fonction qui coupe le son
 * (fondu court) au moment où le dé est lancé.
 */
export function diceShake(): () => void {
  const a = audio();
  const list = buffers.get('shake');
  if (!a || !list?.length) return () => undefined;
  const src = a.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  src.loop = true;
  const g = a.createGain();
  g.gain.value = 0.8;
  src.connect(g).connect(a.destination);
  src.start();
  return () => {
    const t = a.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.stop(t + 0.1);
  };
}

/** Choc franc d'un pion qui tombe sur un autre : enregistrement doublé d'un coup grave. */
function hit() {
  sample('capture', { gain: 1 });
  knock(70, { freq: 260, q: 0.9, gain: 0.55 });
  tone(140, 160, { type: 'sine', gain: 0.12, slideTo: 60 });
}

/** Souffle descendant : le pion mangé repart à sa base. */
function whoosh(at = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + at;
  const len = Math.ceil(a.sampleRate * 0.35);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2.5;
  f.frequency.setValueAtTime(2800, t0);
  f.frequency.exponentialRampToValueAtTime(350, t0 + 0.35);
  const g = a.createGain();
  g.gain.value = 0.35;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Dé qui roule : une série de chocs de plus en plus espacés. */
  dice() {
    if (sample('dice')) return;
    let at = 0;
    for (let i = 0; i < 7; i++) {
      knock(28, { at, freq: 1400 + Math.random() * 1600, gain: 0.3 - i * 0.025 });
      at += 0.045 + i * 0.012;
    }
  },
  /** Pion qui avance : petit « toc » de bois puis un léger glissé. */
  move() {
    if (sample('move')) return;
    knock(40, { freq: 900, q: 3, gain: 0.35 });
    tone(520, 90, { type: 'triangle', gain: 0.05, at: 0.02, slideTo: 700 });
  },
  /** Pion qui sort de sa base. */
  exit() {
    if (sample('exit')) return;
    tone(392, 90, { type: 'triangle', gain: 0.07 });
    tone(587, 130, { type: 'triangle', gain: 0.07, at: 0.08 });
  },
  /** J'ai mangé un pion : choc, le pion adverse renvoyé à sa base, puis petite fanfare. */
  capture() {
    hit();
    whoosh(0.1);
    [659, 880, 1175].forEach((f, i) => tone(f, 160, { type: 'triangle', gain: 0.08, at: 0.42 + i * 0.09 }));
    tone(1568, 320, { type: 'sine', gain: 0.05, at: 0.69 });
  },
  /** Mon pion a été mangé : même choc, puis « wah-wah » descendant. */
  captured() {
    hit();
    whoosh(0.1);
    tone(392, 260, { type: 'sawtooth', gain: 0.045, at: 0.42, slideTo: 330 });
    tone(330, 520, { type: 'sawtooth', gain: 0.045, at: 0.7, slideTo: 196 });
  },
  /** Pion arrivé à la maison : arpège montant. */
  home() {
    if (sample('move') && sample('home', { gain: 0.7, at: 0.12 })) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 180, { type: 'triangle', gain: 0.07, at: i * 0.08 }));
  },
  /** Jeton de Puissance 4 qui tombe. */
  drop() {
    if (sample('drop')) return;
    tone(500, 140, { type: 'sine', gain: 0.07, slideTo: 220 });
    knock(35, { at: 0.12, freq: 700, q: 2, gain: 0.3 });
  },
  /** Fanfare de victoire (jingle Kenney « steel drums », mélodie montante). */
  win() {
    if (sample('win', { gain: 0.8, vary: false })) return;
    [523, 659, 784].forEach((f, i) => tone(f, 160, { type: 'square', gain: 0.045, at: i * 0.12 }));
    tone(1047, 600, { type: 'square', gain: 0.05, at: 0.36 });
    tone(784, 600, { type: 'triangle', gain: 0.05, at: 0.36 });
  },
  /** Défaite (même jingle, mélodie descendante). */
  lose() {
    if (sample('lose', { gain: 0.8, vary: false })) return;
    [392, 330, 262].forEach((f, i) => tone(f, i === 2 ? 520 : 220, { type: 'triangle', gain: 0.07, at: i * 0.22 }));
  },
  /** Sticker reçu ou envoyé : petit « pop ». */
  sticker() {
    if (sample('sticker', { gain: 0.7 })) return;
    tone(660, 120, { type: 'sine', gain: 0.07, slideTo: 990 });
  },
  /** Clic d'un bouton de l'interface (discret). */
  click() {
    if (sample('click', { gain: 0.35 })) return;
    knock(12, { freq: 2400, q: 3, gain: 0.15 });
  },
  /** Pion choisi : petit « pop ». */
  select() {
    if (sample('select', { gain: 0.7 })) return;
    tone(880, 60, { type: 'sine', gain: 0.06, slideTo: 1320 });
  },
  /** C'est à mon tour de jouer. */
  turn() {
    if (sample('turn', { gain: 0.6 })) return;
    tone(660, 120, { type: 'sine', gain: 0.06 });
    tone(990, 160, { type: 'sine', gain: 0.06, at: 0.1 });
  },
  /** Pièces reçues (gain d'une partie, roue, mission). */
  coins() {
    if (sample('coins', { gain: 0.8 })) return;
    [1568, 2093, 2637].forEach((f, i) => tone(f, 90, { type: 'sine', gain: 0.05, at: i * 0.06 }));
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

/* ---------- Clics de l'interface ---------- */

let muted = false;
/** Son coupé par le joueur (réglage du profil, ou bouton haut-parleur pendant une partie). */
export function setMuted(m: boolean) {
  muted = m;
}

const CLICKABLE = 'button, a.pb-btn, a.rl-pill, a.rl-menu-item, [role="tab"]';
/**
 * Un « clic » discret sur chaque bouton du site, posé une seule fois sur le document.
 * Exclus : boutons désactivés, pions et dé (ils ont leurs propres sons) et tout élément marqué data-nosfx.
 */
export function installClickSound() {
  const onClick = (e: MouseEvent) => {
    if (muted) return;
    const el = (e.target as Element | null)?.closest?.(CLICKABLE);
    if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-nosfx], [data-testid^="pawn-"]')) return;
    sfx.click();
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
