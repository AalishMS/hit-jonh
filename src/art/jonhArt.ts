import { PAL } from './palette';
import { INK, ink, limb, svgDoc, type ArtDef } from './svgKit';

/** Jonh is drawn at 3× so a 1.8× impact zoom on a large screen stays crisp. */
const S = 3;

const torso: ArtDef = {
  key: 'jonh-torso', w: 46, h: 42, ax: 23, ay: 39, scale: S,
  svg: svgDoc(46, 42, `
    <path d="M10 38 C5 26 7 11 15 5 C20 1 28 1 33 5 C41 11 42 26 37 38 Q23 42 10 38 Z" fill="${PAL.jonhShirt}"/>
    <path d="M31 6 C39 12 40 26 36.5 37.5 Q32 39.5 28 39.5 C32 28 33 15 31 6 Z" fill="${PAL.jonhShirtDark}"/>
    <path d="M17.5 4 L23 15 L28.5 4 Z" fill="${PAL.paper}" ${ink(2)}/>
    <path d="M23 15 L23 38" ${ink(1.6)} fill="none"/>
    <circle cx="25.6" cy="22" r="1.6" fill="${PAL.ink}"/><circle cx="25.6" cy="30" r="1.6" fill="${PAL.ink}"/>
    <path d="M12 30 Q15 33 19 31" fill="none" ${ink(1.4)}/>
    <path d="M10 38 C5 26 7 11 15 5 C20 1 28 1 33 5 C41 11 42 26 37 38 Q23 42 10 38 Z" fill="none" ${INK}/>`),
};

const legs: ArtDef = {
  key: 'jonh-legs', w: 50, h: 36, ax: 38, ay: 7, scale: S,
  svg: svgDoc(50, 36, `
    ${limb('M38 8 L18 9 L17 25', PAL.jonhTrousers, 13)}
    <path d="M33 4 L20 5" stroke="${PAL.jonhTrousersDark}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
    <path d="M12.5 24 L22 24" stroke="${PAL.paper}" stroke-width="4" stroke-linecap="round"/>
    <path d="M5 29.5 Q5 23.5 12 23.5 L21 23.5 Q24.5 23.5 24.5 28.5 L24.5 32.5 L5 32.5 Z" fill="#4A2E2A" ${INK}/>
    <path d="M8.5 26.5 Q11 25.5 13 26.5" stroke="${PAL.paper}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/>`),
};

function arm(key: string, color: string): ArtDef {
  return {
    key, w: 18, h: 32, ax: 9, ay: 6, scale: S,
    svg: svgDoc(18, 32, `
      ${limb('M9 6 L9 20', color, 10)}
      <circle cx="9" cy="24" r="5.6" fill="${PAL.skin}" ${ink(2.6)}/>
      <path d="M6.5 26 Q9 27.5 11.5 26" fill="none" ${ink(1.2)}/>`),
  };
}

const paper: ArtDef = {
  key: 'jonh-paper', w: 42, h: 32, ax: 21, ay: 16, scale: S,
  svg: svgDoc(42, 32, `
    <rect x="3" y="3" width="36" height="26" rx="2" fill="${PAL.paper}"/>
    <path d="M21 3 L39 3 L39 29 L21 29 Z" fill="#F2E6CC"/>
    <rect x="6" y="6.5" width="12" height="3.2" rx="1" fill="${PAL.ink}"/>
    <rect x="24" y="6.5" width="12" height="3.2" rx="1" fill="${PAL.ink}"/>
    <rect x="24" y="12.5" width="12" height="8" rx="1" fill="${PAL.stone}" ${ink(1)}/>
    <g stroke="${PAL.ink}" stroke-width="1.2" opacity="0.45" stroke-linecap="round">
      <path d="M6 13 H18 M6 17 H18 M6 21 H18 M6 25 H18 M24 24 H36"/>
    </g>
    <path d="M21 4 V28" stroke="${PAL.ink}" stroke-width="1.4" opacity="0.5"/>
    <rect x="3" y="3" width="36" height="26" rx="2" fill="none" ${INK}/>`),
};

