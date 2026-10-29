import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeadlineError, runWithDeadline } from '../lib/deadline';
import { getBestUrl, predictBestUrl, selectBestUrlFromCandidates } from '../lib/apiClients/gemini';
import { searchTopUrls } from '../lib/apiClients/customSearch';
import { DEFAULT_SETTINGS } from '../lib/settings';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

const base = { apiKey: 'fake-key', query: 'example', model: DEFAULT_SETTINGS.model, timeoutMs: 100, candidateCount: 5, candidates: [], cx: 'fake-cx', num: 5 };
const clients = [getBestUrl, predictBestUrl, selectBestUrlFromCandidates, searchTopUrls];
describe.each(clients)('%s deadline includes the complete response', (client) => {
  it.each(['fetch', 'json', 'error body'])('settles and aborts when %s never resolves', async (phase) => {
    let signal: AbortSignal;
    const pending = () => new Promise<never>(() => {});
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      signal = init.signal;
      return phase === 'fetch' ? pending() : Promise.resolve({ ok: phase === 'json', json: pending, text: pending });
    }));
    const assertion = expect(client(base)).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal!.aborted).toBe(true);
  });

  it('honors parent cancellation and does not leave a deadline timer', async () => {
    const controller = new AbortController();
    let signal: AbortSignal;
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}); }));
    const assertion = expect(client({ ...base, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(signal!.aborted).toBe(true);
  });

  it('cleans up after successful body consumption', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      items: [{ link: 'https://example.com/' }],
      candidates: [{ content: { parts: [{ text: '{"url":"https://example.com/","confidence":0.9}' }] } }],
    }))));
    await expect(client(base)).resolves.toBeTruthy();
  });
});

it('does not start an already cancelled operation', async () => {
  const controller = new AbortController(); controller.abort();
  const operation = vi.fn();
  await expect(runWithDeadline(operation, Date.now() + 100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(operation).not.toHaveBeenCalled();
});

it('rejects a result completed past the deadline even before the timer callback runs', async () => {
  await expect(runWithDeadline(async () => { vi.setSystemTime(Date.now() + 101); return 'late'; }, Date.now() + 100)).rejects.toBeInstanceOf(DeadlineError);
});

it('removes the parent listener and collects a late rejection', async () => {
  const parent = new AbortController();
  const remove = vi.spyOn(parent.signal, 'removeEventListener');
  let rejectLate!: (error: Error) => void;
  const assertion = expect(runWithDeadline(() => new Promise((_, reject) => { rejectLate = reject; }), Date.now() + 100, parent.signal)).rejects.toBeInstanceOf(DeadlineError);
  await vi.advanceTimersByTimeAsync(100); await assertion;
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  rejectLate(new Error('late rejection'));
  await vi.advanceTimersByTimeAsync(0);
});
