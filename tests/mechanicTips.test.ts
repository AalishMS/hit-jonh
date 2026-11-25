import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/levels';
import { CAMPAIGN_ORDER } from '../src/rules/campaign';
import { MECHANIC_IDS, MECHANIC_TIPS, isMechanicId, mechanicTip } from '../src/rules/mechanicTips';
import { freshProgress, sanitizeProgress } from '../src/rules/progression';

const MAP_IDS = MAPS.map(m => m.id);

describe('first-meeting tips (next 10, item 3)', () => {
  it('every mechanic garden names a known mechanic with a short tip, and the basic gardens have none', () => {
    const named = MAPS.filter(m => m.mechanic !== undefined);
    expect(named.map(m => m.id).sort()).toEqual(['bankshot', 'greenhouse', 'magic', 'moon', 'rubber', 'skatepark', 'stroll', 'trampoline', 'valley', 'washday']);
    for (const m of named) expect(isMechanicId(m.mechanic), m.id).toBe(true);
    for (const id of ['backyard', 'fence', 'rooftop']) expect(MAPS.find(m => m.id === id)!.mechanic).toBeUndefined();
    // Every tip is used by a garden, and fits the aiming caption with "2 shots left." after it.
    expect(new Set(named.map(m => m.mechanic))).toEqual(new Set(MECHANIC_IDS));
    for (const id of MECHANIC_IDS) expect(`${MECHANIC_TIPS[id]} 2 shots left.`.length, id).toBeLessThanOrEqual(82);
  });

  it('tips once, on the first garden with that mechanic', () => {
    const base = { seen: [] as string[], cleared: [], practice: false };
    expect(mechanicTip({ ...base, mechanic: 'wind' })).toEqual({ id: 'wind', text: MECHANIC_TIPS.wind });
    expect(mechanicTip({ ...base, mechanic: undefined })).toBeNull();
    expect(mechanicTip({ ...base, mechanic: 'wind', seen: ['wind'] })).toBeNull();
    // Practice records nothing and only opens cleared gardens.
    expect(mechanicTip({ ...base, mechanic: 'wind', practice: true })).toBeNull();
  });

  it('counts a garden cleared before tips existed as met', () => {
    expect(mechanicTip({ mechanic: 'portal', seen: [], cleared: [undefined, 'glass', 'portal'], practice: false })).toBeNull();
    expect(mechanicTip({ mechanic: 'portal', seen: [], cleared: [undefined, 'glass'], practice: false })?.id).toBe('portal');
  });

  it('meets each campaign mechanic in campaign order, one per garden', () => {
    const seen: string[] = [];
    const tipped: string[] = [];
    for (const id of CAMPAIGN_ORDER) {
      const tip = mechanicTip({ mechanic: MAPS.find(m => m.id === id)!.mechanic, seen, cleared: [], practice: false });
      if (tip) { seen.push(tip.id); tipped.push(id); }
    }
    expect(tipped).toEqual(CAMPAIGN_ORDER.filter(id => !['backyard', 'fence', 'rooftop'].includes(id)));
  });

  it('saves seen tips and drops unknown ids', () => {
    const p = sanitizeProgress({ ...freshProgress(), seenTips: ['wind', 'wind', 'teleport', 3, 'portal'] }, MAP_IDS);
    expect(p.seenTips).toEqual(['wind', 'portal']);
    expect(sanitizeProgress({ ...freshProgress(), seenTips: 'wind' }, MAP_IDS).seenTips).toEqual([]);
  });
});
