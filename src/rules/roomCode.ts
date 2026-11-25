import { FRIENDS_BOARD, ONLINE } from '../config/tuning';

function generateCode(random: () => number, length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ONLINE.codeAlphabet[Math.floor(random() * ONLINE.codeAlphabet.length)];
  }
  return code;
}

/** Upper-cases and drops spaces/dashes; null unless the result is a well-formed code of `length`. */
function normalizeCode(input: string, length: number): string | null {
  const code = input.toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== length) return null;
  return [...code].every(ch => ONLINE.codeAlphabet.includes(ch)) ? code : null;
}

export const generateRoomCode = (random: () => number): string => generateCode(random, ONLINE.codeLength);
export const normalizeRoomCode = (input: string): string | null => normalizeCode(input, ONLINE.codeLength);

/** Friends boards last for weeks, so their codes are long enough that they can't be found by guessing. */
export const generateBoardCode = (random: () => number): string => generateCode(random, FRIENDS_BOARD.codeLength);
export const normalizeBoardCode = (input: string): string | null => normalizeCode(input, FRIENDS_BOARD.codeLength);
