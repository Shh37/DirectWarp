import { getSettings, getApiKey, getCustomSearchApiKey, getCustomSearchCx } from '../lib/storage';
import { selectBestUrlFromCandidates } from '../lib/apiClients/gemini';
import { searchTopUrls } from '../lib/apiClients/customSearch';

export default defineBackground(() => {
  // DirectWarp background: content からのURL解決要求を受けて
  // Custom Search で候補URLを取得 → Gemini で最適1件を選定
  // 注意: APIキーは一切ログに出力しない

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'directwarp:resolve') return;
    (async () => {
      try {
        const { query } = message as { type: string; query: string };
        const settings = await getSettings();
        const geminiKey = await getApiKey();
        const csKey = await getCustomSearchApiKey();
        const csCx = await getCustomSearchCx();
        if (!geminiKey) {
          sendResponse({ ok: false, error: 'Gemini の APIキーが設定されていません。' });
          return;
        }
        if (!csKey || !csCx) {
          sendResponse({ ok: false, error: 'Custom Search の APIキーまたは CX が設定されていません。' });
          return;
        }

        // 1) Custom Search で上位N件の候補URLを取得
        const items = await searchTopUrls({
          apiKey: csKey,
          cx: csCx,
          query,
          num: settings.candidateCount,
          timeoutMs: settings.timeoutMs,
        });
        if (!items.length) {
          sendResponse({ ok: false, error: 'Custom Search で候補が見つかりませんでした。' });
          return;
        }

        // 2) Gemini で候補群から最適な1件を選定
        const result = await selectBestUrlFromCandidates({
          apiKey: geminiKey,
          model: settings.model,
          query,
          candidates: items,
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
