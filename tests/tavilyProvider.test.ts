import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareSearchProvider } from '../lib/search';
import { DeadlineError } from '../lib/deadline';
import { TAVILY_API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY } from '../lib/settings';
import type { SearchContext, SearchRequest } from '../lib/search/types';
import { mockStorage } from './storageMock';
import fixture from './fixtures/tavily-search.json';

const secrets = { [TAVILY_API_KEY_KEY]: 'tvly-synthetic-key', [CUSTOM_SEARCH_API_KEY_KEY]: 'legacy-key', [CUSTOM_SEARCH_CX_KEY]: 'legacy-cx' };
let controller: AbortController;
let context: SearchContext;
let request: SearchRequest;
beforeEach(() => {
  vi.useFakeTimers(); mockStorage(secrets); controller = new AbortController();
  context = { signal: controller.signal, deadlineAt: Date.now() + 1000 };
  request = { ...context, query: fixture.query, count: 5 };
});
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function provider() {
  const result = await prepareSearchProvider('tavily', context);
  if (!result.ok) throw new Error(result.error.message);
  expect(result.provider.selectionMode).toBe('prediction-only');
  return result.provider;
}

it('maps a synthetic official-schema fixture with one basic request and header-only credentials', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fixture)));
  expect(await (await provider()).search(request)).toEqual({ ok: true, candidates: fixture.results.map((item) => ({ url: item.url, title: item.title, snippet: item.content })) });
  expect(browser.storage.local.get).toHaveBeenCalledExactlyOnceWith(TAVILY_API_KEY_KEY);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe('https://api.tavily.com/search');
  expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer tvly-synthetic-key', 'Content-Type': 'application/json' } });
  expect(JSON.parse(String(init?.body))).toEqual({ query: request.query, max_results: 5, topic: 'general', search_depth: 'basic', auto_parameters: false, include_answer: false, include_raw_content: false, include_images: false });
  expect(String(init?.body)).not.toMatch(/tvly-synthetic-key|legacy-key|legacy-cx/);
  expect(browser.storage.local.set).not.toHaveBeenCalled();
  expect(init?.signal?.aborted).toBe(true);
});

