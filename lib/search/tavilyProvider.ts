import { searchTavily } from '../apiClients/tavily';
import { validateTavilyApiKey } from '../validator';
import { runWithDeadline } from '../deadline';
import { getTavilyApiKey } from '../storage';
import { searchFailure, toSearchFailure, type PreparedSearchProvider, type SearchContext } from './types';

export async function prepareTavilyProvider(context: SearchContext): Promise<PreparedSearchProvider> {
  try {
    return await runWithDeadline(async (signal): Promise<PreparedSearchProvider> => {
      const stored = await getTavilyApiKey();
      signal.throwIfAborted();
      if (!stored?.trim()) return { ok: false, error: { kind: 'not_configured', message: 'Tavily のAPIキーが未設定です。設定画面で本人のキーを設定してください。通常検索に戻ります。' } };
      const key = validateTavilyApiKey(stored);
      if (!key.ok) return searchFailure('authentication');
      return {
        ok: true,
        provider: {
          selectionMode: 'prediction-only',
          async search(request) {
            try { return { ok: true, candidates: await searchTavily({ ...request, apiKey: key.value }) }; }
            catch (error) { return toSearchFailure(error, request.signal); }
          },
        },
      };
    }, context.deadlineAt, context.signal);
  } catch (error) { return toSearchFailure(error, context.signal); }
}
