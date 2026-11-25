import { MULTIPLAYER } from '../config/tuning';
import { PAL, PLAYER_PALETTES, cssColor, playerDisplayColor, playerPalette, type PlayerPalette } from './palette';
import type { CannonSkinId } from '../rules/cosmetics';
import { CANNON_THEMES, type CannonTheme } from './cannonSkins';
import { INK, ink, svgDoc, type ArtDef } from './svgKit';

const CLASSIC = CANNON_THEMES.classic;

/** Barrel pivot sits at (20, 17); the barrel points along +x; the muzzle face is at x = 82. */
function barrelBody(paint: string | null, pattern: string, clipId: string, t: CannonTheme['barrel'] = CLASSIC.barrel): string {
  const band = paint ? `<clipPath id="${clipId}"><path d="M26 6.5 L48 7.5 L48 26.5 L26 27.5 Z"/></clipPath>
    <g clip-path="url(#${clipId})"><rect x="20" y="0" width="34" height="34" fill="${paint}"/>${patternSvg(pattern)}</g>` : '';
  const outline = 'M11 6 L66 8.5 L68 6 L84 5.5 L84 28.5 L68 28 L66 25.5 L11 28 Q9 17 11 6 Z';
  const decal = t.decal ? `<clipPath id="${clipId}-d"><path d="${outline}"/></clipPath><g clip-path="url(#${clipId}-d)">${t.decal}</g>` : '';
  return `
      <circle cx="7" cy="17" r="5" fill="${t.breech}" ${ink(2.6)}/>
      <path d="${outline}" fill="${t.body}"/>
      <path d="M11 21 L66 21 L68 20 L84 21 L84 28.5 L68 28 L66 25.5 L11 28 Z" fill="${t.shade}"/>
      ${band}
      ${decal}
      <path d="M14 10 L64 11.5" stroke="${t.light}" stroke-width="3" stroke-linecap="round"/>
      <path d="M78 8 L82 8" stroke="${PAL.paper}" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="17" y="5" width="6" height="24" rx="2" fill="${t.ring}" ${ink(2)}/>
      <rect x="49" y="6.5" width="5" height="21" rx="2" fill="${t.ring}" ${ink(2)}/>
      <rect x="70" y="4.5" width="6" height="25" rx="2" fill="${t.ring}" ${ink(2)}/>
      <path d="${outline}" fill="none" ${INK}/>
      <ellipse cx="84" cy="17" rx="2.6" ry="10.5" fill="${PAL.ink}"/>`;
}

function barrel(key: string, paint: string | null, pattern: string): ArtDef {
  return { key, w: 92, h: 34, ax: 20, ay: 17, scale: 3, svg: svgDoc(92, 34, barrelBody(paint, pattern, 'paint')) };
}

