import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { mockStorage } from './storageMock';

let listener: (message: any, sender: any, reply: (value: any) => void) => unknown;
const sender = { tab: { id: 7 }, frameId: 0 };
const searchResult = () => new Response(JSON.stringify({ items: [{ link: 'https://example.com/' }] }));
const geminiResult = (confidence = 0.9) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ url: 'https://example.com/', confidence }) }] } }] }));
let signals: AbortSignal[];

beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules(); signals = [];
  mockStorage({
    [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, searchProvider: 'custom-search', timeoutMs: 1000 },
    [API_KEY_KEY]: 'fake-gemini', [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-search', [CUSTOM_SEARCH_CX_KEY]: 'fake-cx',
  });
  Object.assign(browser, { runtime: { onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } } });
  vi.stubGlobal('defineBackground', (start: () => void) => start());
  await import('../entrypoints/background');
});
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

function mockFetch(handler: (search: boolean) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    signals.push(init.signal as AbortSignal);
    return handler(url.includes('customsearch'));
  }));
}
async function start(deadlineAt = Date.now() + 1000) {
  const reply = vi.fn();
  expect(listener({ type: 'directwarp:resolve', query: 'example', requestId: 'request', deadlineAt }, sender, reply)).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  return reply;
}
const pending = () => new Promise<Response>(() => {});

it('settles never-ending requests once within the total budget and aborts all requests', async () => {
  mockFetch(pending);
  const reply = await start();
  await vi.advanceTimersByTimeAsync(999); expect(reply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('タイムアウト') });
  expect(signals).toHaveLength(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it.each(['failure', 'empty'])('cancels a pending prediction on search %s', async (mode) => {
  mockFetch((search) => search ? (mode === 'failure' ? Promise.reject(new Error('search failed')) : Promise.resolve(new Response('{"items":[]}'))) : pending());
  const reply = await start();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.any(String) });
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it('collects early prediction failure while search is still pending', async () => {
  let resolveSearch!: (value: Response) => void;
  let geminiCalls = 0;
  mockFetch((search) => search ? new Promise((resolve) => { resolveSearch = resolve; })
    : ++geminiCalls === 1 ? Promise.reject(new Error('early prediction failure')) : Promise.resolve(geminiResult()));
  const reply = await start();
  await vi.advanceTimersByTimeAsync(700); expect(reply).not.toHaveBeenCalled();
  resolveSearch(searchResult()); await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: true, url: 'https://example.com/' });
});

it('shares the remaining budget with selection instead of starting a new timeout', async () => {
  let resolveSearch!: (value: Response) => void;
  let geminiCalls = 0;
  mockFetch((search) => search ? new Promise((resolve) => { resolveSearch = resolve; })
    : ++geminiCalls === 1 ? Promise.resolve(geminiResult(0.1)) : pending());
  const reply = await start();
  await vi.advanceTimersByTimeAsync(700); resolveSearch(searchResult()); await vi.advanceTimersByTimeAsync(0);
  expect(signals).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(299); expect(reply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('タイムアウト') });
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it('does not resend a response when fetch resolves after the deadline', async () => {
  let late!: (value: Response) => void;
  mockFetch((search) => search ? new Promise((resolve) => { late = resolve; }) : pending());
  const reply = await start(); await vi.advanceTimersByTimeAsync(1000);
  late(searchResult()); await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(['cancel', 'navigation', 'tab closed'])('cancels on %s and responds once', async (action) => {
  mockFetch(pending); const reply = await start();
  if (action === 'cancel') listener({ type: 'directwarp:cancel', requestId: 'request' }, sender, vi.fn());
  if (action === 'navigation') vi.mocked(browser.tabs.onUpdated.addListener).mock.calls[0][0](7, { status: 'loading' }, {} as any);
  if (action === 'tab closed') vi.mocked(browser.tabs.onRemoved.addListener).mock.calls[0][0](7, {} as any);
  await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.any(String) });
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it('scopes cancellation to the sending tab and frame', async () => {
  mockFetch(pending); const reply = await start();
  listener({ type: 'directwarp:cancel', requestId: 'request' }, { tab: { id: 8 }, frameId: 0 }, vi.fn());
  listener({ type: 'directwarp:cancel', requestId: 'request' }, { tab: { id: 7 }, frameId: 1 }, vi.fn());
  await vi.advanceTimersByTimeAsync(0); expect(reply).not.toHaveBeenCalled();
  listener({ type: 'directwarp:cancel', requestId: 'request' }, sender, vi.fn());
  await vi.advanceTimersByTimeAsync(0); expect(reply).toHaveBeenCalledOnce();
});

it('includes message delivery time and a stalled settings read in the content deadline', async () => {
  let lateSettings!: (value: object) => void;
  vi.mocked(browser.storage.local.get).mockImplementationOnce(() => new Promise((resolve) => { lateSettings = resolve; }));
  const reply = await start(Date.now() + 200);
  await vi.advanceTimersByTimeAsync(200);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('タイムアウト') });
  lateSettings({ [SETTINGS_KEY]: DEFAULT_SETTINGS }); await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled(); expect(reply).toHaveBeenCalledOnce();
});
