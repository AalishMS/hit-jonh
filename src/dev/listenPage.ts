// Dev-only listening page (listen.html): play every cue and mix live, nudge each cue's trim by ear, and copy the
// result as an `AUDIO.cueTrimDb` block. The level report (audio-levels.html) measures; this is for the ear.
import { AudioManager, preloadSamples } from '../audio/audioManager';
import { AUDIO, CUE_NAMES, type CueName } from '../config/tuning';
import { ALL, type Case } from './audioCases';

const STORE = 'hitJonh.listen.v1';
const RANGE_DB = 12;

type Offsets = Partial<Record<CueName, number>>;

function loadOffsets(): Offsets {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, unknown>;
    const out: Offsets = {};
    for (const name of CUE_NAMES) {
      const v = raw[name];
      if (typeof v === 'number' && Number.isFinite(v)) out[name] = Math.max(-RANGE_DB, Math.min(RANGE_DB, v));
    }
    return out;
  } catch {
    return {};
  }
}

function saveOffsets(o: Offsets): void {
  try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* private mode: not remembered */ }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)} dB`;

/** The `cueTrimDb` block with the ear's changes, plus a summary of what moved. */
export function trimsSnippet(offsets: Offsets): string {
  const entries = CUE_NAMES.map(name => `${name}: ${round1(AUDIO.cueTrimDb[name] + (offsets[name] ?? 0))}`);
  const lines: string[] = ['cueTrimDb: {'];
  for (let i = 0; i < entries.length; i += 9) lines.push(`  ${entries.slice(i, i + 9).join(', ')},`);
  lines.push('} as Record<CueName, number>,');
  const moved = CUE_NAMES.filter(name => (offsets[name] ?? 0) !== 0)
    .map(name => `// ${name}: ${AUDIO.cueTrimDb[name]} → ${round1(AUDIO.cueTrimDb[name] + offsets[name]!)} (${signed(offsets[name]!)})`);
  return [...lines, ...(moved.length ? moved : ['// nothing changed'])].join('\n');
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function main(): void {
  const audio = new AudioManager();
  const offsets = loadOffsets();
  const status = document.getElementById('status')!;
  const say = (text: string) => { status.textContent = ` ${text}`; };
  let started = false;
  let music = false;
  const timers: number[] = [];

  // The report's wind bed is queued for an offline render; live, it must be refreshed or it fades after a moment.
  audio.windForReport = (accel: number, seconds: number) => {
    const until = performance.now() + seconds * 1000;
    audio.setWindBed(accel);
    const id = window.setInterval(() => {
      if (performance.now() > until) { window.clearInterval(id); audio.setWindBed(null); return; }
      audio.setWindBed(accel);
    }, 100);
    timers.push(id);
  };

  const apply = (name: CueName) => audio.setCueTrimDb(name, AUDIO.cueTrimDb[name] + (offsets[name] ?? 0));
  const start = () => {
    if (started) return true;
    audio.unlock();
    audio.setMusicEnabled(music, false);
    for (const name of CUE_NAMES) apply(name);
    started = true;
    const warn = audio.isMuted ? 'The game is muted in this browser: unmute it in the game first.'
      : audio.volume < 1 ? `Game volume is ${Math.round(audio.volume * 100)}% in this browser; listen at your usual volume.` : 'Ready.';
    say(warn);
    return true;
  };
  const play = (c: Case) => {
    start();
    for (const id of timers.splice(0)) window.clearInterval(id);
    c.play(audio, (t, fn) => { window.setTimeout(fn, t * 1000); });
  };

  const app = document.getElementById('app')!;
  const table = el('table');
  const head = el('tr');
  for (const h of ['Sound', 'Tier', 'Play', 'Trim (by ear)', '']) head.appendChild(el('th', h));
  table.appendChild(head);
  const rows = new Map<CueName, { slider: HTMLInputElement; value: HTMLElement }>();
  for (const name of CUE_NAMES) {
    const tr = el('tr');
    const tier = AUDIO.tiers.find(t => t.cues.includes(name))?.name ?? '';
    const plays = el('td');
    for (const c of ALL.filter(x => x.cue === name)) {
      const b = el('button', c.id.replace(/^[^(]*\(|\)$/g, '').replace(/^.*: /, '') || 'play');
      if (ALL.filter(x => x.cue === name).length === 1) b.textContent = '▶';
      b.title = c.id;
      b.setAttribute('aria-label', `Play ${c.id}`);
      b.addEventListener('click', () => play(c));
      plays.appendChild(b);
    }
    const slider = el('input');
    slider.type = 'range';
    slider.min = String(-RANGE_DB);
    slider.max = String(RANGE_DB);
    slider.step = '0.5';
    slider.value = String(offsets[name] ?? 0);
    slider.setAttribute('aria-label', `${name} trim change`);
    const value = el('span', '', 'val');
    const show = () => {
      const d = offsets[name] ?? 0;
      value.textContent = `${signed(d)} → ${round1(AUDIO.cueTrimDb[name] + d)}`;
      value.classList.toggle('changed', d !== 0);
    };
    slider.addEventListener('input', () => {
      const d = Number(slider.value);
      if (d === 0) delete offsets[name]; else offsets[name] = d;
      saveOffsets(offsets);
      if (started) apply(name);
      show();
    });
    show();
    const sliderCell = el('td');
    sliderCell.appendChild(slider);
    const valueCell = el('td');
    valueCell.appendChild(value);
    tr.append(el('td', name), el('td', tier), plays, sliderCell, valueCell);
    table.appendChild(tr);
    rows.set(name, { slider, value });
  }
  app.appendChild(table);

  app.appendChild(el('h2', 'In context'));
  app.appendChild(el('p', 'Several sounds together as they happen in a game, with the sliders above applied. Music, wind and footsteps are included where the game plays them.'));
  const mixes = el('div');
  for (const c of ALL.filter(x => x.cue === null || x.cue === 'wind' || x.cue === 'music')) {
    const b = el('button', c.id.replace(/^MIX |^EVENT /, ''));
    b.addEventListener('click', () => play(c));
    mixes.appendChild(b);
  }
  app.appendChild(mixes);
  const out = el('textarea');
  out.readOnly = true;
  out.setAttribute('aria-label', 'Trims to paste into AUDIO.cueTrimDb');
  app.append(el('h2', 'Result'), out);
  const refresh = () => { out.value = trimsSnippet(offsets); };
  refresh();
  table.addEventListener('input', refresh);

  document.getElementById('start')!.addEventListener('click', () => start());
  const musicBtn = document.getElementById('music')!;
  musicBtn.addEventListener('click', () => {
    start();
    music = !music;
    audio.setMusicEnabled(music, false);
    musicBtn.textContent = `Music: ${music ? 'on' : 'off'}`;
  });
  document.getElementById('copy')!.addEventListener('click', () => {
    refresh();
    const byHand = () => { out.select(); say('Copy it from the box below.'); };
    if (!navigator.clipboard) { byHand(); return; }
    navigator.clipboard.writeText(out.value).then(() => say('Copied.'), byHand);
  });
  document.getElementById('reset')!.addEventListener('click', () => {
    for (const name of CUE_NAMES) delete offsets[name];
    saveOffsets(offsets);
    for (const [name, r] of rows) { r.slider.value = '0'; r.slider.dispatchEvent(new Event('input', { bubbles: true })); if (started) apply(name); }
    refresh();
    say('Back to the measured trims.');
  });
  (window as unknown as { __LISTEN__: unknown }).__LISTEN__ = { audio, offsets, trimsSnippet };
}

void preloadSamples(`${import.meta.env.BASE_URL}audio/`).then(main, main);
