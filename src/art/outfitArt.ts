import type { OutfitId } from '../rules/cosmetics';
import { JONH_ART } from './jonhArt';
import { PAL } from './palette';
import { RIG } from '../fx/jonhPose';
import { INK, ink, limb, svgDoc, type ArtDef } from './svgKit';

/**
 * Jonh's outfits. Each one redraws the four clothed rig parts (torso, trousers, both arms) on
 * exactly the same canvas size, pivot and silhouette as the cardigan in jonhArt.ts, so every pose in
 * fx/jonhPose.ts works unchanged. The head, face, hat, paper and chair are never touched: the hat
 * stays his signature. Cardigan is the original art under its original keys.
 */
const S = 3;

/** The torso silhouette, the trouser limb and the arm limb shared by every outfit. */
const TORSO_PATH = 'M10 38 C5 26 7 11 15 5 C20 1 28 1 33 5 C41 11 42 26 37 38 Q23 42 10 38 Z';
const TORSO_SHADE = 'M31 6 C39 12 40 26 36.5 37.5 Q32 39.5 28 39.5 C32 28 33 15 31 6 Z';
const LEG_PATH = 'M38 8 L18 9 L17 25';
const ARM_PATH = 'M9 6 L9 20';
const SHOE_PATH = 'M5 29.5 Q5 23.5 12 23.5 L21 23.5 Q24.5 23.5 24.5 28.5 L24.5 32.5 L5 32.5 Z';

interface OutfitSpec {
  /** Torso layers up to the cel shadow, then the pattern drawn clipped to the silhouette, then details on top. */
  torso: { base: string; shade: string; pattern: string; details: string };
  legs: { color: string; dark: string; pattern: string; sock: string; shoe: string; shoeLight: string };
  arm: { front: string; back: string; pattern: string; short: boolean };
}

const clip = (id: string, path: string) => `<clipPath id="${id}"><path d="${path}"/></clipPath>`;

/** A line of dashes across a limb (stripes) or along it (a track stripe). */
const across = (d: string, color: string, width: number, dash: string) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}" stroke-linecap="butt"/>`;
const along = (d: string, color: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;

const diamond = (cx: number, cy: number, hw: number, hh: number, fill: string) =>
  `<path d="M${cx} ${cy - hh} L${cx + hw} ${cy} L${cx} ${cy + hh} L${cx - hw} ${cy} Z" fill="${fill}"/>`;

function argylePattern(): string {
  const out: string[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = 3 + col * 10 + (row % 2) * 5;
      const cy = 5 + row * 10;
      out.push(diamond(cx, cy, 5, 5, (row + col) % 2 ? PAL.skyTop : PAL.brick));
    }
  }
  const lines: string[] = [];
  for (let i = -3; i < 9; i++) {
    lines.push(`M${i * 10} 0 L${i * 10 + 44} 44 M${i * 10 + 44} 0 L${i * 10} 44`);
  }
  return `${out.join('')}<path d="${lines.join(' ')}" stroke="${PAL.zap}" stroke-width="1" fill="none" opacity="0.9"/>`;
}

const hibiscus = (cx: number, cy: number, r: number) =>
  [0, 1, 2, 3, 4].map(i => {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    return `<circle cx="${(cx + Math.cos(a) * r).toFixed(2)}" cy="${(cy + Math.sin(a) * r).toFixed(2)}" r="${(r * 0.8).toFixed(2)}" fill="${PAL.brick}"/>`;
  }).join('') + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.55).toFixed(2)}" fill="${PAL.paper}"/>`;
const leafShape = (cx: number, cy: number, rot: number) =>
  `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 -5 Q4 0 0 5 Q-4 0 0 -5 Z" fill="${PAL.leaf}"/>`;

const pocketSquare = `<path d="M12.2 29 L14 26 L16 29 Z" fill="${PAL.paper}" ${ink(1)}/>`;

