import { announce, sentence } from './announcer';
/**
 * The comic "title card" between gardens: an ink panel with the garden's name stamped on it, then
 * an iris opening onto play. The first garden of a campaign chapter also names the chapter
 * ("Chapter 2 · Mild Inconveniences", `chapter`) on the same card: never a second screen. Purely
 * decorative (pointer-events pass through); off under reduced motion. The game underneath is
 * already loaded when it opens.
 */
export const TITLE_CARD_SECONDS = 1.2;

export function playTitleCard(title: string, kicker: string | null, reduced: boolean, chapter: string | null = null): void {
  // The card itself is aria-hidden; a screen reader hears the same words (also under reduced motion).
  announce(sentence(chapter, kicker, title));
  if (typeof document === 'undefined' || reduced) return;
  document.querySelectorAll('.title-card, .iris').forEach(node => node.remove());
  const card = document.createElement('div');
  card.className = 'title-card';
  card.setAttribute('aria-hidden', 'true');
  const hole = document.createElement('div');
  hole.className = 'title-card-iris';
  const text = document.createElement('div');
  text.className = 'title-card-text';
  if (chapter) {
    const line = document.createElement('em');
    line.className = 'title-chapter';
    line.textContent = chapter;
    text.appendChild(line);
  }
  if (kicker) {
    const small = document.createElement('small');
    small.textContent = kicker;
    text.appendChild(small);
  }
  const strong = document.createElement('strong');
  strong.textContent = title;
  text.appendChild(strong);
  card.append(hole, text);
  document.body.appendChild(card);
  window.setTimeout(() => card.remove(), TITLE_CARD_SECONDS * 1000 + 200);
}
