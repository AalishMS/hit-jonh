import { ONLINE } from '../config/tuning';

export function generateRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ONLINE.codeLength; i++) {
    code += ONLINE.codeAlphabet[Math.floor(random() * ONLINE.codeAlphabet.length)];
  }
  return code;
}

/** Upper-cases and drops spaces/dashes; null unless the result is a well-formed code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== ONLINE.codeLength) return null;
  return [...code].every(ch => ONLINE.codeAlphabet.includes(ch)) ? code : null;
}
