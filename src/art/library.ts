import { FX_ART } from './fxArt';
import { JONH_ART } from './jonhArt';
import type { ArtDef } from './svgKit';

/** Every piece of art rasterized at boot. */
export const ALL_ART: readonly ArtDef[] = [...JONH_ART, ...FX_ART];
