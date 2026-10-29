import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { predictBestUrl } from '../lib/apiClients/gemini';
import { DeadlineError } from '../lib/deadline';
import { DEFAULT_SETTINGS } from '../lib/settings';

const req = { apiKey: 'fake-key', model: DEFAULT_SETTINGS.model, query: 'example', timeoutMs: 10_000 };
const good = () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"url":"https://example.com/","confidence":0.9}' }] } }] }));
const retry = (delay = '2s') => ({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: delay });
const quota = (id: string, quotaValue = '100') => ({ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: id, quotaValue }] });
const failure = (status: number, details: unknown[] = [], headers?: HeadersInit) => new Response(JSON.stringify({ error: { code: status, message: 'PRIVATE_BODY', details } }), { status, headers });

beforeEach(() => {
  vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.4);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([408, 500, 502, 503, 504])('retries temporary HTTP %s at most twice with backoff and jitter', async (status) => {
  vi.mocked(fetch).mockImplementation(async () => failure(status));
  const assertion = expect(predictBestUrl(req)).rejects.toMatchObject({ kind: 'temporary', status });
  await vi.advanceTimersByTimeAsync(1099); expect(fetch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1); expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2099); expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1); await assertion;
  expect(fetch).toHaveBeenCalledTimes(3);
});

it.each([[quota('RequestsPerMinute')], [retry()], [quota('TokensPerSecond'), retry('1.5s')]].map((details) => ({ details })))('recovers from an explicitly temporary 429: %j', async ({ details }) => {
  vi.mocked(fetch).mockResolvedValueOnce(failure(429, details)).mockResolvedValueOnce(good());
  const assertion = expect(predictBestUrl(req)).resolves.toEqual({ url: 'https://example.com/', confidence: 0.9 });
  await vi.advanceTimersByTimeAsync(2100);
  await assertion;
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([[], [quota('RequestsPerDay'), retry()], [quota('UnknownQuota'), retry()], [quota('RequestsPerMinute', '0'), retry()], [quota('RequestsPerMinute'), quota('RequestsPerDay')], [retry('invalid')]].map((details) => ({ details })))('never retries unknown, daily, zero or malformed quota errors: %j', async ({ details }) => {
  vi.mocked(fetch).mockResolvedValueOnce(failure(429, details));
  await expect(predictBestUrl(req)).rejects.toMatchObject({ kind: 'quota' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('honors the larger RetryInfo and Retry-After delay', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(failure(503, [retry('2s')], { 'Retry-After': '3' })).mockResolvedValueOnce(good());
  const result = predictBestUrl(req);
  await vi.advanceTimersByTimeAsync(2999); expect(fetch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not shorten a server delay to fit the remaining deadline', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(failure(503, [retry('20s')]));
  await expect(predictBestUrl(req)).rejects.toMatchObject({ kind: 'temporary' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('uses only the original remaining budget for retries and response bodies', async () => {
  const signals: AbortSignal[] = [];
  vi.mocked(fetch).mockImplementation(async (_, init) => {
    signals.push(init?.signal as AbortSignal);
    return signals.length === 1 ? failure(503) : { ok: true, json: () => new Promise(() => {}) } as Response;
  });
  const assertion = expect(predictBestUrl({ ...req, deadlineAt: Date.now() + 1500 })).rejects.toBeInstanceOf(DeadlineError);
  await vi.advanceTimersByTimeAsync(1500); await assertion;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it('clears backoff immediately on cancellation without another request', async () => {
  const controller = new AbortController();
  vi.mocked(fetch).mockResolvedValueOnce(failure(503));
  const assertion = expect(predictBestUrl({ ...req, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError', message: '処理を中断しました。' });
  await vi.advanceTimersByTimeAsync(500);
  controller.abort(new Error('DUMMY_KEY private cancellation reason'));
  await assertion;
  expect(fetch).toHaveBeenCalledOnce();
});
