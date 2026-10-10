import { inTourOrder, MAP_PRESETS, MAPS } from '../levels';
import { difficultyPips, mapPreview, tourPreview } from './mapPreview';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));

const roundsLabel = (n: number) => `${n} round${n === 1 ? '' : 's'} · one map per round`;

export interface MapSetPickerOptions {
  /** Prefix for element ids, unique per screen (keeps focus across re-renders). */
  idPrefix: string;
  selected: readonly string[];
  /** Always called with at least one map, in tour order. */
  onChange(maps: string[]): void;
  signal: AbortSignal;
}

/**
 * Multiplayer arena picker shared by hot-seat and the online host: preset chips plus a checklist
 * of every map, played in tour order. The last ticked map cannot be unticked.
 */
export function mapSetPicker(o: MapSetPickerOptions): HTMLFieldSetElement {
  let selected = inTourOrder(o.selected);
  const set = el('fieldset', 'mp-map-picker');
  set.appendChild(el('legend', '', 'Choose your arenas'));

  const presets = el('div', 'map-presets');
  const presetButtons = MAP_PRESETS.map(preset => {
    const b = el('button', 'chip', preset.name);
    b.type = 'button';
    b.id = `${o.idPrefix}-preset-${preset.id}`;
    b.addEventListener('click', () => update(preset.maps), { signal: o.signal });
    presets.appendChild(b);
    return { b, preset };
  });
  const summary = el('p', 'map-set-summary');
  summary.setAttribute('aria-live', 'polite');

  const grid = el('div', 'map-check-grid');
  const boxes = MAPS.map(map => {
    const label = el('label', 'arena-option');
    const input = el('input');
    input.type = 'checkbox';
    input.id = `${o.idPrefix}-map-${map.id}`;
    input.value = map.id;
    input.addEventListener('change', () => {
      const next = input.checked ? [...selected, map.id] : selected.filter(id => id !== map.id);
      if (next.length === 0) { input.checked = true; return; }
      update(next);
    }, { signal: o.signal });
    const artwork = el('span');
    artwork.innerHTML = mapPreview(map.id);
    const name = el('strong', '', map.name);
    const pips = el('small', 'difficulty-pips', difficultyPips(map));
    pips.setAttribute('aria-label', `difficulty ${map.difficulty} of 3`);
    name.appendChild(pips);
    label.append(input, artwork, name);
    grid.appendChild(label);
    return { input, id: map.id };
  });

  const sync = () => {
    for (const { input, id } of boxes) input.checked = selected.includes(id);
    for (const { b, preset } of presetButtons) b.setAttribute('aria-pressed', String(sameSet(selected, preset.maps)));
    summary.textContent = roundsLabel(selected.length);
  };
  function update(maps: readonly string[]): void {
    const next = inTourOrder(maps);
    if (next.length === 0) return;
    selected = next;
    sync();
    o.onChange([...selected]);
  }

  sync();
  set.append(presets, summary, grid);
  return set;
}

/** Read-only summary of the chosen maps, for online guests. */
export function mapSetCard(maps: readonly string[]): HTMLFieldSetElement {
  const ordered = inTourOrder(maps);
  const set = el('fieldset', 'mp-map-picker is-readonly');
  set.appendChild(el('legend', '', ordered.length === 1 ? 'Arena' : 'Arenas'));
  const card = el('div', 'arena-option is-picked');
  const artwork = el('span');
  artwork.innerHTML = ordered.length === 1 ? mapPreview(ordered[0]!) : tourPreview(ordered);
  const preset = MAP_PRESETS.find(p => sameSet(ordered, p.maps));
  const names = ordered.map(id => MAPS.find(m => m.id === id)?.name ?? id).join(' → ');
  const title = el('strong', '', preset && ordered.length > 1 ? preset.name : names);
  if (preset && ordered.length > 1) title.appendChild(el('small', 'map-set-names', names));
  title.appendChild(el('small', 'map-set-names', roundsLabel(ordered.length)));
  card.append(artwork, title);
  set.appendChild(card);
  return set;
}
