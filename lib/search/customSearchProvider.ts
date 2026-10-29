import { searchTopUrls } from '../apiClients/customSearch';
import { runWithDeadline } from '../deadline';
import { getCustomSearchApiKey, getCustomSearchCx } from '../storage';
import { SearchProviderError, toSearchFailure, type PreparedSearchProvider, type SearchContext, type SearchRequest, type SearchResult } from './types';

export async function prepareCustomSearchProvider(context: SearchContext): Promise<PreparedSearchProvider> {
  try {
    return await runWithDeadline(async (signal): Promise<PreparedSearchProvider> => {
      const [apiKey, cx] = await Promise.all([getCustomSearchApiKey(), getCustomSearchCx()]);
      signal.throwIfAborted();
      if (!apiKey?.trim() || !cx?.trim()) return {
        ok: false,
        error: { kind: 'not_configured', message: 'Custom Search の APIキーまたは CX が未設定です。JSON API の新規受付は終了しています。通常検索に戻ります。設定画面で利用条件を確認できます。' },
      };
      return {
        ok: true,
        provider: {
          selectionMode: 'candidate-selection',
          async search(request: SearchRequest): Promise<SearchResult> {
            try {
              const candidates = await runWithDeadline((requestSignal) => {
                if (typeof request.query !== 'string' || !request.query.trim() || !Number.isInteger(request.count) || request.count < 1 || request.count > 10) {
                  throw new SearchProviderError('invalid_request');
                }
                return searchTopUrls({ apiKey, cx, query: request.query, num: request.count,
                  timeoutMs: request.deadlineAt - Date.now(), deadlineAt: request.deadlineAt, signal: requestSignal });
              }, request.deadlineAt, request.signal);
              return { ok: true, candidates };
            } catch (error) {
              return toSearchFailure(error, request.signal);
            }
          },
        },
      };
    }, context.deadlineAt, context.signal);
  } catch (error) {
    return toSearchFailure(error, context.signal);
  }
}
