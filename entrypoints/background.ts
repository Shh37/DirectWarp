import { getSettings, getApiKey, getCustomSearchApiKey, getCustomSearchCx } from '../lib/storage';
import { selectBestUrlFromCandidates, predictBestUrl, type GeminiUrlResponse } from '../lib/apiClients/gemini';
import { searchTopUrls } from '../lib/apiClients/customSearch';

export default defineBackground(() => {
  // DirectWarp background: content からのURL解決要求を受けて
  // Custom Search で候補URLを取得 → Gemini で最適1件を選定
  // 注意: APIキーは一切ログに出力しない

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'directwarp:resolve') return;
    (async () => {
      const startTime = Date.now();
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

        // 並列処理: Custom Search と予測的Geminiを同時に開始
        const customSearchPromise = searchTopUrls({
          apiKey: csKey,
          cx: csCx,
          query,
          num: settings.candidateCount,
          timeoutMs: settings.timeoutMs,
        });

        const predictionPromise = predictBestUrl({
          apiKey: geminiKey,
          model: settings.model,
          query,
          timeoutMs: Math.floor(settings.timeoutMs * 0.6), // 予測は短めタイムアウト
        });

        // Custom Search結果を待機
        const items = await customSearchPromise;
        if (!items.length) {
          sendResponse({ ok: false, error: 'Custom Search で候補が見つかりませんでした。' });
          return;
        }

        const threshold = typeof settings.confidenceThreshold === 'number' ? settings.confidenceThreshold : 0.5;
        const predictionThreshold = typeof settings.predictionConfidenceThreshold === 'number' ? settings.predictionConfidenceThreshold : 0.85;

        // 予測結果を確認（高確信度なら即時リターン）
        let predictionResult: GeminiUrlResponse | null = null;
        let predictionUsed = false;
        try {
          predictionResult = await predictionPromise;
          if (predictionResult && predictionResult.confidence >= predictionThreshold) {
            // 予測結果の確信度が高い場合は即時リターン
            predictionUsed = true;
            const totalTime = Date.now() - startTime;
            console.log(`DirectWarp: 予測早期リターン ${totalTime}ms (confidence: ${predictionResult.confidence})`);
            sendResponse({ ok: true, url: predictionResult.url });
            return;
          }
        } catch {
          // 予測失敗は無視して本番処理へ
        }

        // 2) Gemini で候補群から最適な1件を選定（本番処理）
        const result = await selectBestUrlFromCandidates({
          apiKey: geminiKey,
          model: settings.model,
          query,
          candidates: items,
          timeoutMs: settings.timeoutMs,
        });

        if (result.confidence < threshold) {
          sendResponse({ ok: false, error: 'モデルの確信度が低いため中断しました。' });
          return;
        }

        sendResponse({ ok: true, url: result.url });
        const totalTime = Date.now() - startTime;
        console.log(`DirectWarp: 本番処理完了 ${totalTime}ms (confidence: ${result.confidence})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: `解決に失敗しました: ${msg}` });
      }
    })();
    return true; // 非同期応答
  });
});
