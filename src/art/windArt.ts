import { PAL } from './palette';
import { svgDoc, type ArtDef } from './svgKit';

/** A wind streak: a long soft stroke with a curl at its leading end, drawn pointing along +x. */
export const WIND_ART: ArtDef[] = [
  {
    key: 'wind-streak', w: 96, h: 14, ax: 48, ay: 7, scale: 2,
    svg: svgDoc(96, 14, `<path d="M3 8 Q26 3 52 7 T88 6" fill="none" stroke="${PAL.paper}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<path d="M88 6 Q94 6 93 10" fill="none" stroke="${PAL.paper}" stroke-width="3.2" stroke-linecap="round"/>`),
  },
];
