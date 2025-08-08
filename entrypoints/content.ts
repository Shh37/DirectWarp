import { showOverlay } from './content/LoadingOverlay';
import '../styles/globals.css';
import { loadSettings } from '@/lib/settings';

export default defineContentScript({
  matches: ['*://*.google.com/*', '*://*.bing.com/*'],
  main() {
    void init();
  },
});

async function init() {
  const settings = await loadSettings();
  const trigger = settings.trigger ?? '/d';

  // Initial-run: if current page already has trigger in query, run immediately
  const initialQ = getQueryFromPage();
  if (initialQ && initialQ.startsWith(trigger)) {
    await handleQuery(initialQ, trigger);
    return;
  }

  // Attach submit listener to search forms
  const forms = document.querySelectorAll('form');
  forms.forEach((form) => {
    form.addEventListener('submit', async (e) => {
      const q = getQueryFromPage();
      if (!q || !q.startsWith(trigger)) return;
      // Intercept default navigation
      e.preventDefault();
      e.stopPropagation();
      await handleQuery(q, trigger);
    }, { capture: true });
  });
}

async function handleQuery(raw: string, trigger: string) {
  const engine = getEngine();
  const cleaned = stripTrigger(raw, trigger).trim();
  const overlay = showOverlay('DirectWarp: 推定中…');
  try {
    const res = await browser.runtime.sendMessage({
      type: 'directwarp:suggest',
      payload: { query: cleaned },
    });
    if (res?.ok && res?.url) {
      overlay.close();
      location.href = res.url;
      return;
    }
    const reason = res?.reason || '推定に失敗しました。';
    overlay.update(`DirectWarp: ${reason}`, true);
  } catch (e) {
    overlay.update('DirectWarp: 通信に失敗しました。', true);
  }
  // fallback after 2s
  setTimeout(() => {
    const fallbackUrl = buildEngineSearchUrl(engine, cleaned);
    location.href = fallbackUrl;
  }, 2000);
}

function getEngine(): 'google' | 'bing' {
  const h = location.hostname;
  if (h.includes('google.')) return 'google';
  return 'bing';
}

function buildEngineSearchUrl(engine: 'google' | 'bing', q: string): string {
  if (engine === 'google') return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
}

function stripTrigger(q: string, trigger: string): string {
  if (!q.startsWith(trigger)) return q;
  return q.slice(trigger.length).trimStart();
}

function getQueryFromPage(): string | undefined {
  const el = document.querySelector<HTMLInputElement>('input[name="q"], textarea[name="q"]');
  if (el && el.value) return el.value;
  const u = new URL(location.href);
  const v = u.searchParams.get('q');
  return v ?? undefined;
}
