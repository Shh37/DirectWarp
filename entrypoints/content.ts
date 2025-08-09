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

      const trimmed = raw.trim();
      if (!trimmed.startsWith(trigger)) return;

      processed = true;
      const query = trimmed.slice(trigger.length).trim();
      const engine = detectEngine();

      const overlay = createOverlay('DirectWarp: 最適なURLを探索中...');
      try {
        const res = (await browser.runtime.sendMessage({
          type: 'directwarp:resolve',
          query,
        })) as ResolveResponse;

        if (res && (res as any).ok === true && typeof (res as any).url === 'string') {
          overlay.setMessage('DirectWarp: ジャンプします...');
          window.location.assign((res as any).url);
          return;
        }

        const errMsg = (res && (res as any).error) || '解決に失敗しました。検索画面に戻ります。';
        overlay.setError(`DirectWarp: ${errMsg}`);
        setTimeout(() => {
          overlay.remove();
          const fallbackEngine = engine === 'unknown' ? 'google' : engine;
          window.location.assign(buildSearchUrl(fallbackEngine, query));
        }, 2000);
      } catch (e) {
        overlay.setError('DirectWarp: エラーが発生しました。2秒後に検索へ戻ります。');
        setTimeout(() => {
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
