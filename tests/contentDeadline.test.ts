import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { mockStorage } from './storageMock';

const { createOverlay } = vi.hoisted(() => ({ createOverlay: vi.fn() }));
vi.mock('../entrypoints/content/LoadingOverlay', () => ({ createOverlay }));
let overlay: Record<string, ReturnType<typeof vi.fn>>;
let page: EventTarget & { location: { href: string; assign: ReturnType<typeof vi.fn> } };
let send: ReturnType<typeof vi.fn>;
let resolveReply: (reply: unknown) => void;
let rejectReply: (error: Error) => void;
let invalidate: () => void;

beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  mockStorage({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, timeoutMs: 1000 } });
  page = Object.assign(new EventTarget(), { location: { href: 'https://www.google.com/search?q=%2Fd+example', assign: vi.fn() } });
  vi.stubGlobal('window', page);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  const response = new Promise((resolve, reject) => { resolveReply = resolve; rejectReply = reject; });
  send = vi.fn((message) => message.type === 'directwarp:resolve' ? response : Promise.resolve());
  Object.assign(browser, { runtime: { sendMessage: send, openOptionsPage: vi.fn(async () => {}) } });
  overlay = Object.fromEntries(['setMessage', 'setActions', 'setErrorWithActions', 'remove', 'startWarpTransition'].map((name) => [name, vi.fn()]));
  createOverlay.mockReturnValue(overlay);
  vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
  const script = (await import('../entrypoints/content')).default;
  await script.main({
    addEventListener: (target: EventTarget, type: string, handler: EventListener) => target.addEventListener(type, handler),
    onInvalidated: (fn: () => void) => { invalidate = fn; },
  } as any);
  await vi.advanceTimersByTimeAsync(0);
});
afterEach(() => { invalidate(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

const errorActions = () => overlay.setErrorWithActions.mock.calls[0][1];
const expectSearchOnce = () => expect(page.location.assign).toHaveBeenCalledExactlyOnceWith('https://www.google.com/search?q=example');

it('returns to normal search when background never replies and ignores late success', async () => {
  expect(send.mock.calls[0][0]).toMatchObject({ type: 'directwarp:resolve', deadlineAt: Date.now() + 1000 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(overlay.setErrorWithActions).toHaveBeenCalledWith(expect.stringContaining('タイムアウト'), expect.any(Object));
  resolveReply({ ok: true, url: 'https://late.example/' }); await vi.advanceTimersByTimeAsync(0);
  expect(overlay.startWarpTransition).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000); expectSearchOnce();
  expect(send.mock.calls.filter(([message]) => message.type === 'directwarp:cancel')).toHaveLength(1);
});

it.each(['failure', 'rejection', 'timeout'])('opening settings after %s cancels automatic return', async (mode) => {
  if (mode === 'failure') resolveReply({ ok: false, error: 'not configured' });
  if (mode === 'rejection') rejectReply(new Error('channel closed'));
  await vi.advanceTimersByTimeAsync(mode === 'timeout' ? 1000 : 0);
  errorActions().onPrimary(); errorActions().onPrimary();
  await vi.advanceTimersByTimeAsync(3000);
  expect(page.location.assign).not.toHaveBeenCalled();
  expect(browser.runtime.openOptionsPage).toHaveBeenCalledOnce();
});

it('cancelling an error navigates once and removes the automatic return timer', async () => {
  resolveReply({ ok: false, error: 'search failed' }); await vi.advanceTimersByTimeAsync(0);
  errorActions().onSecondary(); errorActions().onSecondary();
  await vi.advanceTimersByTimeAsync(3000); expectSearchOnce();
});

it('returns to normal search after displaying missing Custom Search configuration', async () => {
  resolveReply({ ok: false, error: 'Custom Search の APIキーまたは CX が未設定です。JSON API の新規受付は終了しています。通常検索に戻ります。' });
  await vi.advanceTimersByTimeAsync(0);
  expect(overlay.setErrorWithActions).toHaveBeenCalledWith(expect.stringContaining('新規受付は終了'), expect.any(Object));
  await vi.advanceTimersByTimeAsync(2000);
  expectSearchOnce();
  expect(overlay.startWarpTransition).not.toHaveBeenCalled();
});

it('allows cancellation while waiting and collects a later rejected reply', async () => {
  overlay.setActions.mock.calls[0][0].onPrimary();
  rejectReply(new Error('late failure')); await vi.advanceTimersByTimeAsync(3000);
  expectSearchOnce(); expect(overlay.setErrorWithActions).not.toHaveBeenCalled();
});

it.each(['pagehide', 'popstate', 'wxt:locationchange', 'invalidate'])('does not redirect after %s', async (event) => {
  if (event === 'invalidate') invalidate();
  else {
    if (event !== 'pagehide') page.location.href = 'https://www.google.com/search?q=ordinary';
    page.dispatchEvent(new Event(event));
  }
  resolveReply({ ok: true, url: 'https://late.example/' }); await vi.advanceTimersByTimeAsync(3000);
  expect(page.location.assign).not.toHaveBeenCalled(); expect(overlay.startWarpTransition).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'directwarp:cancel' }));
});

it('ignores a same-URL history event without cancelling active work', async () => {
  page.dispatchEvent(new Event('wxt:locationchange'));
  resolveReply({ ok: true, url: 'https://example.com/' }); await vi.advanceTimersByTimeAsync(0);
  expect(overlay.startWarpTransition).toHaveBeenCalledOnce();
  const complete = overlay.startWarpTransition.mock.calls[0][0]; complete(); complete();
  expect(page.location.assign).toHaveBeenCalledExactlyOnceWith('https://example.com/');
});

it('prevents navigation when a page leaves during the warp transition', async () => {
  resolveReply({ ok: true, url: 'https://example.com/' }); await vi.advanceTimersByTimeAsync(0);
  const complete = overlay.startWarpTransition.mock.calls[0][0];
  page.dispatchEvent(new Event('pagehide')); complete();
  expect(page.location.assign).not.toHaveBeenCalled();
});

it('rejects a late success even if the watchdog callback has not run yet', async () => {
  vi.setSystemTime(Date.now() + 1001);
  resolveReply({ ok: true, url: 'https://late.example/' }); await vi.advanceTimersByTimeAsync(0);
  expect(overlay.startWarpTransition).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000); expectSearchOnce();
});
