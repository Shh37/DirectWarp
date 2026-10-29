import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, DEFAULT_SETTINGS, SETTINGS_KEY, TAVILY_API_KEY_KEY } from '../lib/settings';
import { mockStorage } from './storageMock';
import fixture from './fixtures/tavily-search.json';

type Reply = { ok: boolean; url?: string; error?: string };
let listener: (message: unknown, sender: unknown, reply: (value: Reply) => void) => boolean;
let data: Record<string, unknown>;
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  ({ data } = mockStorage({
    [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, searchProvider: 'tavily', timeoutMs: 1000 },
    [TAVILY_API_KEY_KEY]: 'tvly-synthetic-key', [API_KEY_KEY]: 'gemini-synthetic-key',
    [CUSTOM_SEARCH_API_KEY_KEY]: 'old-search-key', [CUSTOM_SEARCH_CX_KEY]: 'old-cx',
  }));
  Object.assign(browser, { runtime: { onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } } });
  vi.stubGlobal('defineBackground', (start: () => void) => start());
  await import('../entrypoints/background');
});
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mockApis(prediction: unknown = { url: fixture.results[0].url, confidence: 0.9 }, search: unknown = fixture, status = 200) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    if (String(input) === 'https://api.tavily.com/search') return new Response(JSON.stringify(search), { status });
    if (String(input).startsWith('https://generativelanguage.googleapis.com/')) return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(prediction) }] } }] }));
    throw new Error('Unselected service');
  });
}
async function resolveQuery() {
  const reply = vi.fn();
  listener({ type: 'directwarp:resolve', query: fixture.query, deadlineAt: Date.now() + 1000 }, { tab: { id: 1 } }, reply);
  await vi.advanceTimersByTimeAsync(0);
  return reply;
}
function expectNoCandidateDisclosure() {
  const gemini = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('https://generativelanguage.googleapis.com/'));
  expect(gemini).toHaveLength(1);
  const body = String(gemini[0][1]?.body);
  expect(body).toContain(fixture.query);
  for (const item of fixture.results) for (const value of [item.url, item.title, item.content]) expect(body).not.toContain(value);
  expect(body).not.toMatch(/tvly-synthetic-key|old-search-key|old-cx/);
  expect(browser.storage.local.get).not.toHaveBeenCalledWith(CUSTOM_SEARCH_API_KEY_KEY);
  expect(browser.storage.local.set).not.toHaveBeenCalled();
}

it('redirects only for an exact high-confidence match without sending candidates to Gemini', async () => {
  mockApis(); const reply = await resolveQuery();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: true, url: fixture.results[0].url });
  expect(fetch).toHaveBeenCalledTimes(2); expectNoCandidateDisclosure();
});
it.each([
  { url: fixture.results[0].url, confidence: 0.84 },
  { url: 'https://example.com/other', confidence: 1 },
  { url: 'https://outside.example/', confidence: 1 },
  { url: 'javascript:alert(1)', confidence: 1 },
  { url: fixture.results[0].url, confidence: '1' },
])('falls back on rejected prediction %j without a candidate-selection request', async (prediction) => {
  mockApis(prediction); const reply = await resolveQuery();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.any(String) });
  expect(fetch).toHaveBeenCalledTimes(2); expectNoCandidateDisclosure();
});
it.each([200, 401, 403, 429, 432, 500])('falls back on an empty result or search HTTP %s', async (status) => {
  mockApis(undefined, { results: [] }, status); const reply = await resolveQuery();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.any(String) });
  expect(JSON.stringify(reply.mock.calls)).not.toMatch(/tvly-synthetic-key|gemini-synthetic-key|old-search-key/);
  expect(fetch).toHaveBeenCalledTimes(2); expectNoCandidateDisclosure();
});
it.each([TAVILY_API_KEY_KEY, API_KEY_KEY])('does not send requests when %s is missing', async (key) => {
  delete data[key]; const reply = await resolveQuery();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringMatching(/未設定|設定されていません/) });
  expect(fetch).not.toHaveBeenCalled();
});
it('uses the shared deadline and never replies twice after delayed search completion', async () => {
  let finish!: (response: Response) => void;
  mockApis(); vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const reply = await resolveQuery(); await vi.advanceTimersByTimeAsync(1000);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('タイムアウト') });
  finish(new Response(JSON.stringify(fixture))); await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledOnce(); expectNoCandidateDisclosure();
});