function patternSvg(pattern: string): string {
  const white = PAL.paper;
  if (pattern === 'stripes') return [24, 32, 40, 48].map(x => `<path d="M${x} 0 L${x + 6} 34" stroke="${white}" stroke-width="3.2"/>`).join('');
  if (pattern === 'dots') return [[30, 12], [38, 20], [44, 11], [32, 24], [45, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${white}"/>`).join('');
  if (pattern === 'checks') return [0, 1, 2, 3, 4, 5].flatMap(c => [0, 1, 2, 3, 4].map(r => (c + r) % 2 ? '' : `<rect x="${24 + c * 5}" y="${4 + r * 6}" width="5" height="6" fill="${white}"/>`)).join('');
  return '';
}

/** A player's barrel texture, painted in the chosen palette (the standard palette keeps the original keys). */
export function barrelKey(color: number | null, pattern: string | null, palette: PlayerPalette = playerPalette()): string {
  if (color === null) return 'cannon-barrel';
  return `cannon-barrel-${palette === 'standard' ? '' : `${palette}-`}${color.toString(16)}-${pattern ?? 'solid'}`;
}

function carriageBody(t: CannonTheme['carriage'] = CLASSIC.carriage): string {
  return `
    <path d="M6 40 L22 12 Q26 4 34 4 L52 4 Q58 4 60 10 L70 40 Z" fill="${t.body}"/>
    <path d="M52 4 Q58 4 60 10 L70 40 L58 40 L50 12 Z" fill="${t.shade}" opacity="0.55"/>
    <path d="M16 30 L62 30" stroke="${t.line}" stroke-width="2" opacity="0.6"/>
    ${t.decal}
    <circle cx="32" cy="14" r="2.2" fill="${t.stud}" ${ink(1.2)}/><circle cx="50" cy="14" r="2.2" fill="${t.stud}" ${ink(1.2)}/>
    <path d="M6 40 L22 12 Q26 4 34 4 L52 4 Q58 4 60 10 L70 40 Z" fill="none" ${INK}/>
    <circle cx="40" cy="8" r="6" fill="${t.hub}" ${ink(2.4)}/>`;
}
const CARRIAGE_BODY = carriageBody();

function wheelBody(t: CannonTheme['wheel'] = CLASSIC.wheel): string {
  return `
    <circle cx="22" cy="22" r="19" fill="${t.rim}" ${INK}/>
    <circle cx="22" cy="22" r="13.5" fill="${t.face}" ${ink(2)}/>
    ${[0, 1, 2, 3, 4, 5].map(i => {
      const a = (i * Math.PI) / 3;
      return `<path d="M22 22 L${(22 + Math.cos(a) * 13).toFixed(2)} ${(22 + Math.sin(a) * 13).toFixed(2)}" stroke="${t.spoke}" stroke-width="3.4" stroke-linecap="round"/>`;
    }).join('')}
    ${t.decal}
    <circle cx="22" cy="22" r="5" fill="${t.hub}" ${ink(2)}/>
    <path d="M10 12 A16 16 0 0 1 22 6" stroke="${t.light}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
}
const WHEEL_BODY = wheelBody();

function carriageArt(key: string, t?: CannonTheme['carriage']): ArtDef {
  return { key, w: 80, h: 42, ax: 40, ay: 8, scale: 3, svg: svgDoc(80, 42, t ? carriageBody(t) : CARRIAGE_BODY) };
}
function wheelArt(key: string, t?: CannonTheme['wheel']): ArtDef {
  return { key, w: 44, h: 44, ax: 22, ay: 22, scale: 3, svg: svgDoc(44, 44, t ? wheelBody(t) : WHEEL_BODY) };
}

/** Texture keys of one cannon skin (classic reuses the original keys). */
export function cannonSkinKeys(skin: CannonSkinId): { barrel: string; carriage: string; wheel: string } {
  return skin === 'classic'
    ? { barrel: 'cannon-barrel', carriage: 'cannon-carriage', wheel: 'cannon-wheel' }
    : { barrel: `cannon-barrel-skin-${skin}`, carriage: `cannon-carriage-skin-${skin}`, wheel: `cannon-wheel-skin-${skin}` };
}

let figureCount = 0;

export function cannonArt(): ArtDef[] {
  const defs: ArtDef[] = [barrel('cannon-barrel', null, 'solid'), carriageArt('cannon-carriage'), wheelArt('cannon-wheel')];
  for (const [skin, theme] of Object.entries(CANNON_THEMES) as [CannonSkinId, CannonTheme][]) {
    if (skin === 'classic') continue;
    const keys = cannonSkinKeys(skin);
    defs.push(
      { key: keys.barrel, w: 92, h: 34, ax: 20, ay: 17, scale: 3, svg: svgDoc(92, 34, barrelBody(null, 'solid', `paint-${skin}`, theme.barrel)) },
      carriageArt(keys.carriage, theme.carriage),
      wheelArt(keys.wheel, theme.wheel),
    );
  }
  for (const palette of PLAYER_PALETTES) {
    for (const color of MULTIPLAYER.colors) {
      for (const pattern of MULTIPLAYER.patterns) {
        defs.push(barrel(barrelKey(color, pattern, palette), cssColor(playerDisplayColor(color, palette)), pattern));
      }
    }
  }
  return defs;
}

/**
 * The whole cannon as inline SVG for HTML menus, assembled like CannonRenderer (pivot at the origin).
 * Each call gets its own clip-path id, so several figures can share a page.
 */
export function cannonFigureSvg(color: number, pattern: string, angleDeg = 38): string {
  const clipId = `cannon-paint-${++figureCount}`;
  return `<svg viewBox="-50 -66 136 108" aria-hidden="true" class="cannon-figure">
    <ellipse cx="0" cy="36" rx="38" ry="5" fill="${PAL.ink}" opacity=".18"/>
    <g transform="translate(-40 -8)">${CARRIAGE_BODY}</g>
    <g transform="rotate(${-angleDeg}) translate(-20 -17)">${barrelBody(cssColor(playerDisplayColor(color)), pattern, clipId)}</g>
    <g transform="translate(-28 -10)">${WHEEL_BODY}</g>
  </svg>`;
}

/** A cannon wearing `skin`, as inline SVG for the wardrobe (solo look: no player colour band). */
export function cannonSkinFigureSvg(skin: CannonSkinId, angleDeg = 32): string {
  const t = CANNON_THEMES[skin];
  const clipId = `cannon-skin-${skin}-${++figureCount}`;
  return `<svg viewBox="-50 -66 136 108" aria-hidden="true" class="cannon-figure">
    <ellipse cx="0" cy="36" rx="38" ry="5" fill="${PAL.ink}" opacity=".18"/>
    <g transform="translate(-40 -8)">${carriageBody(t.carriage)}</g>
    <g transform="rotate(${-angleDeg}) translate(-20 -17)">${barrelBody(null, 'solid', clipId, t.barrel)}</g>
    <g transform="translate(-28 -10)">${wheelBody(t.wheel)}</g>
  </svg>`;
}
