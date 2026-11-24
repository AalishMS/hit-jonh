/**
 * Jonh's wardrobe: one screen for every unlockable cosmetic (hats, outfits, cannons), as tabs.
 * Pure DOM; the scene supplies the items (art previews, unlock state) and what selecting does.
 * Locked items show how to earn them. Cosmetics are earned, never bought (SPEC §4.2).
 */
export interface WardrobeItem {
  id: string;
  name: string;
  /** How to earn it (shown when locked, and as a caption when unlocked). */
  hint: string;
  unlocked: boolean;
  selected: boolean;
  /** Preview image URL (rasterized art). */
  image: string;
}

export interface WardrobeSection {
  id: string;
  title: string;
  items: WardrobeItem[];
  onSelect: (id: string) => void;
}

export interface WardrobeOptions {
  intro: string;
  stats: string;
  sections: WardrobeSection[];
  /** The tab to open on (defaults to the first). */
  activeSection?: string;
  onBack: () => void;
  /** Called when the player switches tab, so a re-render can keep it. */
  onTab?: (sectionId: string) => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function buildWardrobe(content: HTMLElement, signal: AbortSignal, options: WardrobeOptions): void {
  const active = options.sections.find(s => s.id === options.activeSection) ?? options.sections[0];
  content.appendChild(el('h2', '', "Jonh's wardrobe"));
  content.appendChild(el('p', '', options.intro));

  const tabs = el('div', 'wardrobe-tabs');
  tabs.setAttribute('role', 'tablist');
  const panel = el('div', 'hat-grid wardrobe-grid');
  panel.setAttribute('role', 'tabpanel');
  for (const section of options.sections) {
    const unlocked = section.items.filter(i => i.unlocked).length;
    const tab = el('button', `wardrobe-tab${section === active ? ' active' : ''}`, `${section.title} ${unlocked}/${section.items.length}`);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(section === active));
    tab.addEventListener('click', () => options.onTab?.(section.id), { signal });
    tabs.appendChild(tab);
  }
  if (options.sections.length > 1) content.appendChild(tabs);

  if (active) {
    panel.setAttribute('aria-label', active.title);
    for (const item of active.items) {
      const card = el('button', `hat-card${item.unlocked ? '' : ' locked'}${item.selected ? ' selected' : ''}`);
      card.type = 'button';
      card.disabled = !item.unlocked;
      card.setAttribute('aria-pressed', String(item.selected));
      if (!item.unlocked) card.setAttribute('aria-label', `${item.name}, locked. ${item.hint}`);
      const img = el('img');
      img.src = item.image;
      img.alt = '';
      card.append(img, el('span', '', item.unlocked ? item.name : 'Locked'), el('small', '', item.hint));
      card.addEventListener('click', () => active.onSelect(item.id), { signal });
      panel.appendChild(card);
    }
  }
  content.appendChild(panel);
  content.appendChild(el('p', 'home-note', options.stats));
  const back = el('button', 'btn', 'Back');
  back.type = 'button';
  back.addEventListener('click', options.onBack, { signal });
  content.appendChild(back);
  const focus = (panel.querySelector('button.selected') ?? panel.querySelector('button:not(:disabled)')) as HTMLElement | null;
  focus?.focus();
}
