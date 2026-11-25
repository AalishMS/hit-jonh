import { describe, expect, it } from 'vitest';
import { MAP_IDS } from '../src/levels';
import {
  CAMPAIGN_ORDER, campaignOrder, campaignStatus, campaignSuccessor, campaignTotals, continueTarget, nextCampaignMap, starsFor,
} from '../src/rules/campaign';

const best = (bestShots: number | null, hasStyle = false) => ({ bestShots, hasStyle });

describe('campaign', () => {
  it('orders every map, authored ones first and unknown new maps at the end', () => {
    expect(campaignOrder(MAP_IDS)).toHaveLength(MAP_IDS.length);
    expect(new Set(campaignOrder(MAP_IDS))).toEqual(new Set(MAP_IDS));
    expect(campaignOrder(['zeta', ...CAMPAIGN_ORDER])).toEqual([...CAMPAIGN_ORDER, 'zeta']);
    for (const id of CAMPAIGN_ORDER) expect(MAP_IDS).toContain(id);
  });

  it('stars come from the fewest shots used (3/2/1), none without a hit', () => {
    expect(starsFor(best(1))).toBe(3);
    expect(starsFor(best(2))).toBe(2);
    expect(starsFor(best(3))).toBe(1);
    expect(starsFor(best(null))).toBe(0);
    expect(starsFor(undefined)).toBe(0);
  });

  it('a fresh save unlocks only the first garden', () => {
    const entries = campaignStatus(CAMPAIGN_ORDER, {});
    expect(entries.map(e => e.unlocked)).toEqual(CAMPAIGN_ORDER.map((_, i) => i === 0));
    expect(entries[1]!.lockedBy).toBe(CAMPAIGN_ORDER[0]);
    expect(continueTarget(entries)).toBe(CAMPAIGN_ORDER[0]);
  });

  it('clearing a garden (any stars) unlocks the next; a failed try does not', () => {
    const [first, second, third] = CAMPAIGN_ORDER as [string, string, string];
    const tried = campaignStatus(CAMPAIGN_ORDER, { [first]: best(null) });
    expect(tried[1]!.unlocked).toBe(false);
    const cleared = campaignStatus(CAMPAIGN_ORDER, { [first]: best(3) });
    expect(cleared[1]!.unlocked).toBe(true);
    expect(cleared[2]!.unlocked).toBe(false);
    expect(nextCampaignMap(cleared, first)).toBe(second);
    expect(nextCampaignMap(cleared, second)).toBeNull();
    expect(continueTarget(cleared)).toBe(second);
    expect(cleared[2]!.lockedBy).toBe(second);
    void third;
  });

  it('never locks a garden that already has a record (saves from before the campaign)', () => {
    const last = CAMPAIGN_ORDER[CAMPAIGN_ORDER.length - 1]!;
    const entries = campaignStatus(CAMPAIGN_ORDER, { [last]: best(2, true) });
    expect(entries.find(e => e.mapId === last)).toMatchObject({ unlocked: true, stars: 2, trick: true, cleared: true });
  });

  it('totals stars, tricks and cleared gardens; Continue goes for missing stars once all are cleared', () => {
    const solo = Object.fromEntries(CAMPAIGN_ORDER.map((id, i) => [id, best(i === 2 ? 2 : 1, i < 3)]));
    const entries = campaignStatus(CAMPAIGN_ORDER, solo);
    expect(campaignTotals(entries)).toEqual({ stars: CAMPAIGN_ORDER.length * 3 - 1, maxStars: CAMPAIGN_ORDER.length * 3, tricks: 3, cleared: CAMPAIGN_ORDER.length, count: CAMPAIGN_ORDER.length });
    expect(continueTarget(entries)).toBe(CAMPAIGN_ORDER[2]);
    const perfect = campaignStatus(CAMPAIGN_ORDER, Object.fromEntries(CAMPAIGN_ORDER.map(id => [id, best(1)])));
    expect(continueTarget(perfect)).toBeNull();
  });
});

describe('campaignSuccessor', () => {
  it('names the next garden in campaign order, locked or not, and null after the last', () => {
    const order = CAMPAIGN_ORDER.filter(id => MAP_IDS.includes(id));
    expect(campaignSuccessor(MAP_IDS, order[0]!)).toBe(order[1]);
    expect(campaignSuccessor(MAP_IDS, 'nowhere')).toBeNull();
    const all = [...order, ...MAP_IDS.filter(id => !order.includes(id))];
    expect(campaignSuccessor(MAP_IDS, all[all.length - 1]!)).toBeNull();
  });
});
