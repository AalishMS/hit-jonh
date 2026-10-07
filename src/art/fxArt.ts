import { PAL } from './palette';
import { INK, burstPath, ink, starPath, svgDoc, type ArtDef } from './svgKit';

const fx = (key: string, w: number, h: number, body: string, scale = 2): ArtDef =>
  ({ key, w, h, ax: w / 2, ay: h / 2, scale, svg: svgDoc(w, h, body) });

const JITTER = [1, 0.82, 1.12, 0.9, 1.05, 0.78, 1.15, 0.88, 0.96, 1.08, 0.85, 1.1, 0.92, 1.02];

export const FX_ART: ArtDef[] = [
  // Comic contact spark: drawn behind the contact point on the impact frame.
  fx('fx-impact-star', 140, 140, `
    <path d="${burstPath(70, 70, 13, 64, 30, JITTER)}" fill="${PAL.zap}" ${ink(4)}/>
    <path d="${burstPath(70, 70, 13, 40, 20, JITTER.slice(3))}" fill="${PAL.paper}"/>`),
  fx('fx-ring', 100, 100, `<circle cx="50" cy="50" r="44" fill="none" stroke="${PAL.paper}" stroke-width="7"/>
    <circle cx="50" cy="50" r="44" fill="none" stroke="${PAL.ink}" stroke-width="2" opacity="0.5"/>`),
  fx('fx-star', 20, 20, `<path d="${starPath(10, 10, 5, 8.6, 3.8)}" fill="${PAL.zap}" ${ink(1.8)}/>`),
  fx('fx-dust', 22, 22, `<circle cx="11" cy="11" r="9" fill="${PAL.dust}"/><path d="M5 15 A9 9 0 0 0 19 13 A8 8 0 0 1 5 15 Z" fill="${PAL.earth}" opacity="0.5"/>`),
  fx('fx-spark', 22, 8, `<path d="M1 4 L11 1 L21 4 L11 7 Z" fill="${PAL.paper}" ${ink(1.2)}/>`),
  fx('fx-scrap', 12, 14, `<rect x="1.5" y="1.5" width="9" height="11" rx="1" fill="${PAL.paper}" ${ink(1.4)}/><path d="M3.5 5 H8.5 M3.5 8 H8.5" stroke="${PAL.ink}" stroke-width="1" opacity="0.5"/>`),
  fx('fx-leaf', 12, 8, `<path d="M1 4 Q6 -1 11 4 Q6 9 1 4 Z" fill="${PAL.grass}" ${ink(1.2)}/>`),
  fx('fx-chip', 10, 8, `<path d="M1 2 L8 1 L9 6 L2 7 Z" fill="${PAL.wood}" ${ink(1.2)}/>`),
  fx('fx-smoke', 36, 30, `<path d="M9 22 Q2 22 3 15 Q4 9 10 10 Q11 3 18 3 Q26 3 27 10 Q34 10 33 17 Q32 24 25 23 Q22 28 16 27 Q11 27 9 22 Z" fill="${PAL.smoke}" ${ink(2)}/>
    <path d="M12 21 Q17 24 22 21" fill="none" stroke="${PAL.dust}" stroke-width="2" stroke-linecap="round"/>`),
  fx('fx-muzzle', 80, 56, `
    <path d="${burstPath(30, 28, 9, 27, 12, JITTER)}" fill="${PAL.zap}" ${ink(3)}/>
    <path d="M30 18 L78 28 L30 38 Z" fill="${PAL.zap}" ${ink(3)}/>
    <path d="${burstPath(30, 28, 9, 15, 8, JITTER.slice(2))}" fill="${PAL.paper}"/>`),
  fx('fx-speedline', 44, 6, `<rect x="1" y="1" width="42" height="4" rx="2" fill="${PAL.ink}"/>`),
  fx('fx-shadow', 64, 14, `<ellipse cx="32" cy="7" rx="30" ry="5.5" fill="${PAL.ink}" opacity="0.2"/>`),
  fx('fx-spark-fuse', 14, 14, `<path d="${starPath(7, 7, 4, 6.5, 2)}" fill="${PAL.zap}"/><circle cx="7" cy="7" r="2" fill="#FFFFFF"/>`),
  fx('fx-pixel', 4, 4, `<rect width="4" height="4" fill="#FFFFFF"/>`, 1),
  // The cannonball: 7.5 px collider radius, drawn with the outline inside that radius.
  { key: 'ball', w: 20, h: 20, ax: 10, ay: 10, scale: 3, svg: svgDoc(20, 20, `
    <circle cx="10" cy="10" r="7.6" fill="${PAL.iron}"/>
    <path d="M14.5 5 A7.6 7.6 0 0 1 6 16.8 A8.5 8.5 0 0 0 14.5 5 Z" fill="${PAL.ironDark}"/>
    <ellipse cx="7.4" cy="7" rx="2.4" ry="1.7" fill="${PAL.paper}" transform="rotate(-35 7.4 7)"/>
    <circle cx="10" cy="10" r="7.6" fill="none" ${ink(2.2)}/>`) },
  fx('fx-starburst-bg', 60, 60, `<path d="${starPath(30, 30, 8, 28, 16)}" fill="${PAL.zap}" ${INK}/>`),
];
