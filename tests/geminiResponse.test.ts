import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBestUrl, predictBestUrl, selectBestUrlFromCandidates } from '../lib/apiClients/gemini';
import { ALLOWED_MODELS, DEFAULT_SETTINGS } from '../lib/settings';
import { GeminiError } from '../lib/apiClients/geminiErrors';

const req = { apiKey: 'fake-key', model: DEFAULT_SETTINGS.model, query: 'example', candidateCount: 5, candidates: [{ url: 'https://example.com/' }], timeoutMs: 1000 };
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(console.log).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it.each([true, null, '0.9'])('rejects confidence %j rather than coercing it to a number', async (confidence) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ url: 'https://example.com/', confidence }) }] } }] }))));
  for (const client of [getBestUrl, predictBestUrl, selectBestUrlFromCandidates]) {
    await expect(client(req)).rejects.toThrow();
  }
});

const answer = { url: 'https://example.com/', confidence: 0.9 };
const candidate = (text: string, extra: object = {}) => ({ finishReason: 'STOP', content: { parts: [{ text }] }, ...extra });
const response = (value: unknown) => new Response(JSON.stringify(value));

describe.each([getBestUrl, predictBestUrl, selectBestUrlFromCandidates])('%s response contract', (client) => {
  it.each(ALLOWED_MODELS)('sends the REST structured-output schema for supported model %s', async (model) => {
    vi.mocked(fetch).mockResolvedValue(response({ candidates: [candidate(JSON.stringify(answer))] }));
    expect(await client({ ...req, model })).toEqual(answer);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(url)).pathname).toBe(`/v1beta/models/${model}:generateContent`);
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig).toEqual({ responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: {
      type: 'object', properties: { url: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 } }, required: ['url', 'confidence'], additionalProperties: false,
    } } } });
  });

  it('joins final text parts of one candidate and excludes thought parts and other candidates', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ candidates: [
      { finishReason: 'STOP', content: { parts: [{ thought: true, text: 'PRIVATE_THOUGHT' }, { text: '{"url":"https://example.com/",' }, { thought: false, text: '"confidence":0.9}' }, { thought: true, text: '{"url":"https://evil.example/"}' }] } },
      candidate('{"url":"https://other.example/","confidence":1}'),
    ] }));
    expect(await client(req)).toEqual(answer);
  });

  it.each([
    [{ candidates: [] }, 'no_candidates'],
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 'blocked'],
    [{ candidates: [candidate(JSON.stringify(answer), { finishReason: 'SAFETY' })] }, 'blocked'],
    [{ candidates: [candidate(JSON.stringify(answer), { finishReason: 'MAX_TOKENS' })] }, 'output_limit'],
    [{ candidates: [candidate(JSON.stringify(answer), { finishReason: 'CONTINUATION' })] }, 'incomplete'],
    [{ candidates: [candidate(JSON.stringify(answer), { finishReason: undefined })] }, 'incomplete'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: JSON.stringify(answer) }] } }] }, 'no_text'],
    [{ candidates: [candidate(''), candidate(JSON.stringify(answer))] }, 'no_text'],
    [{ candidates: [candidate('not json')] }, 'invalid_json'],
    [{ candidates: [candidate('```json\n' + JSON.stringify(answer) + '\n```')] }, 'invalid_json'],
    [{ candidates: [candidate(JSON.stringify(answer) + JSON.stringify(answer))] }, 'invalid_json'],
    [{ candidates: [candidate('{"url":"https://example.com/","confidence":1e999}')] }, 'invalid_value'],
  ])('classifies fixture failure as %s / %s without retrying', async (fixture, kind) => {
    vi.mocked(fetch).mockResolvedValue(response(fixture));
    await expect(client(req)).rejects.toMatchObject({ kind });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([true, null, '0.9', -0.1, 1.1, undefined])('strictly rejects confidence %j', async (confidence) => {
    vi.mocked(fetch).mockResolvedValue(response({ candidates: [candidate(JSON.stringify({ ...answer, confidence }))] }));
    await expect(client(req)).rejects.toMatchObject({ kind: 'invalid_value' });
  });

  it.each([null, [], { candidateId: 1, confidence: 1 }, { ...answer, extra: 'unexpected' }, { ...answer, url: 'javascript:alert(1)' }, { ...answer, url: 'https://user@example.com/' }])('rejects invalid answer values %j', async (value) => {
    vi.mocked(fetch).mockResolvedValue(response({ candidates: [candidate(JSON.stringify(value))] }));
    await expect(client(req)).rejects.toMatchObject({ kind: 'invalid_value' });
  });

  it.each([[400, 'invalid_input'], [401, 'authentication'], [402, 'payment'], [403, 'permission'], [404, 'model_unavailable'], [501, 'http']])('never retries HTTP %s and hides all raw details', async (status, kind) => {
    const secret = 'DUMMY_KEY?key=DUMMY_KEY https://private.example/ PRIVATE_BODY';
    vi.mocked(fetch).mockResolvedValue(new Response(secret, { status: Number(status), statusText: 'PRIVATE_STATUS' }));
    const error = await client(req).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GeminiError);
    expect(error).toMatchObject({ kind, status });
    expect(String(error) + JSON.stringify(error)).not.toMatch(/DUMMY_KEY|private.example|PRIVATE_BODY|PRIVATE_STATUS/);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('sanitizes body parsing and fetch exceptions', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('https://private.example/?key=DUMMY_KEY'));
    await expect(client(req)).rejects.toMatchObject({ kind: 'network' });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error('PRIVATE_BODY DUMMY_KEY')) } as unknown as Response);
    const error = await client(req).catch((value: unknown) => value);
    expect(error).toMatchObject({ kind: 'invalid_response' });
    expect(String(error) + JSON.stringify(error)).not.toMatch(/PRIVATE_BODY|DUMMY_KEY/);
  });
});

it('rejects a valid structured answer outside the exact selection candidates', async () => {
  vi.mocked(fetch).mockResolvedValue(response({ candidates: [candidate(JSON.stringify({ ...answer, url: 'https://example.com/other' }))] }));
  await expect(selectBestUrlFromCandidates(req)).rejects.toMatchObject({ kind: 'outside_candidates' });
});