const head: ArtDef = {
  key: 'jonh-head', w: 44, h: 42, ax: 20, ay: 38, scale: S,
  svg: svgDoc(44, 42, `
    <rect x="15" y="30" width="10" height="9" fill="${PAL.skin}" ${ink(2.4)}/>
    <path d="M33 10 Q41 15 38 27 L33 25 Z" fill="${PAL.hair}" ${ink(2)}/>
    <circle cx="37" cy="22" r="5" fill="${PAL.skin}" ${ink(2.4)}/>
    <path d="M36 20 Q38.5 22 36 24.5" fill="none" ${ink(1.4)}/>
    <ellipse cx="20" cy="20" rx="17" ry="16.5" fill="${PAL.skin}"/>
    <path d="M31 9 Q38 18 33 30 Q27 36 18 36.5 Q30 30 31 9 Z" fill="${PAL.skinShade}" opacity="0.85"/>
    <ellipse cx="20" cy="20" rx="17" ry="16.5" fill="none" ${INK}/>`),
};

/** Hair tuft and shine for when the hat is knocked off. */
const baldTuft: ArtDef = {
  key: 'jonh-tuft', w: 30, h: 16, ax: 15, ay: 14, scale: S,
  svg: svgDoc(30, 16, `
    <ellipse cx="10" cy="11" rx="4" ry="2" fill="${PAL.paper}" opacity="0.75"/>
    <path d="M13 13 Q14 3 22 4 M16 13 Q18 6 25 8 M11 13 Q10 6 6 6" fill="none" stroke="${PAL.hair}" stroke-width="2.4" stroke-linecap="round"/>`),
};

/* Faces share the head's box and pivot so they overlay it exactly. */
const GLASSES = `
  <circle cx="11" cy="19" r="5.8" fill="${PAL.glass}" fill-opacity="0.35" ${ink(2.2)}/>
  <circle cx="23" cy="19" r="5.8" fill="${PAL.glass}" fill-opacity="0.35" ${ink(2.2)}/>
  <path d="M16.8 19 H17.2 M28.8 18.5 L35 19.5" ${ink(2)}/>`;
const NOSE = `<ellipse cx="16" cy="25.5" rx="4.4" ry="3.7" fill="${PAL.skinShade}" ${ink(2)}/>`;
const MOUSTACHE = (dy = 0) => `<path d="M7.5 ${29 + dy} Q12 ${26.5 + dy} 16 ${28.5 + dy} Q20 ${26.5 + dy} 25 ${29 + dy} Q22 ${33 + dy} 16 ${31 + dy} Q10 ${33 + dy} 7.5 ${29 + dy} Z" fill="${PAL.hair}" ${ink(1.8)}/>`;
const lid = (cx: number, depth: number) =>
  `<path d="M${cx - 5.6} ${19 - 5.6 + depth * 11.2} L${cx + 5.6} ${19 - 5.6 + depth * 11.2}" ${ink(1.8)}/>`;
const lidFill = (cx: number, depth: number) =>
  `<clipPath id="c${cx}"><circle cx="${cx}" cy="19" r="5"/></clipPath>` +
  `<rect x="${cx - 6}" y="12" width="12" height="${depth * 11.2 + 1.4}" fill="${PAL.skin}" clip-path="url(#c${cx})"/>`;

function face(name: string, body: string): ArtDef {
  return { key: `jonh-face-${name}`, w: 44, h: 42, ax: 20, ay: 38, scale: S, svg: svgDoc(44, 42, body) };
}

