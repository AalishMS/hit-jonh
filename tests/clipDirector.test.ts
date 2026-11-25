import { describe, expect, it } from 'vitest';
import { ClipDirector, type RecorderLike, type ReplayHooks } from '../src/share/clipDirector';
import type { ClipFile } from '../src/share/clipTypes';

const file = (size = 1000): ClipFile => ({ blob: new Blob([new Uint8Array(size)]), type: 'video/webm', name: 'hit-jonh-test.webm', seconds: 4 });

class FakeRecorder implements RecorderLike {
  began = 0;
  cancelled = 0;
  finished = 0;
  failBegin = false;
  result: ClipFile | null = file();
  begin(): void { if (this.failBegin) throw new Error('nope'); this.began++; }
  finish(): Promise<ClipFile | null> { this.finished++; return Promise.resolve(this.result); }
  cancel(): void { this.cancelled++; }
}

function rig(opts: { hidden?: boolean; supported?: boolean; replay?: boolean } = {}) {
  const recorder = new FakeRecorder();
  let hooks: ReplayHooks | null = null;
  let stopped = 0;
  let hiddenCb: (() => void) | null = null;
  let hidden = opts.hidden ?? false;
  const director = new ClipDirector({
    createRecorder: () => (opts.supported === false ? null : recorder),
    startReplay: h => {
      if (opts.replay === false) return null;
      hooks = h;
      // Like the scene: stopping the replay reports its (incomplete) end.
      return { stop: () => { stopped++; h.onEnd(false); } };
    },
    tabHidden: () => hidden,
    onTabHidden: cb => { hiddenCb = cb; return () => { hiddenCb = null; }; },
  });
  return { recorder, director, hooks: () => hooks!, stopped: () => stopped, hideTab: () => { hidden = true; hiddenCb?.(); }, hasHiddenListener: () => hiddenCb !== null };
}

describe('ClipDirector', () => {
  it('records from the start of the window to the replay end and resolves with the clip', async () => {
    const r = rig();
    const pending = r.director.record();
    expect(r.director.busy).toBe(true);
    r.hooks().onRecordStart();
    expect(r.recorder.began).toBe(1);
    r.hooks().onEnd(true);
    const result = await pending;
    expect(result).toMatchObject({ ok: true });
    expect(r.recorder.finished).toBe(1);
    expect(r.director.busy).toBe(false);
    expect(r.hasHiddenListener()).toBe(false);
  });

  it('allows one recording at a time', async () => {
    const r = rig();
    const first = r.director.record();
    expect(await r.director.record()).toEqual({ ok: false, reason: 'busy' });
    r.hooks().onRecordStart();
    r.hooks().onEnd(true);
    await first;
    // ...and a new one afterwards.
    const second = r.director.record();
    expect(r.director.busy).toBe(true);
    r.director.cancel();
    expect(await second).toMatchObject({ ok: false, reason: 'cancelled' });
  });

  it('discards the recording when the replay is skipped or torn down mid-way', async () => {
    const r = rig();
    const pending = r.director.record();
    r.hooks().onRecordStart();
    r.hooks().onEnd(false); // Skip / Home
    expect(await pending).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(r.recorder.cancelled).toBe(1);
    expect(r.recorder.finished).toBe(0);
    expect(r.director.busy).toBe(false);
  });

  it('cancel() stops the replay and discards, also before recording started', async () => {
    const r = rig();
    const pending = r.director.record();
    r.director.cancel();
    expect(r.stopped()).toBe(1);
    expect(await pending).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(r.recorder.began).toBe(0);
  });

  it('discards when the tab is hidden, saying so', async () => {
    const r = rig();
    const pending = r.director.record();
    r.hooks().onRecordStart();
    r.hideTab();
    expect(await pending).toMatchObject({ ok: false, reason: 'hidden' });
    expect(r.recorder.cancelled).toBe(1);
    expect(r.stopped()).toBe(1);
  });

  it('does not start while the tab is hidden', async () => {
    const r = rig({ hidden: true });
    expect(await r.director.record()).toEqual({ ok: false, reason: 'hidden' });
    expect(r.director.busy).toBe(false);
  });

  it('fails cleanly when the browser refuses to start, and stops the replay', async () => {
    const r = rig();
    r.recorder.failBegin = true;
    const pending = r.director.record();
    r.hooks().onRecordStart();
    expect(await pending).toMatchObject({ ok: false, reason: 'failed', message: 'nope' });
    expect(r.stopped()).toBe(1);
    expect(r.director.busy).toBe(false);
  });

  it('fails when the file comes out empty', async () => {
    const r = rig();
    r.recorder.result = file(0);
    const pending = r.director.record();
    r.hooks().onRecordStart();
    r.hooks().onEnd(true);
    expect(await pending).toMatchObject({ ok: false, reason: 'failed' });
  });

  it('fails when unsupported or there is nothing to replay, and a replay that ends before the window records nothing', async () => {
    expect(await rig({ supported: false }).director.record()).toMatchObject({ ok: false, reason: 'failed' });
    const none = rig({ replay: false });
    expect(await none.director.record()).toMatchObject({ ok: false, reason: 'failed' });
    expect(none.director.busy).toBe(false);
    const early = rig();
    const pending = early.director.record();
    early.hooks().onEnd(true);
    expect(await pending).toMatchObject({ ok: false, reason: 'cancelled' });
  });
});
