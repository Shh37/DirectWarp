import { getSettings, getApiKey } from '../lib/storage';
import { selectBestUrlFromCandidates, predictBestUrl } from '../lib/apiClients/gemini';
import { GeminiError } from '../lib/apiClients/geminiErrors';
import { prepareSearchProvider } from '../lib/search';
import { DeadlineError, runWithDeadline } from '../lib/deadline';
import { MAX_RESOLUTION_TIMEOUT_MS, resolutionTimeout, type ResolveResponse } from '../lib/resolution';
import { isNavigationUrl, matchCandidateUrl } from '../lib/navigationUrl';

export default defineBackground(() => {
  const active = new Map<string, { controller: AbortController; tabId?: number }>();
  const cancelTab = (tabId: number) => {
    for (const request of active.values()) {
      if (request.tabId === tabId) request.controller.abort();
    }
  };
  browser.tabs.onRemoved.addListener(cancelTab);
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading') cancelTab(tabId);
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !['directwarp:resolve', 'directwarp:cancel'].includes(message.type)) return;
    // requestId は content の各処理で生成。別タブ/フレームの処理を中断しない。
    const requestId = typeof message.requestId === 'string' ? message.requestId : crypto.randomUUID();
    const key = `${sender.tab?.id}:${sender.frameId}:${requestId}`;
    if (message.type === 'directwarp:cancel') {
      active.get(key)?.controller.abort();
      return;
    }
    const startTime = Date.now();
    const controller = new AbortController();
    active.get(key)?.controller.abort();
    active.set(key, { controller, tabId: sender.tab?.id });
    // content の期限はメッセージ配送時間も含む。旧contentには設定読込後に期限を適用。
    const incomingDeadline = typeof message.deadlineAt === 'number' && Number.isFinite(message.deadlineAt)
      ? Math.min(message.deadlineAt, startTime + MAX_RESOLUTION_TIMEOUT_MS)
      : startTime + MAX_RESOLUTION_TIMEOUT_MS;

    void (async () => {
      let response: ResolveResponse;
      try {
        response = await runWithDeadline(async (setupSignal) => {
          const settings = await getSettings();
          setupSignal.throwIfAborted();
          const timeoutMs = resolutionTimeout(settings.timeoutMs);
          const deadlineAt = Math.min(incomingDeadline, startTime + timeoutMs);
          return runWithDeadline(async (signal): Promise<ResolveResponse> => {
            const [geminiKey, prepared] = await Promise.all([
              getApiKey(), prepareSearchProvider(settings.searchProvider, { deadlineAt, signal }),
            ]);
            signal.throwIfAborted();
            if (!prepared.ok) return { ok: false, error: prepared.error.message };
            if (!geminiKey) return { ok: false, error: 'Gemini の APIキーが設定されていません。通常検索に戻ります。' };

            const canSelectCandidates = prepared.provider.selectionMode === 'candidate-selection';
            const searchPromise = prepared.provider.search({
              query: message.query, count: settings.candidateCount, deadlineAt, signal,
            });
            // 検索完了を待たず、開始した時点で予測の成功/失敗を回収する。
            const predictionPromise = predictBestUrl({
              apiKey: geminiKey, model: settings.model, query: message.query, timeoutMs,
              // 後続の候補選定がある場合だけ予算を残す。Tavilyは後続選定を行わない。
              deadlineAt: canSelectCandidates ? Math.min(deadlineAt, startTime + Math.floor(timeoutMs * 0.6)) : deadlineAt, signal,
            }).then((value) => ({ value, error: null }), (error: unknown) => ({ value: null, error }));

            const search = await searchPromise;
            if (!search.ok) return { ok: false, error: search.error.message };
            const items = search.candidates.filter((item) => isNavigationUrl(item.url));
            if (!items.length) return { ok: false, error: '検索候補が見つかりませんでした。' };
            const predicted = await predictionPromise;
            signal.throwIfAborted();
            // 予測だけの経路では通信・応答エラーを確信度不足に置き換えない。
            if (!canSelectCandidates && predicted.error !== null) throw predicted.error;
            // 恒常的な設定・権限・利用枠エラーなら、別プロンプトでも再送しない。
            if (predicted.error instanceof GeminiError && ['invalid_input', 'authentication', 'permission', 'payment', 'model_unavailable', 'quota'].includes(predicted.error.kind)) throw predicted.error;
            const prediction = predicted.value;
            const predictionThreshold = typeof settings.predictionConfidenceThreshold === 'number' ? settings.predictionConfidenceThreshold : 0.85;
            if (prediction && prediction.confidence >= predictionThreshold) {
              const url = matchCandidateUrl(prediction.url, items);
              return url ? { ok: true, url } : { ok: false, error: '予測URLが検索候補に一致しません。通常検索に戻ります。' };
            }

            // 明示的に許されたプロバイダー以外の検索結果をGeminiへ送らない。
            if (!canSelectCandidates) {
              return { ok: false, error: '予測URLの確信度が不足しています。検索候補をAIへ送らず、通常検索に戻ります。' };
            }
            const result = await selectBestUrlFromCandidates({
              apiKey: geminiKey, model: settings.model, query: message.query, candidates: items,
              timeoutMs, deadlineAt, signal,
            });
            const threshold = typeof settings.confidenceThreshold === 'number' ? settings.confidenceThreshold : 0.5;
            if (result.confidence < threshold) return { ok: false, error: 'モデルの確信度が低いため中断しました。' };
            const url = matchCandidateUrl(result.url, items);
            return url ? { ok: true, url } : { ok: false, error: '選定URLが検索候補に一致しません。通常検索に戻ります。' };
          }, deadlineAt, setupSignal);
        }, incomingDeadline, controller.signal);
      } catch (e) {
        // ブラウザー固有のAbortErrorや未知の生エラーを利用者へ露出しない。
        const msg = e instanceof DeadlineError || e instanceof GeminiError ? e.message
          : e instanceof Error && e.name === 'AbortError' ? '処理を中断しました。通常検索に戻ります。'
          : '処理に失敗しました。通常検索に戻ります。';
        response = { ok: false, error: `解決に失敗しました: ${msg}` };
      } finally {
        controller.abort();
        if (active.get(key)?.controller === controller) active.delete(key);
      }
      // ページが既に閉じられていても、応答の再送や未処理rejectionを生じさせない。
      try { sendResponse(response); } catch {}
    })();
    return true;
  });
});