const faces: ArtDef[] = [
  face('bored', `${GLASSES}
    <circle cx="10.4" cy="20.5" r="1.7" fill="${PAL.ink}"/><circle cx="22.4" cy="20.5" r="1.7" fill="${PAL.ink}"/>
    ${lidFill(11, 0.45)}${lidFill(23, 0.45)}${lid(11, 0.45)}${lid(23, 0.45)}
    <path d="M5.5 11.5 L15 11 M19 11 L28 11.5" ${ink(2)}/>${NOSE}${MOUSTACHE()}
    <path d="M13 34.5 H19" ${ink(1.6)}/>`),
  face('blink', `${GLASSES}
    <path d="M6.5 19.5 Q11 22 15.5 19.5 M18.5 19.5 Q23 22 27.5 19.5" fill="none" ${ink(1.8)}/>
    <path d="M5.5 12 L15 11.5 M19 11.5 L28 12" ${ink(2)}/>${NOSE}${MOUSTACHE()}
    <path d="M13 34.5 H19" ${ink(1.6)}/>`),
  face('look', `${GLASSES}
    <circle cx="8" cy="19.5" r="1.8" fill="${PAL.ink}"/><circle cx="20" cy="19.5" r="1.8" fill="${PAL.ink}"/>
    ${lidFill(11, 0.25)}${lidFill(23, 0.3)}${lid(11, 0.25)}${lid(23, 0.3)}
    <path d="M5 9.5 Q10 6.5 15 9 M19 11 L28 11" fill="none" ${ink(2)}/>${NOSE}${MOUSTACHE()}
    <path d="M14 34.5 Q16.5 33.5 19 34.5" fill="none" ${ink(1.6)}/>`),
  face('shock', `${GLASSES}
    <circle cx="10" cy="17.5" r="7.6" fill="#FFFFFF" ${ink(2.4)}/><circle cx="24.5" cy="17.5" r="7.6" fill="#FFFFFF" ${ink(2.4)}/>
    <circle cx="10" cy="17.5" r="1.5" fill="${PAL.ink}"/><circle cx="24.5" cy="17.5" r="1.5" fill="${PAL.ink}"/>
    <path d="M2.5 6.5 Q9 1 15.5 5.5 M19 5.5 Q25.5 1 32 6.5" fill="none" ${ink(2.2)}/>${NOSE}
    <ellipse cx="16" cy="35" rx="3.8" ry="4.6" fill="${PAL.ink}"/>${MOUSTACHE(-2)}`),
  face('wince', `${GLASSES}
    <path d="M6.5 15.5 L13 19 L6.5 22.5 M27.5 15.5 L21 19 L27.5 22.5" fill="none" ${ink(2.2)}/>
    <path d="M5 9 L15 13 M19 13 L29 9" ${ink(2.2)}/>${NOSE}
    <rect x="10" y="31" width="12" height="5.5" rx="1.5" fill="${PAL.paper}" ${ink(1.6)}/>
    <path d="M14 31 V36.5 M18 31 V36.5" ${ink(1.1)}/>${MOUSTACHE(-1)}`),
  face('dazed', `${GLASSES}
    <path d="M11 19 m-0.8 0 a0.8 0.8 0 1 1 1.6 0 a1.8 1.8 0 1 1 -3.6 0 a2.8 2.8 0 1 1 5.6 0 a3.8 3.8 0 1 1 -7.6 0" fill="none" ${ink(1.3)}/>
    <path d="M23 19 m-0.8 0 a0.8 0.8 0 1 1 1.6 0 a1.8 1.8 0 1 1 -3.6 0 a2.8 2.8 0 1 1 5.6 0 a3.8 3.8 0 1 1 -7.6 0" fill="none" ${ink(1.3)}/>
    <path d="M5 10 Q10 13 15 10 M19 10 Q24 13 29 10" fill="none" ${ink(1.8)}/>${NOSE}
    <ellipse cx="18" cy="37" rx="2.6" ry="2.4" fill="#F27A8A" ${ink(1.2)}/>
    <path d="M10.5 34.5 Q13.5 32.5 16 34.5 Q18.5 36.5 21.5 34.5" fill="none" ${ink(1.7)}/>${MOUSTACHE()}`),
  face('annoyed', `${GLASSES}
    <circle cx="9.2" cy="21" r="1.7" fill="${PAL.ink}"/><circle cx="21.2" cy="21" r="1.7" fill="${PAL.ink}"/>
    ${lidFill(11, 0.6)}${lidFill(23, 0.6)}${lid(11, 0.6)}${lid(23, 0.6)}
    <path d="M5 9.5 L15.5 13 M18.5 13 L29 9.5" ${ink(2.4)}/>${NOSE}${MOUSTACHE()}
    <path d="M12.5 36 Q16 33.8 19.5 36" fill="none" ${ink(1.7)}/>`),
  face('smug', `${GLASSES}
    <path d="M6.5 20.5 Q11 16.5 15.5 20.5 M18.5 20.5 Q23 16.5 27.5 20.5" fill="none" ${ink(1.9)}/>
    <path d="M5 10 Q10 8 15 10 M19 10 Q24 8 29 10" fill="none" ${ink(2)}/>${NOSE}${MOUSTACHE()}
    <path d="M12.5 34 Q16.5 36.5 20 33.5" fill="none" ${ink(1.7)}/>`),
];

