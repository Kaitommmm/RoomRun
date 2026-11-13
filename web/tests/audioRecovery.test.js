import { test, expect, vi, afterEach } from 'vitest';
import { createAudio } from '../src/audio/audio.js';

afterEach(() => vi.unstubAllGlobals());

function browser({ failures = 0, pendingFirst = false, badOgg = false, canOgg = true, pendingFiles = false } = {}) {
  const contexts = [];
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = () => ({ connect: vi.fn(target => target) });
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.sources = []; contexts.push(this); }
    resume = vi.fn(() => {
      if (pendingFirst && this.resume.mock.calls.length === 1) return new Promise(() => {});
      if (failures-- > 0) return Promise.reject(new Error('User gesture required'));
      this.state = 'running'; return Promise.resolve();
    });
    createGain = vi.fn(() => ({ ...node(), gain: param() }));
    createBufferSource() {
      const source = { ...node(), playbackRate: param(), start: vi.fn() };
      this.sources.push(source); return source;
    }
    createOscillator = vi.fn(() => ({ ...node(), frequency: param(), start: vi.fn(), stop: vi.fn() }));
    decodeAudioData = vi.fn(async bytes => {
      if (badOgg && new Uint8Array(bytes)[0] === 1) throw new Error('Unsupported Vorbis');
      return { length: 44100, duration: 1 };
    });
  }
  const fetch = vi.fn(url => pendingFiles ? new Promise(() => {}) : Promise.resolve({
    ok: true, headers: { get: () => 'audio/' + (url.endsWith('.ogg') ? 'ogg' : 'mpeg') },
    arrayBuffer: async () => new Uint8Array([url.endsWith('.ogg') ? 1 : 2]).buffer,
  }));
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('Audio', class { canPlayType() { return canOgg ? 'probably' : ''; } });
  vi.stubGlobal('fetch', fetch);
  return { contexts, fetch, audio: createAudio() };
}

test('a rejected first mobile unlock can be retried on a later tap', async () => {
  const { audio, contexts } = browser({ failures: 1 });
  expect(await audio.unlock()).toBe(false);
  expect(await audio.unlock()).toBe(true);
  expect(contexts).toHaveLength(1);
  expect(contexts[0].resume).toHaveBeenCalledTimes(2);
});

test('a pending first resume does not block the next tap', async () => {
  const { audio, contexts } = browser({ pendingFirst: true });
  void audio.unlock();
  expect(await audio.unlock()).toBe(true);
  expect(contexts[0].resume).toHaveBeenCalledTimes(2);
});

test('interrupted mobile audio resumes without duplicating music or loops', async () => {
  const { audio, contexts } = browser();
  await audio.unlock();
  await vi.waitFor(() => expect(audio.status().music).toBe(true));
  const ctx = contexts[0];
  expect(ctx.sources).toHaveLength(4);
  ctx.state = 'interrupted';
  expect(await audio.unlock()).toBe(true);
  await audio.unlock();
  expect(ctx.resume).toHaveBeenCalledTimes(2);
  expect(ctx.sources).toHaveLength(4);
});

test('unsupported Ogg decoding falls back to MP3 for effects and music', async () => {
  const { audio, fetch } = browser({ badOgg: true });
  await audio.unlock();
  await vi.waitFor(() => expect(audio.status().music).toBe(true));
  expect(audio.status().files).toContain('coin');
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/music.mp3'))).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/coin.mp3'))).toBe(true);
});

test('a browser without Ogg support loads MP3 first', async () => {
  const { audio, fetch } = browser({ canOgg: false });
  await audio.unlock();
  await vi.waitFor(() => expect(audio.status().music).toBe(true));
  expect(fetch.mock.calls.every(([url]) => url.endsWith('.mp3'))).toBe(true);
});

test('the sound test can use synth while audio files are still loading', async () => {
  const { audio, contexts } = browser({ pendingFiles: true });
  expect(await audio.unlock()).toBe(true);
  expect(() => audio.play('coin')).not.toThrow();
  expect(contexts[0].createOscillator).toHaveBeenCalledTimes(2);
});

test('saved zero volumes apply before the first mobile audio unlock', async () => {
  const { audio, contexts } = browser();
  audio.setVolumes({ music: 0, effects: 0 });
  expect(contexts).toHaveLength(0);
  await audio.unlock();
  await vi.waitFor(() => expect(audio.status().music).toBe(true));
  expect(contexts[0].createGain.mock.results.every(result => result.value.gain.value === 0)).toBe(true);
});

test('live volume settings update both music layers and effects without restarting audio', async () => {
  const { audio, contexts } = browser();
  await audio.unlock();
  await vi.waitFor(() => expect(audio.status().music).toBe(true));
  audio.setChase(true);
  audio.setVolumes({ music: 50, effects: 25 });
  const gains = contexts[0].createGain.mock.results.map(result => result.value.gain);
  expect(gains[0].setTargetAtTime).toHaveBeenLastCalledWith(0.25, 0, 0.02);
  expect(gains[3].setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.02);
  expect(gains[4].setTargetAtTime).toHaveBeenLastCalledWith(0.16, 0, 0.02);
  expect(contexts).toHaveLength(1);
});