it('caps candidates, rejects unsafe URLs, and preserves exact URL spelling', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ results: [
    { url: 'javascript:alert(1)' }, { url: 'https://user@example.com/' },
    { url: 'https://example.com/%E6%97%A5?q=a%20b#part', title: '日本語' }, ...fixture.results,
  ] })));
  expect(await (await provider()).search({ ...request, count: 1 })).toEqual({ ok: true, candidates: [{ url: 'https://example.com/%E6%97%A5?q=a%20b#part', title: '日本語', snippet: undefined }] });
});
it.each([{ results: [] }, { results: [{ url: 'ftp://example.com/' }] }])('returns zero usable candidates: %j', async (value) => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(value)));
  expect(await (await provider()).search(request)).toEqual({ ok: true, candidates: [] });
});
it.each(['not json', 'null', '[]', '{}', '{"results":null}', '{"results":{}}', '{"results":[null]}', '{"results":[{}]}', '{"results":[{"url":7}]}', '{"results":[{"url":"https://example.com/","title":7}]}', '{"results":[{"url":"https://example.com/","content":[]}]}'])('rejects malformed responses: %s', async (body) => {
  vi.mocked(fetch).mockResolvedValue(new Response(body));
  expect(await (await provider()).search(request)).toEqual({ ok: false, error: { kind: 'invalid_response', message: expect.any(String) } });
});
it.each([[400, 'invalid_request'], [422, 'invalid_request'], [401, 'authentication'], [403, 'authentication'], [429, 'rate_limited'], [432, 'rate_limited'], [433, 'rate_limited'], [434, 'unavailable'], [500, 'unavailable'], [503, 'unavailable']])('classifies HTTP %s without retrying, reading or exposing the error body', async (status, kind) => {
  const json = vi.fn(), text = vi.fn();
  vi.mocked(fetch).mockResolvedValue({ ok: false, status, json, text } as unknown as Response);
  const result = await (await provider()).search(request);
  expect(result).toEqual({ ok: false, error: { kind, message: expect.any(String) } });
  expect(fetch).toHaveBeenCalledOnce(); expect(json).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain(secrets[TAVILY_API_KEY_KEY]);
});
it('sanitizes network errors', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('tvly-synthetic-key PRIVATE_QUERY'));
  const result = await (await provider()).search(request);
  expect(result).toEqual({ ok: false, error: { kind: 'network', message: expect.any(String) } });
  expect(JSON.stringify(result)).not.toMatch(/tvly-synthetic-key|PRIVATE_QUERY/);
});
it.each([null, undefined, 7, {}, '', '   '])('rejects missing/invalid stored key %j without a probe', async (key) => {
  mockStorage({ [TAVILY_API_KEY_KEY]: key });
  expect(await prepareSearchProvider('tavily', context)).toEqual({ ok: false, error: { kind: 'not_configured', message: expect.any(String) } });
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['bad key', 'bad\r\nheader', 'bad\tkey', '日本語', 'bad\x7fkey'])('rejects unsafe header key %j', async (key) => {
  mockStorage({ [TAVILY_API_KEY_KEY]: key });
  expect(await prepareSearchProvider('tavily', context)).toEqual({ ok: false, error: { kind: 'authentication', message: expect.any(String) } });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([{ count: 0 }, { count: 11 }, { count: 1.1 }, { count: NaN }, { query: '' }, { query: ' ' }])('rejects invalid request %j', async (change) => {
  expect(await (await provider()).search({ ...request, ...change })).toEqual({ ok: false, error: { kind: 'invalid_request', message: expect.any(String) } });
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['fetch', 'body'])('enforces the shared deadline during %s and ignores a late success', async (phase) => {
  let signal!: AbortSignal, finish!: (value: any) => void;
  vi.mocked(fetch).mockImplementation(async (_, init) => {
    signal = init?.signal as AbortSignal;
    const pending = new Promise<any>((resolve) => { finish = resolve; });
    return phase === 'fetch' ? pending : { ok: true, json: () => pending } as Response;
  });
  const adapter = await provider(); await vi.advanceTimersByTimeAsync(700);
  const done = vi.fn(); const pending = adapter.search(request).then((result) => { done(result); return result; });
  await vi.advanceTimersByTimeAsync(299); expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toEqual({ ok: false, error: { kind: 'timeout', message: expect.any(String) } });
  expect(signal.aborted).toBe(true);
  finish(phase === 'fetch' ? new Response(JSON.stringify(fixture)) : fixture);
  await vi.advanceTimersByTimeAsync(0); expect(done).toHaveBeenCalledOnce();
});
it.each(['cancelled', 'timeout'])('propagates parent %s without more requests', async (kind) => {
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  const pending = (await provider()).search(request); await vi.advanceTimersByTimeAsync(0);
  controller.abort(kind === 'timeout' ? new DeadlineError() : undefined);
  expect(await pending).toEqual({ ok: false, error: { kind, message: expect.any(String) } });
  expect(fetch).toHaveBeenCalledOnce();
});
it('times out credential loading and does not issue late requests', async () => {
  let finish!: (value: object) => void;
  vi.mocked(browser.storage.local.get).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = prepareSearchProvider('tavily', context); await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toEqual({ ok: false, error: { kind: 'timeout', message: expect.any(String) } });
  finish({ [TAVILY_API_KEY_KEY]: 'tvly-late' }); await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
});
it('does not load Tavily credentials when Custom Search is selected', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [] })));
  const result = await prepareSearchProvider('custom-search', context);
  if (!result.ok) throw new Error('Unexpected preparation failure');
  expect(result.provider.selectionMode).toBe('candidate-selection');
  await result.provider.search(request);
  expect(browser.storage.local.get).not.toHaveBeenCalledWith(TAVILY_API_KEY_KEY);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('www.googleapis.com/customsearch');
  expect(fetch).toHaveBeenCalledOnce();
});
