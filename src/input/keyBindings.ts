/**
 * Remappable gameplay keys (accessibility pass) [DECIDED request 2026-11-25; set PROPOSED]. Pure:
 * no DOM. Bindings are `KeyboardEvent.code` values saved in settings. Escape (pause/back) and Tab
 * (focus) are never bindable. Binding a key that another action uses swaps the two.
 */
export const KEY_ACTIONS = ['fire', 'next', 'angleDown', 'angleUp', 'powerDown', 'powerUp', 'retry', 'mute'] as const;
export type KeyAction = typeof KEY_ACTIONS[number];
export type KeyBindings = Readonly<Record<KeyAction, string>>;

export const DEFAULT_KEYS: KeyBindings = {
  fire: 'Space',
  next: 'Enter',
  angleDown: 'ArrowLeft',
  angleUp: 'ArrowRight',
  powerDown: 'ArrowDown',
  powerUp: 'ArrowUp',
  retry: 'KeyR',
  mute: 'KeyM',
};

export const KEY_ACTION_LABELS: Readonly<Record<KeyAction, string>> = {
  fire: 'Fire',
  next: 'Skip / next',
  angleDown: 'Angle down',
  angleUp: 'Angle up',
  powerDown: 'Power down',
  powerUp: 'Power up',
  retry: 'Aim again / retry',
  mute: 'Sound on / off',
};

const BINDABLE = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9A-Za-z]+|Arrow(Up|Down|Left|Right)|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Comma|Period|Slash|Semicolon|Quote|Backquote|Backslash|BracketLeft|BracketRight|Minus|Equal|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|F([1-9]|1[0-2]))$/;

/** A key a player may bind (never Escape or Tab, which pause and move focus). */
export function isBindableCode(code: unknown): code is string {
  return typeof code === 'string' && BINDABLE.test(code);
}

/** Saved bindings, each falling back to its default; any clash left over resets to the defaults. */
export function sanitizeKeys(raw: unknown): KeyBindings {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const keys = Object.fromEntries(KEY_ACTIONS.map(a => [a, isBindableCode(source[a]) ? source[a] : DEFAULT_KEYS[a]])) as Record<KeyAction, string>;
  return new Set(Object.values(keys)).size === KEY_ACTIONS.length ? keys : { ...DEFAULT_KEYS };
}

/** Binds `code` to `action`; the action that had `code` takes `action`'s old key. */
export function rebind(keys: KeyBindings, action: KeyAction, code: string): KeyBindings {
  if (!isBindableCode(code) || keys[action] === code) return keys;
  const next: Record<KeyAction, string> = { ...keys };
  const other = KEY_ACTIONS.find(a => keys[a] === code);
  if (other) next[other] = keys[action];
  next[action] = code;
  return next;
}

/** The action bound to `code`, if any. */
export function actionFor(keys: KeyBindings, code: string): KeyAction | null {
  return KEY_ACTIONS.find(a => keys[a] === code) ?? null;
}

const NAMED: Record<string, string> = {
  Space: 'Space', Enter: '↵', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backspace: 'Backspace',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', PageUp: 'Page Up', PageDown: 'Page Down',
};

/** A short label for a key code: "Space", "↵", "←", "R", "1", "Num 5". */
export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code]!;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