export const FACE_KEYS = ['bored', 'blink', 'look', 'shock', 'wince', 'dazed', 'annoyed', 'smug'] as const;
export type FaceKey = typeof FACE_KEYS[number];

const chair: ArtDef = {
  key: 'jonh-chair', w: 72, h: 82, ax: 34, ay: 79, scale: S,
  svg: svgDoc(72, 82, `
    <clipPath id="sling"><path d="M50 6 L62 10 Q45 53 19 49 L12 41 Q40 43 50 6 Z"/></clipPath>
    ${limb('M57 78 L17 41', PAL.woodDark, 5)}
    ${limb('M22 64 L46 64', PAL.woodDark, 3.5)}
    <g clip-path="url(#sling)">
      <rect x="0" y="0" width="72" height="82" fill="${PAL.paper}"/>
      <path d="M40 0 L72 0 L72 82 L40 82 Z M20 30 L30 30 L30 60 L20 60 Z" fill="${PAL.brick}"/>
      <path d="M48 0 L56 0 L56 82 L48 82 Z" fill="${PAL.paper}"/>
    </g>
    <path d="M50 6 L62 10 Q45 53 19 49 L12 41 Q40 43 50 6 Z" fill="none" ${INK}/>
    ${limb('M10 78 L58 5', PAL.wood, 5)}`),
};

/** Hat family: all share the boater's footprint over the hat sensor (≈ 30 × 15 px). */
export const HAT_IDS = ['boater', 'bowler', 'fez', 'propeller', 'party', 'crown', 'viking', 'chef'] as const;
export type HatId = typeof HAT_IDS[number];

function hat(id: HatId, body: string): ArtDef {
  return { key: `hat-${id}`, w: 46, h: 30, ax: 23, ay: 24, scale: S, svg: svgDoc(46, 30, body) };
}