const SPECS: Record<Exclude<OutfitId, 'cardigan'>, OutfitSpec> = {
  argyle: {
    torso: {
      base: PAL.paper, shade: PAL.dust,
      pattern: argylePattern(),
      details: `
        <path d="M17 4 L23 17 L29 4 Z" fill="${PAL.skyTop}" ${ink(2)}/>
        <path d="M17.5 3.6 L23 15 L28.5 3.6" fill="none" stroke="${PAL.brick}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10.6 37 Q23 40.5 36.4 37" fill="none" stroke="${PAL.brick}" stroke-width="3" stroke-linecap="round"/>`,
    },
    legs: { color: PAL.jonhTrousers, dark: PAL.jonhTrousersDark, pattern: '', sock: PAL.brick, shoe: PAL.woodDark, shoeLight: PAL.paper },
    arm: { front: PAL.paper, back: PAL.dust, pattern: '', short: false },
  },
  hawaiian: {
    torso: {
      base: PAL.sun, shade: PAL.brass,
      pattern: `${hibiscus(14, 15, 3)}${hibiscus(34, 24, 3.2)}${hibiscus(18, 32, 2.6)}${leafShape(22, 21, 70)}${leafShape(11, 24, -40)}${leafShape(30, 12, 30)}${leafShape(27, 33, -60)}${leafShape(38, 34, 20)}`,
      details: `
        <path d="M17 4 L22.5 14 L16 15 L12 7 Z M29 4 L23.5 14 L30 15 L34 7 Z" fill="${PAL.sunGlow}" ${ink(2)}/>
        <path d="M23 15 L23 38" ${ink(1.5)} fill="none"/>
        <circle cx="25.4" cy="24" r="1.5" fill="${PAL.paper}" ${ink(1)}/><circle cx="25.4" cy="31" r="1.5" fill="${PAL.paper}" ${ink(1)}/>`,
    },
    legs: { color: PAL.dust, dark: PAL.earth, pattern: '', sock: PAL.paper, shoe: PAL.woodDark, shoeLight: PAL.paper },
    arm: { front: PAL.sun, back: PAL.brass, pattern: `${hibiscus(9, 8.4, 1.8)}`, short: true },
  },
  tracksuit: {
    torso: {
      base: PAL.grape, shade: PAL.grapeDark,
      pattern: `<path d="M3 18 L44 18 L44 21.4 L3 21.4 Z" fill="${PAL.zap}"/><path d="M3 22.6 L44 22.6 L44 24.8 L3 24.8 Z" fill="${PAL.paper}"/>`,
      details: `
        <path d="M16.5 3.4 Q23 8.5 29.5 3.4 L28.6 10 Q23 14 17.4 10 Z" fill="${PAL.grapeDark}" ${ink(2)}/>
        <path d="M23 11.5 L23 38" ${ink(1.8)} fill="none"/>
        <rect x="21.4" y="12" width="3.2" height="4.4" rx="1" fill="${PAL.brass}" ${ink(1)}/>
        <path d="M11.5 30 L16.5 30" stroke="${PAL.ink}" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
        <path d="M10.6 37.4 Q23 41 36.4 37.4" fill="none" stroke="${PAL.zap}" stroke-width="3" stroke-linecap="round"/>`,
    },
    legs: { color: PAL.grape, dark: PAL.grapeDark, pattern: along('M36 8.5 L19 9.5 L18 22', PAL.zap, 2.6), sock: PAL.paper, shoe: PAL.paper, shoeLight: PAL.brick },
    arm: { front: PAL.grape, back: PAL.grapeDark, pattern: along('M9 4 L9 21', PAL.zap, 2.4), short: false },
  },
  pyjamas: {
    torso: {
      base: PAL.paper, shade: PAL.dust,
      pattern: Array.from({ length: 7 }, (_, i) => `<path d="M${2 + i * 7} 0 L${2 + i * 7} 44" stroke="${PAL.skyTop}" stroke-width="3.6"/>`).join(''),
      details: `
        <path d="M17 4 L23 16 L29 4 Z" fill="${PAL.paper}" ${ink(2)}/>
        <path d="M17.6 3.8 L23 15 L28.4 3.8" fill="none" stroke="${PAL.skyTop}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M23 16 L23 38" ${ink(1.5)} fill="none"/>
        <circle cx="25.4" cy="23" r="1.5" fill="${PAL.ink}"/><circle cx="25.4" cy="30" r="1.5" fill="${PAL.ink}"/>
        <rect x="11.5" y="25" width="7.5" height="7" rx="1.2" fill="${PAL.paper}" ${ink(1.4)}/>
        <path d="M13 28 L17.5 28" stroke="${PAL.skyTop}" stroke-width="1.6" stroke-linecap="round"/>`,
    },
    legs: { color: PAL.paper, dark: PAL.dust, pattern: across(LEG_PATH, PAL.skyTop, 13, '3.2 3.2'), sock: PAL.skyTop, shoe: PAL.brick, shoeLight: PAL.paper },
    arm: { front: PAL.paper, back: PAL.dust, pattern: across(ARM_PATH, PAL.skyTop, 10, '3.2 3.2'), short: false },
  },
  tuxedo: {
    torso: {
      base: PAL.coal, shade: PAL.ink,
      pattern: '',
      details: `
        <path d="M17 4 L29 4 L26 22 L23 26 L20 22 Z" fill="${PAL.paper}" ${ink(1.8)}/>
        <path d="M15 5 L20.5 21 L18 38 L12.5 38 Z M31 5 L25.5 21 L28 38 L33.5 38 Z" fill="${PAL.coalLight}" ${ink(1.6)}/>
        <circle cx="23" cy="14" r="1.1" fill="${PAL.ink}"/><circle cx="23" cy="19.5" r="1.1" fill="${PAL.ink}"/>
        <path d="M23 6.8 L16.4 3.4 L16.4 10.2 Z M23 6.8 L29.6 3.4 L29.6 10.2 Z" fill="${PAL.brick}" ${ink(1.6)}/>
        <circle cx="23" cy="6.8" r="2" fill="${PAL.brickDark}" ${ink(1.4)}/>`,
    },
    legs: { color: PAL.coal, dark: PAL.ink, pattern: along('M36 8.5 L19 9.5 L18 22', PAL.coalLight, 2), sock: PAL.coalLight, shoe: PAL.coal, shoeLight: PAL.paper },
    arm: { front: PAL.coal, back: PAL.ink, pattern: '', short: false },
  },
  sundayBest: {
    torso: {
      base: PAL.woodDark, shade: PAL.ink,
      pattern: `<g stroke="${PAL.wood}" stroke-width="1.1" opacity="0.7">${[8, 16, 24, 32, 40].map(x => `<path d="M${x} 0 V44"/>`).join('')}${[8, 16, 24, 32, 40].map(y => `<path d="M0 ${y} H46"/>`).join('')}</g>`,
      details: `
        <path d="M17.5 4 L28.5 4 L25 24 L23 27 L21 24 Z" fill="${PAL.paper}" ${ink(1.8)}/>
        <path d="M23 8 L25.4 12 L24.4 24 L23 28 L21.6 24 L20.6 12 Z" fill="${PAL.brick}" ${ink(1.4)}/>
        <path d="M21.2 14 L24.8 14 M21 19 L25 19" stroke="${PAL.sun}" stroke-width="1.5"/>
        <path d="M14.5 5 L21 24 L18.6 38 M31.5 5 L25 24 L27.4 38" fill="none" stroke="${PAL.wood}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="26.6" cy="31" r="1.5" fill="${PAL.brass}" ${ink(1)}/>
        ${pocketSquare}`,
    },
    legs: { color: PAL.woodDark, dark: PAL.ink, pattern: '', sock: PAL.sun, shoe: PAL.coal, shoeLight: PAL.paper },
    arm: { front: PAL.woodDark, back: PAL.ink, pattern: '', short: false },
  },
};

