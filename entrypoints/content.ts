import { createOverlay } from './content/LoadingOverlay';
import { getSettings } from '../lib/storage';

type ResolveResponse =
  | { ok: true; url: string }
  | { ok: false; error: string };

function getQueryParam(name: string): string | null {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function detectEngine(): 'google' | 'bing' | 'unknown' {
  const h = location.hostname;
  if (h.includes('google.')) return 'google';
  if (h.includes('bing.com')) return 'bing';
  return 'unknown';
}

function buildSearchUrl(engine: 'google' | 'bing', q: string): string {
  const encoded = encodeURIComponent(q);
  if (engine === 'google') return `https://www.google.com/search?q=${encoded}`;
  return `https://www.bing.com/search?q=${encoded}`;
}

export default defineContentScript({
  matches: ['*://*.google.com/*', '*://*.bing.com/*'],
  async main() {
    let processed = false;

    const tryProcess = async () => {
      if (processed) return;
      const settings = await getSettings();
      const trigger = settings.trigger || '/d';

      // Google/Bing はどちらも 'q' パラメータ
      const raw = getQueryParam('q');
      if (!raw) return;

      let query: string | null = null;
      const trimmed = raw.trim();
      
      if (trimmed.startsWith(trigger)) {
        // 先頭にトリガーがある場合
        query = trimmed.slice(trigger.length).trim();
      } else if (trimmed.endsWith(trigger)) {
        // 最後にトリガーがある場合
        query = trimmed.slice(0, -trigger.length).trim();
      }
      
      if (query === null) return;
      
      processed = true;
      const engine = detectEngine();

      const overlay = createOverlay('DirectWarp: 最適なURLを探索中...', { theme: settings.theme });
      let fallbackTimer: number | null = null;
      const clearFallback = () => {
        if (fallbackTimer !== null) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
      };
      try {
        const res = (await browser.runtime.sendMessage({
          type: 'directwarp:resolve',
          query,
        })) as ResolveResponse;

        if (res && (res as any).ok === true && typeof (res as any).url === 'string') {
          overlay.setMessage('DirectWarp: ワープします...');
          window.location.assign((res as any).url);
          return;
        }

        const errMsg = (res && (res as any).error) || '解決に失敗しました。検索画面に戻ります。';
        overlay.setErrorWithActions(`DirectWarp: ${errMsg}`,
          {
            primaryLabel: '設定を開く',
            onPrimary: () => {
              try {
                // options ページを開く
                void (browser.runtime as any).openOptionsPage?.();
              } catch {}
              overlay.remove();
            },
            secondaryLabel: 'キャンセル',
            onSecondary: () => {
              overlay.remove();
              const fallbackEngine = engine === 'unknown' ? 'google' : engine;
              window.location.assign(buildSearchUrl(fallbackEngine, query));
            },
          },
        );
        // 自動フォールバック（2秒後）。ユーザーがボタンを押した場合は remove() 済みで早期遷移。
        fallbackTimer = window.setTimeout(() => {
          try { overlay.clearActions(); } catch {}
          overlay.remove();
          const fallbackEngine = engine === 'unknown' ? 'google' : engine;
          window.location.assign(buildSearchUrl(fallbackEngine, query));
        }, 2000);
      } catch (e) {
        overlay.setErrorWithActions('DirectWarp: エラーが発生しました。',
          {
            primaryLabel: '設定を開く',
            onPrimary: () => {
              try {
                void (browser.runtime as any).openOptionsPage?.();
              } catch {}
              clearFallback();
              overlay.remove();
            },
            secondaryLabel: 'キャンセル',
            onSecondary: () => {
              clearFallback();
              overlay.remove();
              const fallbackEngine = engine === 'unknown' ? 'google' : engine;
              window.location.assign(buildSearchUrl(fallbackEngine, query));
            },
          },
        );
        fallbackTimer = window.setTimeout(() => {
          try { overlay.clearActions(); } catch {}
          overlay.remove();
          const fallbackEngine = engine === 'unknown' ? 'google' : engine;
          window.location.assign(buildSearchUrl(fallbackEngine, query));
        }, 2000);
      }
    };

    // 初回チェック
    void tryProcess();

    // SPA遷移にも対応（簡易）。Google/BingはpushState/popstateを多用するため念のため。
    window.addEventListener('popstate', () => void tryProcess());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void tryProcess();
    });
  },
});
