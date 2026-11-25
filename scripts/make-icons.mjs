// Regenerates the install icons in public/icons/ from the game's own art (Jonh and the cannon).
//   CHROME=/path/to/chrome node scripts/make-icons.mjs
// Uses Vite to load the TypeScript art modules and a headless Chromium (over raw CDP, no extra packages)
// to rasterize the SVGs. Run it only when the art or palette changes; the PNGs are committed.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const chrome = process.env.CHROME;
if (!chrome) throw new Error('Set CHROME to a Chromium/Chrome executable.');
const port = Number(process.env.CDP_PORT ?? 9233);
const outDir = new URL('../public/icons/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { PAL } = await vite.ssrLoadModule('/src/art/palette.ts');
const { outfitFigureSvg } = await vite.ssrLoadModule('/src/art/outfitArt.ts');
const { cannonFigureSvg } = await vite.ssrLoadModule('/src/art/cannonArt.ts');
await vite.close();

/** Sky, hills and ground with Jonh in his chair and the cannon, in a 100 × 100 box. `inset` shrinks the scene for maskable icons. */
function iconSvg(inset) {
  const jonh = outfitFigureSvg('cardigan', 'boater').replace('<svg ', '<svg x="38" y="22" width="56" height="56" ');
  const cannon = cannonFigureSvg(0xff4444, 'solid', 34).replace('<svg ', '<svg x="-2" y="40" width="54" height="44" ');
  const scene = `
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAL.skyTop}"/><stop offset="1" stop-color="${PAL.skyLow}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#sky)"/>
    <circle cx="80" cy="18" r="9" fill="${PAL.sun}"/>
    <path d="M0 70 Q22 58 44 68 T100 64 V100 H0 Z" fill="${PAL.hillMid}"/>
    <rect y="80" width="100" height="20" fill="${PAL.grass}"/>
    <path d="M0 80 H100" stroke="${PAL.ink}" stroke-width="2.2"/>
    ${cannon}${jonh}`;
  const scale = inset ? 0.74 : 1;
  const offset = (100 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${PAL.skyTop}"/><g transform="translate(${offset} ${offset}) scale(${scale})">${scene}</g></svg>`;
}

const profile = mkdtempSync(join(tmpdir(), 'hit-jonh-icons-'));
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chromium did not start.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => { const msg = JSON.parse(event.data); pending.get(msg.id)?.(msg); };
  const send = (method, params = {}) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });

  const render = async (svg, size, file) => {
    await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    const html = `<!doctype html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body>`;
    await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
    await new Promise(resolve => setTimeout(resolve, 400));
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    writeFileSync(join(outDir, file), Buffer.from(shot.result.data, 'base64'));
    console.log(`wrote public/icons/${file}`);
  };
  await send('Page.enable');
  writeFileSync(join(outDir, 'icon.svg'), `${iconSvg(false)}\n`);
  await render(iconSvg(false), 192, 'icon-192.png');
  await render(iconSvg(false), 512, 'icon-512.png');
  await render(iconSvg(true), 512, 'icon-maskable-512.png');
  await render(iconSvg(false), 180, 'apple-touch-icon.png');
  ws.close();
} finally {
  proc.kill();
}
