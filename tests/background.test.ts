import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALLOWED_MODELS, API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { mockStorage } from './storageMock';

type Reply = { ok: boolean; url?: string; error?: string };
type Listener = (message: unknown, sender: unknown, respond: (reply: Reply) => void) => boolean;
let listener: Listener;

beforeEach(async () => {
  vi.resetModules();
  mockStorage({
    [API_KEY_KEY]: 'fake-gemini-key', [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-search-key', [CUSTOM_SEARCH_CX_KEY]: 'fake-cx',
  });
  Object.assign(browser, { runtime: { onMessage: { addListener: (fn: Listener) => { listener = fn; } } } });
  vi.stubGlobal('defineBackground', (start: () => void) => start());
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await import('../entrypoints/background');
});

afterEach(() => vi.unstubAllGlobals());

function resolveQuery() {
  return new Promise<Reply>((resolve) => {
    expect(listener({ type: 'directwarp:resolve', query: 'example' }, {}, resolve)).toBe(true);
  });
}

function geminiResult(confidence: number) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify({ url: 'https://example.com/', confidence }) }] } }] };
}

function mockApis(options: { selectionStatus?: number; emptySearch?: boolean; emptyGemini?: boolean; networkFailure?: boolean } = {}) {
  let geminiCalls = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://www.googleapis.com/customsearch/v1')) {
      return new Response(JSON.stringify({ items: options.emptySearch ? [] : [{ link: 'https://example.com/', title: 'Example' }] }));
    }
    if (!url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/')) throw new Error('Unexpected endpoint');
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toContain('example');
    expect(body.generationConfig).toBeUndefined();
    geminiCalls += 1;
    if (geminiCalls === 1) return new Response(JSON.stringify(geminiResult(0.1))); // exercise selection too
    if (options.networkFailure) throw new DOMException('Aborted by mock', 'AbortError');
    if (options.selectionStatus) return new Response('Fixture API error', { status: options.selectionStatus });
    return new Response(JSON.stringify(options.emptyGemini ? { candidates: [] } : geminiResult(0.9)));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('background uses the same validated models as settings and UI', () => {
  it.each(['gemini-2.0-flash', 'gemini-2.0-pro', 'invalid', ...ALLOWED_MODELS, undefined])('resolves with saved model %s', async (savedModel) => {
    if (savedModel !== undefined) await browser.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, model: savedModel } });
    const fetchMock = mockApis();
    expect(await resolveQuery()).toEqual({ ok: true, url: 'https://example.com/' });
    const expected = savedModel === 'gemini-2.5-flash' ? savedModel : DEFAULT_SETTINGS.model;
    const geminiUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('generativelanguage'));
    expect(geminiUrls).toHaveLength(2);
    for (const url of geminiUrls) expect(new URL(url).pathname).toBe(`/v1beta/models/${expected}:generateContent`);
  });

  it.each([403, 404, 429, 500])('reports HTTP %s without switching to a restricted or unapproved model', async (selectionStatus) => {
    const fetchMock = mockApis({ selectionStatus });
    const result = await resolveQuery();
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(selectionStatus));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports missing search candidates', async () => {
    const fetchMock = mockApis({ emptySearch: true });
    expect(await resolveQuery()).toEqual({ ok: false, error: 'Custom Search で候補が見つかりませんでした。' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports empty Gemini candidates with the migrated model', async () => {
    await browser.storage.local.set({ [SETTINGS_KEY]: { model: 'gemini-2.0-flash' } });
    mockApis({ emptyGemini: true });
    expect((await resolveQuery()).error).toContain('応答候補が空');
  });

  it('reports a rejected request', async () => {
    mockApis({ networkFailure: true });
    expect((await resolveQuery()).error).toContain('Aborted by mock');
  });
});

describe('Custom Search availability guidance', () => {
  it.each([
    [CUSTOM_SEARCH_API_KEY_KEY],
    [CUSTOM_SEARCH_CX_KEY],
    [CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, API_KEY_KEY],
  ])('explains missing %j without issuing an eligibility probe', async (...missing) => {
    for (const key of missing) await browser.storage.local.remove(key);
    const result = await resolveQuery();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('APIキーまたは CX が未設定');
    expect(result.error).toContain('新規受付は終了');
    expect(result.error).toContain('通常検索に戻ります');
    expect(fetch).not.toHaveBeenCalled();
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('does not block a configured existing customer solely because the date passed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2027-01-02T00:00:00+09:00').getTime());
    const fetchMock = mockApis();
    expect(await resolveQuery()).toEqual({ ok: true, url: 'https://example.com/' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(browser.storage.local.set).not.toHaveBeenCalled();
    expect(browser.storage.local.remove).not.toHaveBeenCalled();
  });
});
