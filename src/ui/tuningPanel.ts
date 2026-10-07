import { FX } from '../config/tuning';

/**
 * Dev-only live tuning for presentation values (`?tune` in `npm run dev`).
 * Edits the mutable FX object in place; "Copy" puts the current values on the clipboard
 * so they can be pasted back into src/config/tuning.ts. Never shipped: main.ts imports it
 * behind import.meta.env.DEV.
 */
export function mountTuningPanel(): void {
  const defaults = { ...FX };
  const panel = document.createElement('details');
  panel.className = 'tuning-panel';
  panel.open = true;
  panel.innerHTML = '<summary>FX tuning</summary>';
  const style = document.createElement('style');
  style.textContent = `
    .tuning-panel { position: fixed; left: 8px; top: 8px; z-index: 100; width: 280px; max-height: calc(100vh - 16px); overflow: auto;
      background: #FFF7E6F2; border: 3px solid #2A1B2E; border-radius: 10px; padding: 6px 10px; font: 700 12px Nunito, system-ui, sans-serif; color: #2A1B2E; }
    .tuning-panel summary { font: 400 16px 'Luckiest Guy', Impact, sans-serif; cursor: pointer; }
    .tuning-panel label { display: grid; grid-template-columns: 1fr 52px; gap: 2px 6px; margin: 4px 0; }
    .tuning-panel input[type=range] { grid-column: 1 / -1; width: 100%; height: 18px; }
    .tuning-panel output { text-align: right; font-variant-numeric: tabular-nums; }
    .tuning-panel button { margin: 6px 6px 2px 0; font: 800 12px Nunito, sans-serif; border: 2px solid #2A1B2E; border-radius: 8px; background: #fff; padding: 4px 8px; cursor: pointer; }`;
  document.head.appendChild(style);
  const fx = FX as Record<string, number>;
  const inputs: Array<() => void> = [];
  for (const key of Object.keys(defaults)) {
    const base = (defaults as Record<string, number>)[key]!;
    const step = Number.isInteger(base) && base >= 2 ? 1 : 0.005;
    const label = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = key;
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(Math.max(1, base * 3));
    input.step = String(step);
    const sync = () => { input.value = String(fx[key]); output.textContent = fx[key]!.toFixed(step === 1 ? 0 : 3); };
    input.addEventListener('input', () => { fx[key] = Number(input.value); output.textContent = Number(input.value).toFixed(step === 1 ? 0 : 3); });
    sync();
    inputs.push(sync);
    label.append(name, output, input);
    panel.appendChild(label);
  }
  const copy = document.createElement('button');
  copy.textContent = 'Copy JSON';
  copy.addEventListener('click', () => { void navigator.clipboard?.writeText(JSON.stringify(FX, null, 2)); });
  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => { Object.assign(FX, defaults); inputs.forEach(f => f()); });
  panel.append(copy, reset);
  document.body.appendChild(panel);
}
