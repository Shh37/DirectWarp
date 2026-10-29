import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { API_KEY_KEY, ALLOWED_MODELS, DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { listManagedModels } from '../lib/apiClients/geminiModels';
import { checkModelAvailability, readModelCheck, MODEL_CHECK_KEY } from '../lib/modelAvailability';
import { DeadlineError } from '../lib/deadline';
import { mockStorage } from './storageMock';

const model = (id: string, methods = ['generateContent']) => ({ name: `models/${id}`, supportedGenerationMethods: methods });
const response = (body: unknown) => new Response(JSON.stringify(body));
const request = { apiKey: 'fake-key-A', timeoutMs: 1000 };
beforeEach(() => { mockStorage({ [API_KEY_KEY]: request.apiKey, [SETTINGS_KEY]: DEFAULT_SETTINGS }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('reads all pages, deduplicates and excludes audio/image/embedding/preview/unknown models', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ models: [model(ALLOWED_MODELS[0]), model('gemini-3.8-flash-tts'), model('gemini-image'), model('gemini-embedding', ['embedContent']), model('gemini-new-preview')], nextPageToken: 'opaque&page=2' }))
    .mockResolvedValueOnce(response({ models: [model(ALLOWED_MODELS[0]), model(ALLOWED_MODELS[1])] }));
  expect(await listManagedModels(request)).toEqual(ALLOWED_MODELS.map((model) => ({ model, status: 'listed' })));
  const urls = vi.mocked(fetch).mock.calls.map(([url, init]) => {
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(request.apiKey);
    expect(String(url)).not.toContain(request.apiKey);
    return new URL(String(url));
  });
  expect(urls).toHaveLength(2);
  expect(urls[0].pathname).toBe('/v1beta/models');
  expect(urls[0].searchParams.get('pageSize')).toBe('1000');
  expect(urls[1].searchParams.get('pageSize')).toBe('1000');
  expect(urls[1].searchParams.get('pageToken')).toBe('opaque&page=2');
  expect(browser.storage.local.set).not.toHaveBeenCalled();
});

it.each([{}, { models: [] }])('handles an empty complete listing without changing settings: %j', async (body) => {
  vi.mocked(fetch).mockResolvedValue(response(body));
  expect(await listManagedModels(request)).toEqual(ALLOWED_MODELS.map((model) => ({ model, status: 'not_listed' })));
  expect(browser.storage.local.set).not.toHaveBeenCalled();
});

it('does not infer capabilities from a duplicate entry or a generation method alone', async () => {
  vi.mocked(fetch).mockResolvedValue(response({ models: [model(ALLOWED_MODELS[0]), model(ALLOWED_MODELS[0], ['embedContent']), model(ALLOWED_MODELS[1], []), model('gemini-audio-only')] }));
  expect(await listManagedModels(request)).toEqual(ALLOWED_MODELS.map((model) => ({ model, status: 'unsupported' })));
});

it.each([null, [], { models: {} }, { models: [{}] }, { nextPageToken: 123 }, { error: {} }])('rejects malformed pages: %j', async (body) => {
  vi.mocked(fetch).mockResolvedValue(response(body));
  await expect(listManagedModels(request)).rejects.toMatchObject({ kind: 'invalid_response' });
});

it('does not follow repeated tokens or return a partial success', async () => {
  vi.mocked(fetch).mockImplementation(async () => response({ models: [model(ALLOWED_MODELS[0])], nextPageToken: 'same-token' }));
  await expect(listManagedModels(request)).rejects.toMatchObject({ kind: 'invalid_response' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([401, 403, 429, 500])('records a safe failure for HTTP %s without changing the saved model or key', async (status) => {
  const initial = { [API_KEY_KEY]: request.apiKey, [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, model: ALLOWED_MODELS[1] } };
  const { data } = mockStorage(initial);
  vi.mocked(fetch).mockResolvedValueOnce(new Response('PRIVATE_BODY key=fake-key-A', { status }));
  const result = await checkModelAvailability(request.apiKey, new AbortController().signal);
  expect(result.ok).toBe(false);
  expect(result.checkedAt).toBeGreaterThan(0);
  expect(JSON.stringify(data[MODEL_CHECK_KEY])).not.toMatch(/fake-key-A|PRIVATE_BODY/);
  expect(data[SETTINGS_KEY]).toEqual(initial[SETTINGS_KEY]);
  expect(data[API_KEY_KEY]).toBe(initial[API_KEY_KEY]);
  expect((await readModelCheck(request.apiKey)).result).toEqual(result);
  expect(fetch).toHaveBeenCalledOnce();
});

it('records network failure and does not expose an endpoint/key in the stored result', async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error('https://example.com/?key=fake-key-A'));
  expect(await checkModelAvailability(request.apiKey, new AbortController().signal)).toMatchObject({ ok: false, failure: 'network' });
});

it('binds persisted results to the saved key and never uses another key/project result', async () => {
  const { data, local } = mockStorage({ [API_KEY_KEY]: request.apiKey });
  vi.mocked(fetch).mockResolvedValueOnce(response({ models: [model(ALLOWED_MODELS[0])] }));
  const result = await checkModelAvailability(request.apiKey, new AbortController().signal);
  expect(await readModelCheck(request.apiKey)).toEqual({ saved: true, result });
  const cache = data[MODEL_CHECK_KEY] as any;
  expect(cache.keyFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(cache)).not.toContain(request.apiKey);
  await local.set({ [API_KEY_KEY]: 'fake-key-B' });
  expect(await readModelCheck('fake-key-B')).toEqual({ saved: true, result: null });
  expect(await readModelCheck(request.apiKey)).toEqual({ saved: false, result: null });
  await expect(checkModelAvailability(request.apiKey, new AbortController().signal)).rejects.toThrow('保存');
  expect(fetch).toHaveBeenCalledOnce();
});

it('does not persist a late response after the saved key changes', async () => {
  const { data, local } = mockStorage({ [API_KEY_KEY]: request.apiKey });
  vi.mocked(fetch).mockImplementationOnce(async () => { await local.set({ [API_KEY_KEY]: 'other-project-key' }); return response({ models: [model(ALLOWED_MODELS[0])] }); });
  await expect(checkModelAvailability(request.apiKey, new AbortController().signal)).rejects.toThrow('変更');
  expect(data[MODEL_CHECK_KEY]).toBeUndefined();
});

it.each(['fetch', 'body'])('bounds stalled %s across pagination and cancels all work', async (phase) => {
  vi.useFakeTimers();
  let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementation(async (_, init) => {
    signal = init?.signal as AbortSignal;
    return phase === 'fetch' ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) } as Response;
  });
  const assertion = expect(listManagedModels(request)).rejects.toBeInstanceOf(DeadlineError);
  await vi.advanceTimersByTimeAsync(1000); await assertion;
  expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});

it('cancels during pagination before another page is requested', async () => {
  const controller = new AbortController();
  vi.mocked(fetch).mockImplementationOnce(async () => { controller.abort(); return response({ models: [], nextPageToken: 'next' }); });
  await expect(listManagedModels({ ...request, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledOnce();
});
