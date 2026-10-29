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
async function resolveQuery(timeoutMs = 1000) {
  const reply = vi.fn();
  listener({ type: 'directwarp:resolve', requestId: 'request', query: fixture.query, deadlineAt: Date.now() + timeoutMs }, { tab: { id: 1 } }, reply);
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

function holdGemini(phase: 'fetch' | 'body') {
  mockApis();
  const normalFetch = vi.mocked(fetch).getMockImplementation()!;
  let finish!: () => void;
  let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (!String(input).startsWith('https://generativelanguage.googleapis.com/')) return normalFetch(input, init);
    signal = init!.signal!;
    const json = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ url: fixture.results[0].url, confidence: 0.9 }) }] } }] };
    const response = new Response(JSON.stringify(json));
    if (phase === 'fetch') return new Promise((resolve) => { finish = () => resolve(response); });
    vi.spyOn(response, 'json').mockImplementation(() => new Promise((resolve) => { finish = () => resolve(json); }));
    return Promise.resolve(response);
  });
  return { finish: () => finish(), signal: () => signal };
}

it.each(['fetch', 'body'] as const)('accepts Gemini %s completing after 9 seconds within the saved 15-second deadline', async (phase) => {
  data[SETTINGS_KEY] = { ...DEFAULT_SETTINGS, searchProvider: 'tavily', timeoutMs: 15_000 };
  const pending = holdGemini(phase); const reply = await resolveQuery(15_000);
  await vi.advanceTimersByTimeAsync(9_000);
  expect(reply).not.toHaveBeenCalled(); expect(pending.signal().aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(5_000); pending.finish(); await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: true, url: fixture.results[0].url });
  expect(fetch).toHaveBeenCalledTimes(2); expectNoCandidateDisclosure();
});

it.each(['fetch', 'body'] as const)('stops Gemini %s at the shared deadline and ignores a late success', async (phase) => {
  const pending = holdGemini(phase); const reply = await resolveQuery();
  await vi.advanceTimersByTimeAsync(999); expect(reply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('タイムアウト') });
  expect(pending.signal().aborted).toBe(true);
  pending.finish(); await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledOnce(); expectNoCandidateDisclosure();
});

it('honors a shorter content deadline while waiting for Gemini', async () => {
  const pending = holdGemini('fetch'); const reply = await resolveQuery(200);
  await vi.advanceTimersByTimeAsync(200);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('タイムアウト') });
  expect(pending.signal().aborted).toBe(true);
  pending.finish(); await vi.advanceTimersByTimeAsync(0); expect(reply).toHaveBeenCalledOnce();
});

it.each([
  ['network', 'Geminiとの通信に失敗'],
  ['json', 'Geminiの応答形式が不正'],
  ['blocked', 'Geminiが入力または回答をブロック'],
  ['invalid-value', 'GeminiのURLまたはconfidenceの型・値が不正'],
  [401, 'GeminiのAPIキーを確認'],
  [403, 'Geminiの利用権限を確認'],
  [429, 'Geminiの利用枠を確認'],
  [500, 'Geminiで一時的な障害'],
] as const)('preserves the sanitized Gemini %s error instead of reporting low confidence', async (failure, message) => {
  mockApis(); const normalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (!String(input).startsWith('https://generativelanguage.googleapis.com/')) return normalFetch(input, init);
    if (failure === 'network') throw new Error('private error: gemini-synthetic-key');
    if (typeof failure === 'number') return new Response('private error: gemini-synthetic-key', { status: failure });
    if (failure === 'json') return new Response('private error: gemini-synthetic-key');
    if (failure === 'blocked') return new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }));
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"url":"https://example.com/","confidence":"1"}' }] } }] }));
  });
  const reply = await resolveQuery();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining(message) });
  expect(JSON.stringify(reply.mock.calls)).not.toMatch(/private error|synthetic-key|確信度が不足/);
  expect(fetch).toHaveBeenCalledTimes(2); expectNoCandidateDisclosure();
});

it('reports low confidence only after receiving a valid low-confidence prediction', async () => {
  mockApis({ url: fixture.results[0].url, confidence: 0.84 }); const reply = await resolveQuery();
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('確信度が不足') });
  expect(JSON.stringify(reply.mock.calls)).not.toContain('予測できませんでした'); expectNoCandidateDisclosure();
});

it.each(['cancel', 'navigation'] as const)('reports %s in Japanese without exposing the raw AbortError', async (action) => {
  const pending = holdGemini('fetch'); const reply = await resolveQuery();
  if (action === 'cancel') listener({ type: 'directwarp:cancel', requestId: 'request' }, { tab: { id: 1 } }, vi.fn());
  else vi.mocked(browser.tabs.onUpdated.addListener).mock.calls[0][0](1, { status: 'loading' }, {} as never);
  await vi.advanceTimersByTimeAsync(0);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ ok: false, error: expect.stringContaining('処理を中断しました') });
  expect(JSON.stringify(reply.mock.calls)).not.toContain('signal is aborted');
  expect(pending.signal().aborted).toBe(true);
  pending.finish(); await vi.advanceTimersByTimeAsync(0); expect(reply).toHaveBeenCalledOnce();
});