function torsoArt(id: Exclude<OutfitId, 'cardigan'>, s: OutfitSpec['torso']): ArtDef {
  const c = `torso-clip-${id}`;
  return {
    key: outfitKeys(id).torso, w: 46, h: 42, ax: 23, ay: 39, scale: S,
    svg: svgDoc(46, 42, `
      ${clip(c, TORSO_PATH)}
      <path d="${TORSO_PATH}" fill="${s.base}"/>
      <g clip-path="url(#${c})">${s.pattern}</g>
      <path d="${TORSO_SHADE}" fill="${s.shade}" opacity="${s.pattern ? 0.55 : 0.85}"/>
      ${s.details}
      <path d="${TORSO_PATH}" fill="none" ${INK}/>`),
  };
}

function legsArt(id: Exclude<OutfitId, 'cardigan'>, s: OutfitSpec['legs']): ArtDef {
  return {
    key: outfitKeys(id).legs, w: 50, h: 36, ax: 38, ay: 7, scale: S,
    svg: svgDoc(50, 36, `
      ${limb(LEG_PATH, s.color, 13)}
      ${s.pattern}
      <path d="M33 4 L20 5" stroke="${s.dark}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
      <path d="M12.5 24 L22 24" stroke="${s.sock}" stroke-width="4" stroke-linecap="round"/>
      <path d="${SHOE_PATH}" fill="${s.shoe}" ${INK}/>
      <path d="M8.5 26.5 Q11 25.5 13 26.5" stroke="${s.shoeLight}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/>`),
  };
}

