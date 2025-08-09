import { getSettings, getApiKey } from '../lib/storage';
import { getBestUrl } from '../lib/apiClients/gemini';

export default defineBackground(() => {
  // DirectWarp background: content からのURL解決要求を受けて Gemini を呼び出す
  // 注意: APIキーは一切ログに出力しない

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'directwarp:resolve') return;
    (async () => {
      try {
        const { query } = message as { type: string; query: string };
        const settings = await getSettings();
        const apiKey = await getApiKey();
        if (!apiKey) {
          sendResponse({ ok: false, error: 'Gemini の APIキーが設定されていません。' });
          return;
        }

        const result = await getBestUrl({
          apiKey,
          model: settings.model,
          query,
          candidateCount: settings.candidateCount,
          timeoutMs: settings.timeoutMs,
        });

        const threshold = typeof settings.confidenceThreshold === 'number' ? settings.confidenceThreshold : 0.5;
        if (result.confidence < threshold) {
          sendResponse({ ok: false, error: 'モデルの確信度が低いため中断しました。' });
          return;
        }

        sendResponse({ ok: true, url: result.url });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: `解決に失敗しました: ${msg}` });
      }
    })();
    return true; // 非同期応答
  });
});
