import { describe, expect, it } from 'vitest';
import { sentence } from '../src/ui/announcer';

describe('screen-reader sentences', () => {
  it('join parts with full stops and drop empty ones', () => {
    expect(sentence('Sudden death', 'Pass the cannon to Ana', 'One shot each. Best hit wins.')).toBe('Sudden death. Pass the cannon to Ana. One shot each. Best hit wins.');
    expect(sentence('Bullseye!', null, '', false, '2 of 3 stars')).toBe('Bullseye! 2 of 3 stars.');
    expect(sentence('Jonh wins…', undefined)).toBe('Jonh wins…');
    expect(sentence()).toBe('');
  });
});
