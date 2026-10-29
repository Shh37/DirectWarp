import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareSearchProvider } from '../lib/search';
import { DeadlineError } from '../lib/deadline';
import { CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY } from '../lib/settings';
import type { SearchContext, SearchProvider, SearchRequest } from '../lib/search/types';
import { mockStorage } from './storageMock';

const credentials = { [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-search-key', [CUSTOM_SEARCH_CX_KEY]: 'fake-cx' };
let controller: AbortController;
let context: SearchContext;
let request: SearchRequest;

beforeEach(() => {
  vi.useFakeTimers();
  mockStorage(credentials);
  controller = new AbortController();
  context = { signal: controller.signal, deadlineAt: Date.now() + 1000 };
  request = { ...context, query: '日本語の検索', count: 3 };
});
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function provider(): Promise<SearchProvider> {
  const result = await prepareSearchProvider('custom-search', context);
  if (!result.ok) throw new Error(result.error.message);
  return result.provider;
}

it('maps only valid candidates, preserves their URLs, and sends one legacy request with its credentials', async () => {
  const url = 'https://example.com/%E6%97%A5?q=a%20b#part';
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [
    { link: url, title: '見出し', snippet: '説明' },
    { link: 'https://example.org/', title: 42, snippet: null },
    { link: 'javascript:alert(1)' }, { link: 'https://user@example.com/' }, null, {},
  ] })));
  const result = await (await provider()).search(request);
  expect(result).toEqual({ ok: true, candidates: [
    { url, title: '見出し', snippet: '説明' }, { url: 'https://example.org/', title: undefined, snippet: undefined },
  ] });
  expect(fetch).toHaveBeenCalledOnce();
  const [input, init] = vi.mocked(fetch).mock.calls[0];
  const sent = new URL(String(input));
  expect(sent.origin + sent.pathname).toBe('https://www.googleapis.com/customsearch/v1');
  expect(Object.fromEntries(sent.searchParams)).toEqual({ key: 'fake-search-key', cx: 'fake-cx', q: request.query, num: '3' });
  expect(init?.method).toBe('GET');
  expect((init?.signal as AbortSignal).aborted).toBe(true);
});

it.each([{}, { items: [] }, { items: [{ link: 'ftp://example.com/' }] }])('represents zero usable candidates as a successful empty result: %j', async (response) => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(response)));
  expect(await (await provider()).search(request)).toEqual({ ok: true, candidates: [] });
});

it.each(['null', '[]', '{"items":{}}', '{"items":null}', '{"error":{}}', 'not json'])('classifies malformed responses without exposing their contents: %s', async (body) => {
  vi.mocked(fetch).mockResolvedValue(new Response(body));
  expect(await (await provider()).search(request)).toEqual({ ok: false, error: { kind: 'invalid_response', message: expect.any(String) } });
});

it.each([[400, 'invalid_request'], [401, 'authentication'], [403, 'authentication'], [429, 'rate_limited'], [500, 'unavailable'], [503, 'unavailable']])('classifies HTTP %s and discards raw error details', async (status, kind) => {
  vi.mocked(fetch).mockResolvedValue(new Response('fake-search-key fake-cx PRIVATE_QUERY', { status: Number(status) }));
  const result = await (await provider()).search(request);
  expect(result).toEqual({ ok: false, error: { kind, message: expect.any(String) } });
  expect(JSON.stringify(result)).not.toMatch(/fake-search-key|fake-cx|PRIVATE_QUERY/);
  expect(fetch).toHaveBeenCalledOnce();
});

it('classifies network failure without exposing the original exception', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('fake-search-key PRIVATE_QUERY'));
  const result = await (await provider()).search(request);
  expect(result).toEqual({ ok: false, error: { kind: 'network', message: expect.any(String) } });
  expect(JSON.stringify(result)).not.toMatch(/fake-search-key|PRIVATE_QUERY/);
});

it.each([['', ''], ['fake-key', ''], ['', 'fake-cx'], [' ', 'fake-cx']])('rejects missing credentials before any request (%j, %j)', async (key, cx) => {
  mockStorage({ [CUSTOM_SEARCH_API_KEY_KEY]: key, [CUSTOM_SEARCH_CX_KEY]: cx });
  expect(await prepareSearchProvider('custom-search', context)).toEqual({ ok: false, error: { kind: 'not_configured', message: expect.any(String) } });
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['none', 'future-service', '', null, undefined, 123])('does not load credentials or probe another service for provider %j', async (id) => {
  const result = await prepareSearchProvider(id, context);
  expect(result).toEqual({ ok: false, error: { kind: id === 'none' ? 'not_configured' : 'unsupported_provider', message: expect.any(String) } });
  expect(browser.storage.local.get).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([{ count: 0 }, { count: 11 }, { count: 1.5 }, { count: NaN }, { query: '' }, { query: '  ' }])('rejects invalid requests without sending them: %j', async (change) => {
  expect(await (await provider()).search({ ...request, ...change })).toEqual({ ok: false, error: { kind: 'invalid_request', message: expect.any(String) } });
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['fetch', 'body', 'error body'])('includes stalled %s in the original deadline and aborts the request', async (phase) => {
  let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementation(async (_, init) => {
    signal = init?.signal as AbortSignal;
    if (phase === 'fetch') return new Promise(() => {});
    return { ok: phase === 'body', status: 503, json: () => new Promise(() => {}), text: () => new Promise(() => {}) } as Response;
  });
  const adapter = await provider();
  await vi.advanceTimersByTimeAsync(700);
  const done = vi.fn();
  const result = adapter.search(request).then((value) => { done(value); return value; });
  await vi.advanceTimersByTimeAsync(299); expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ ok: false, error: { kind: 'timeout', message: expect.any(String) } });
  expect(signal.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
});

it.each(['cancelled', 'timeout'])('propagates parent %s while fetching', async (kind) => {
  let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementation((_, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}); });
  const pending = (await provider()).search(request);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(kind === 'timeout' ? new DeadlineError() : undefined);
  expect(await pending).toEqual({ ok: false, error: { kind, message: expect.any(String) } });
  expect(signal.aborted).toBe(true);
});

it('expires credential loading and never starts a late request', async () => {
  let finish!: (value: object) => void;
  vi.mocked(browser.storage.local.get).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = prepareSearchProvider('custom-search', context);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toEqual({ ok: false, error: { kind: 'timeout', message: expect.any(String) } });
  finish({ [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-key' });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
});

it('classifies storage failures without leaking details', async () => {
  vi.mocked(browser.storage.local.get).mockRejectedValue(new Error('fake-search-key'));
  const result = await prepareSearchProvider('custom-search', context);
  expect(result).toEqual({ ok: false, error: { kind: 'unavailable', message: expect.any(String) } });
  expect(JSON.stringify(result)).not.toContain('fake-search-key');
  expect(fetch).not.toHaveBeenCalled();
});
