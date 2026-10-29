import { createOverlay } from './content/LoadingOverlay';
import { getSettings } from '../lib/storage';
import { DeadlineError } from '../lib/deadline';
import { resolutionTimeout, SEARCH_RETURN_DELAY_MS, type ResolveResponse } from '../lib/resolution';

function buildSearchUrl(engine: 'google' | 'bing', q: string): string {
  return `https://www.${engine}.com/search?q=${encodeURIComponent(q)}`;
}

export default defineContentScript({
  matches: ['*://*.google.com/*', '*://*.bing.com/*'],
  async main(ctx) {
    let processedUrl: string | null = null;
    let checkingUrl: string | null = null;
    let invalidated = false;
    let pageVersion = 0;
    let stopActive = () => {};

    const tryProcess = async () => {
      const pageUrl = window.location.href;
      const version = pageVersion;
      if (invalidated || processedUrl === pageUrl || checkingUrl === pageUrl) return;
      checkingUrl = pageUrl;
      try {
        const settings = await getSettings();
        if (invalidated || version !== pageVersion || window.location.href !== pageUrl) return;
        const raw = new URL(pageUrl).searchParams.get('q');
        if (!raw) return;
        const trigger = settings.trigger || '/d';
        const trimmed = raw.trim();
        const query = trimmed.startsWith(trigger) ? trimmed.slice(trigger.length).trim()
          : trimmed.endsWith(trigger) ? trimmed.slice(0, -trigger.length).trim() : null;
        if (query === null) return;
        processedUrl = pageUrl;
        stopActive();

        const engine = new URL(pageUrl).hostname.includes('bing.com') ? 'bing' : 'google';
        const fallbackUrl = buildSearchUrl(engine, query);
        const requestId = crypto.randomUUID();
        const deadlineAt = Date.now() + resolutionTimeout(settings.timeoutMs);
        const overlay = createOverlay('DirectWarp: 最適なURLを探索中...', { theme: settings.theme });
        let state: 'waiting' | 'error' | 'transition' | 'closed' = 'waiting';
        let responseTimer: ReturnType<typeof setTimeout> | undefined;
        let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
        let cancelled = false;
        const cancelRequest = () => {
          if (cancelled) return;
          cancelled = true;
          try {
            void Promise.resolve(browser.runtime.sendMessage({ type: 'directwarp:cancel', requestId })).catch(() => {});
          } catch {}
        };
        const clearTimers = () => {
          clearTimeout(responseTimer);
          clearTimeout(fallbackTimer);
          responseTimer = fallbackTimer = undefined;
        };
        const finish = (url?: string) => {
          if (state === 'closed') return;
          state = 'closed';
          clearTimers();
          cancelRequest();
          overlay.remove();
          if (url && window.location.href === pageUrl) window.location.assign(url);
        };
        stopActive = () => finish();
        const showFailure = (error: string) => {
          if (state !== 'waiting') return;
          state = 'error';
          clearTimers();
          cancelRequest();
          overlay.setErrorWithActions(`DirectWarp: ${error}`, {
            primaryLabel: '設定を開く',
            onPrimary: () => {
              if (state !== 'error') return;
              finish();
              try { void Promise.resolve(browser.runtime.openOptionsPage()).catch(() => {}); } catch {}
            },
            secondaryLabel: 'キャンセル',
            onSecondary: () => { if (state === 'error') finish(fallbackUrl); },
          });
          fallbackTimer = setTimeout(() => finish(fallbackUrl), SEARCH_RETURN_DELAY_MS);
        };
        overlay.setActions({ primaryLabel: 'キャンセル', onPrimary: () => finish(fallbackUrl) });
        responseTimer = setTimeout(() => showFailure(new DeadlineError().message), Math.max(0, deadlineAt - Date.now()));
        // 成功/失敗のハンドラーを同時に登録し、画面を離れた後のrejectionも回収する。
        void Promise.resolve().then(() => {
          if (state !== 'waiting') return;
          return browser.runtime.sendMessage({ type: 'directwarp:resolve', requestId, query, deadlineAt });
        }).then((res: ResolveResponse | undefined) => {
          if (state !== 'waiting') return;
          if (Date.now() >= deadlineAt) { showFailure(new DeadlineError().message); return; }
          if (res?.ok === true && typeof res.url === 'string') {
            state = 'transition';
            clearTimers();
            overlay.setMessage('DirectWarp: ワープします...');
            overlay.startWarpTransition(() => { if (state === 'transition') finish(res.url); });
          } else {
            showFailure(res?.ok === false ? res.error : '解決に失敗しました。検索画面に戻ります。');
          }
        }, () => showFailure('エラーが発生しました。検索画面に戻ります。'));
      } catch {
        // 設定の読込に失敗した場合は通常の検索ページをそのまま利用する。
      } finally {
        if (version === pageVersion && checkingUrl === pageUrl) checkingUrl = null;
      }
    };

    const locationChanged = () => {
      if (processedUrl === window.location.href) return;
      pageVersion += 1;
      checkingUrl = null;
      stopActive();
      void tryProcess();
    };
    ctx.addEventListener(window, 'pagehide', () => {
      pageVersion += 1;
      checkingUrl = null;
      stopActive();
      processedUrl = null;
    });
    ctx.addEventListener(window, 'pageshow', () => void tryProcess());
    ctx.addEventListener(window, 'popstate', locationChanged);
    ctx.addEventListener(window, 'wxt:locationchange', locationChanged);
    ctx.addEventListener(document, 'visibilitychange', () => { if (!document.hidden) void tryProcess(); });
    ctx.onInvalidated(() => { invalidated = true; stopActive(); });
    void tryProcess();
  },
});