function armArt(key: string, color: string, pattern: string, short: boolean): ArtDef {
  const sleeve = short ? 'M9 6 L9 11.5' : ARM_PATH;
  return {
    key, w: 18, h: 32, ax: 9, ay: 6, scale: S,
    svg: svgDoc(18, 32, `
      ${short ? limb('M9 9 L9 20', PAL.skin, 8) : ''}
      ${limb(sleeve, color, 10)}
      ${pattern}
      <circle cx="9" cy="24" r="5.6" fill="${PAL.skin}" ${ink(2.6)}/>
      <path d="M6.5 26 Q9 27.5 11.5 26" fill="none" ${ink(1.2)}/>`),
  };
}

/** Texture keys of one outfit's four parts (the cardigan keeps the original keys). */
export function outfitKeys(id: OutfitId): { torso: string; legs: string; armFront: string; armBack: string } {
  return id === 'cardigan'
    ? { torso: 'jonh-torso', legs: 'jonh-legs', armFront: 'jonh-arm-front', armBack: 'jonh-arm-back' }
    : { torso: `jonh-torso-${id}`, legs: `jonh-legs-${id}`, armFront: `jonh-arm-front-${id}`, armBack: `jonh-arm-back-${id}` };
}

/** Art for every outfit except the cardigan (which stays in jonhArt.ts). */
export function outfitArt(): ArtDef[] {
  const defs: ArtDef[] = [];
  for (const [id, spec] of Object.entries(SPECS) as [Exclude<OutfitId, 'cardigan'>, OutfitSpec][]) {
    const keys = outfitKeys(id);
    defs.push(
      torsoArt(id, spec.torso),
      legsArt(id, spec.legs),
      armArt(keys.armFront, spec.arm.front, spec.arm.pattern, spec.arm.short),
      armArt(keys.armBack, spec.arm.back, spec.arm.pattern, spec.arm.short),
    );
  }
  return defs;
}

const inner = (def: ArtDef) => def.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(2);

/**
 * Jonh at rest in `outfit` (and `hat`), as inline SVG for the wardrobe: the same parts, pivots and
 * rest pose as JonhRenderer, so no texture or boot is needed. The origin is his seat base. The
 * newspaper is left out by default because it hides most of the torso.
 */
export function outfitFigureSvg(outfit: OutfitId, hat = 'boater', withPaper = false): string {
  const all = new Map<string, ArtDef>([...JONH_ART, ...outfitArt()].map(d => [d.key, d]));
  const part = (key: string, x: number, y: number, rot = 0): string => {
    const d = all.get(key);
    if (!d) return '';
    return `<g transform="translate(${x} ${y}) rotate(${deg(rot)}) translate(${-d.ax} ${-d.ay})">${inner(d)}</g>`;
  };
  const k = outfitKeys(outfit);
  return `<svg viewBox="-62 -124 132 132" aria-hidden="true" class="jonh-figure">
    <ellipse cx="4" cy="1" rx="34" ry="4.5" fill="${PAL.ink}" opacity=".18"/>
    ${part('jonh-chair', RIG.chair.x, RIG.chair.y)}
    <g transform="translate(${RIG.hip.x} ${RIG.hip.y}) rotate(${deg(RIG.torsoRot)})">
      ${part(k.armBack, RIG.armBack.x, RIG.armBack.y, RIG.armBack.rot)}
      ${part(k.torso, 0, 0)}
      <g transform="translate(${RIG.neck.x} ${RIG.neck.y})">
        ${part('jonh-head', 0, 0)}${part('jonh-face-bored', 0, 0)}${part(`hat-${hat}`, RIG.hatOnHead.x, RIG.hatOnHead.y)}
      </g>
      ${withPaper ? part('jonh-paper', RIG.paper.x, RIG.paper.y) : ''}
      ${part(k.armFront, RIG.armFront.x, RIG.armFront.y, RIG.armFront.rot)}
    </g>
    <g transform="translate(${RIG.hip.x} ${RIG.hip.y})">${part(k.legs, 0, 0)}</g>
  </svg>`;
}
