export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: any) => {
    if (message?.type !== 'directwarp:suggest') return;
    const { query } = message?.payload ?? {};
    return handleSuggest(String(query ?? ''));
  });
});

async function handleSuggest(query: string) {
  try {
    const { loadSettings, loadApiKey } = await import('@/lib/settings');
    const { suggestUrl } = await import('@/lib/apiClients/gemini');
    const settings = await loadSettings();
    const apiKey = await loadApiKey();
    const res = await suggestUrl(query, {
      apiKey: apiKey || '',
      model: settings.model,
      n: settings.n,
      timeoutMs: settings.timeoutMs,
    });
    return res;
  } catch (e) {
    return { ok: false, reason: 'バックグラウンド処理に失敗しました。' } as const;
  }
}