const hats: ArtDef[] = [
  hat('boater', `
    <ellipse cx="23" cy="24" rx="19" ry="4.6" fill="${PAL.hat}" ${INK}/>
    <path d="M12 23 L13 12 Q13 9.5 15.5 9.5 L30.5 9.5 Q33 9.5 33 12 L34 23 Z" fill="${PAL.hat}" ${INK}/>
    <path d="M12.4 17.5 L33.6 17.5 L34 22.5 L12 22.5 Z" fill="${PAL.hatBand}"/>
    <path d="M12.4 17.5 L33.6 17.5 M12 22.5 L34 22.5" ${ink(1.5)}/>
    <path d="M16 12.5 L18 15 M21 12 L23 15 M26 12 L28 15" stroke="${PAL.hatDark}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M4 24 A19 4.6 0 0 0 42 24" fill="${PAL.hat}" ${INK}/>
    <path d="M9 25.5 Q23 28 37 25.5" stroke="${PAL.hatDark}" stroke-width="1.5" fill="none"/>`),
  hat('bowler', `
    <path d="M8 24 Q8 20 13 20 L33 20 Q38 20 38 24 Q23 28 8 24 Z" fill="${PAL.ink}"/>
    <path d="M12 21 Q11 7 23 7 Q35 7 34 21 Z" fill="#3D2F44" ${INK}/>
    <path d="M12.5 18 L33.5 18" stroke="#6A4F72" stroke-width="3"/>
    <path d="M17 11 Q20 9 23 9" stroke="#7D6A88" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M6 23.5 Q23 29 40 23.5" fill="none" ${INK}/>`),
  hat('fez', `
    <path d="M13 24 L15.5 7 L30.5 7 L33 24 Q23 27 13 24 Z" fill="${PAL.hatBand}" ${INK}/>
    <ellipse cx="23" cy="7" rx="7.5" ry="2" fill="${PAL.brickDark}" ${ink(2)}/>
    <path d="M23 7 Q31 9 30 18" fill="none" stroke="${PAL.ink}" stroke-width="1.6"/>
    <circle cx="30" cy="19" r="2.4" fill="${PAL.hat}" ${ink(1.5)}/>`),
  hat('propeller', `
    <path d="M10 24 Q10 11 23 11 Q36 11 36 24 Z" fill="${PAL.rubber}" ${INK}/>
    <path d="M23 11 Q30 13 36 24 L23 24 Z" fill="${PAL.skyTop}"/>
    <path d="M10 24 Q10 11 23 11 Q36 11 36 24 Z" fill="none" ${INK}/>
    <path d="M7 25 L39 25" ${ink(3.5)}/>
    <path d="M23 11 V6" ${ink(2)}/>
    <path d="M23 5 L10 3 Q8 5 10 7 Z M23 5 L36 7 Q38 5 36 3 Z" fill="${PAL.zap}" ${ink(1.8)}/>`),
  hat('party', `
    <path d="M11 25 L23 1 L35 25 Q23 28 11 25 Z" fill="${PAL.skyTop}" ${INK}/>
    <path d="M15 17 L31 17 M18.5 10 L27.5 10" stroke="${PAL.zap}" stroke-width="3"/>
    <path d="M11 25 L23 1 L35 25 Q23 28 11 25 Z" fill="none" ${INK}/>
    <circle cx="23" cy="2.5" r="2.6" fill="${PAL.rubber}" ${ink(1.6)}/>`),
  hat('crown', `
    <path d="M10 25 L9 9 L16 16 L23 6 L30 16 L37 9 L36 25 Z" fill="${PAL.brass}" ${INK}/>
    <path d="M10.5 21 L35.5 21" stroke="${PAL.brassDark}" stroke-width="2.4"/>
    <circle cx="23" cy="17" r="2.4" fill="${PAL.pow}" ${ink(1.4)}/>
    <circle cx="15" cy="19" r="1.6" fill="${PAL.skyTop}"/><circle cx="31" cy="19" r="1.6" fill="${PAL.leaf}"/>`),
  hat('viking', `
    <path d="M12 12 Q4 10 3 2 Q9 6 14 7 Z M34 12 Q42 10 43 2 Q37 6 32 7 Z" fill="${PAL.paper}" ${ink(2.4)}/>
    <path d="M10 25 Q9 8 23 8 Q37 8 36 25 Z" fill="${PAL.stoneDark}" ${INK}/>
    <path d="M9.5 21 L36.5 21 L36 25.5 L10 25.5 Z" fill="${PAL.brass}" ${ink(2)}/>
    <path d="M23 8 V21" stroke="${PAL.brass}" stroke-width="3"/>`),
  hat('chef', `
    <path d="M13 25 L13 16 Q6 15 7 9 Q8 3 15 5 Q18 0 23 1 Q29 0 31 5 Q38 3 39 9 Q40 15 33 16 L33 25 Z" fill="#FFFFFF" ${INK}/>
    <path d="M13 21 L33 21" ${ink(1.5)}/>
    <path d="M19 9 Q20 13 19 16 M27 9 Q26 13 27 16" fill="none" stroke="${PAL.stone}" stroke-width="1.6" stroke-linecap="round"/>`),
];

export const JONH_ART: ArtDef[] = [
  torso, legs, arm('jonh-arm-front', PAL.jonhShirt), arm('jonh-arm-back', PAL.jonhShirtDark),
  paper, head, baldTuft, chair, ...faces, ...hats,
];
