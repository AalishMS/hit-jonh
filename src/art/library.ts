import { WORLD } from '../config/tuning';
import { MAPS } from '../levels';
import { cannonArt } from './cannonArt';
import { outfitArt } from './outfitArt';
import { FX_ART } from './fxArt';
import { JONH_ART } from './jonhArt';
import { sceneryArt } from './sceneryArt';
import type { ArtDef } from './svgKit';

/** Every piece of art rasterized at boot. */
export const ALL_ART: readonly ArtDef[] = [...JONH_ART, ...outfitArt(), ...FX_ART, ...cannonArt(), ...sceneryArt(MAPS, WORLD.pixelsPerMetre)];
