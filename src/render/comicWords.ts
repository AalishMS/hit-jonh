import type Phaser from 'phaser';
import { PAL } from '../art/palette';
import { COMIC_WORDS } from '../fx/impactProfile';

/** Comic words are drawn once at boot so the contact frame never re-renders text. */
const RES = 2;
const FONT_PX = 72;

export function comicWordKey(word: string): string {
  return `word-${word.replace(/[^A-Z]/gi, '').toLowerCase()}`;
}

/** Logical font size the textures were drawn at (scale = size / COMIC_WORD_PX). */
export const COMIC_WORD_PX = FONT_PX;

export function loadComicWords(scene: Phaser.Scene): void {
  for (const { word, color } of COMIC_WORDS) {
    const key = comicWordKey(word);
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = `400 ${FONT_PX * RES}px "Luckiest Guy", Impact, sans-serif`;
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(word).width + 40 * RES);
    const height = Math.ceil(FONT_PX * RES * 1.45);
    canvas.width = width;
    canvas.height = height;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const x = width / 2 - 3 * RES;
    const y = height / 2 + 4 * RES;
    // Hard offset shadow, ink outline, then the fill (art direction: display type).
    ctx.lineWidth = 11 * RES;
    ctx.strokeStyle = PAL.ink;
    ctx.fillStyle = PAL.ink;
    ctx.strokeText(word, x + 5 * RES, y + 6 * RES);
    ctx.fillText(word, x + 5 * RES, y + 6 * RES);
    ctx.strokeText(word, x, y);
    ctx.fillStyle = PAL[color];
    ctx.fillText(word, x, y);
    scene.textures.addCanvas(key, canvas);
  }
}

export const COMIC_WORD_RES = RES;
