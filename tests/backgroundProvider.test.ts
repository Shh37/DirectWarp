import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { API_KEY_KEY, DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { mockStorage } from './storageMock';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), search: vi.fn(), predict: vi.fn(), select: vi.fn() }));
vi.mock('../lib/search', () => ({ prepareSearchProvider: mocks.prepare }));
vi.mock('../lib/apiClients/gemini', () => ({ predictBestUrl: mocks.predict, selectBestUrlFromCandidates: mocks.select }));
let listener: (message: any, sender: any, reply: (value: any) => void) => unknown;
const sender = { tab: { id: 7 }, frameId: 0 };
const candidate = { url: 'https://example.com/', title: 'Title', snippet: 'Description' };

beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mockStorage({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, searchProvider: 'custom-search', timeoutMs: 1000 }, [API_KEY_KEY]: 'fake-gemini' });
  mocks.prepare.mockResolvedValue({ ok: true, provider: { selectionMode: 'candidate-selection', search: mocks.search } });
  mocks.search.mockResolvedValue({ ok: true, candidates: [candidate] });
  mocks.predict.mockResolvedValue({ url: candidate.url, confidence: 0.1 });
  mocks.select.mockResolvedValue({ url: candidate.url, confidence: 0.9 });
  Object.assign(browser, { runtime: { onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } } });
  vi.stubGlobal('defineBackground', (start: () => void) => start());
  await import('../entrypoints/background');
});
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function start() {
  const reply = vi.fn();
  listener({ type: 'directwarp:resolve', query: '日本語', requestId: 'request', deadlineAt: Date.now() + 1000 }, sender, reply);
  await vi.advanceTimersByTimeAsync(0);
  return reply;
}

it('resolves through a mock provider using only common candidates, settings and Gemini credentials', async () => {
  const deadlineAt = Date.now() + 1000;
  const reply = await start();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: true, url: candidate.url });
  expect(browser.storage.local.get).toHaveBeenCalledTimes(2);
  expect(vi.mocked(browser.storage.local.get).mock.calls.map(([key]) => key)).toEqual([SETTINGS_KEY, API_KEY_KEY]);
  expect(mocks.prepare).toHaveBeenCalledWith('custom-search', { deadlineAt, signal: expect.any(AbortSignal) });
  const request = mocks.search.mock.calls[0][0];
  expect(request).toEqual({ query: '日本語', count: DEFAULT_SETTINGS.candidateCount, deadlineAt, signal: expect.any(AbortSignal) });
  expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({ candidates: [candidate], deadlineAt, signal: request.signal }));
  expect(request.signal.aborted).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['empty', 'failure'])('falls back once and aborts a pending prediction after provider %s', async (mode) => {
  mocks.search.mockResolvedValue(mode === 'empty' ? { ok: true, candidates: [] } : { ok: false, error: { kind: 'rate_limited', message: '検索APIの利用上限に達しました。' } });
  mocks.predict.mockImplementation(() => new Promise(() => {}));
  const reply = await start();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.any(String) });
  expect(mocks.predict.mock.calls[0][0].signal.aborted).toBe(true);
  expect(mocks.select).not.toHaveBeenCalled();
});

it('rejects an outside-candidate model result even with a different provider implementation', async () => {
  mocks.select.mockResolvedValue({ url: 'https://outside.example/', confidence: 1 });
  const reply = await start();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('候補に一致しません') });
});

it('enforces the shared deadline even when an adapter does not settle', async () => {
  mocks.search.mockImplementation(() => new Promise(() => {}));
  const reply = await start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('タイムアウト') });
  expect(mocks.search.mock.calls[0][0].signal.aborted).toBe(true);
});

it.each(['prediction-only', undefined])('does not disclose candidates unless the provider explicitly permits it: %j', async (selectionMode) => {
  mocks.prepare.mockResolvedValue({ ok: true, provider: { selectionMode, search: mocks.search } });
  const reply = await start();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('検索候補をAIへ送らず') });
  expect(mocks.select).not.toHaveBeenCalled();
});
