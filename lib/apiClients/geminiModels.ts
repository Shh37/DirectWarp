import { withTimeout, type DeadlineOptions } from '../deadline';
import { ALLOWED_MODELS, MODEL_CAPABILITIES, isAllowedModel, type GeminiModel } from '../settings';
import { GeminiError, classifyGeminiHttpError, record } from './geminiErrors';

export type ModelListing = { model: GeminiModel; status: 'listed' | 'not_listed' | 'unsupported' };

export async function listManagedModels(req: DeadlineOptions & { apiKey: string }): Promise<ModelListing[]> {
  return withTimeout(async (signal) => {
    const found = new Map<GeminiModel, boolean>();
    const seenTokens = new Set<string>();
    let pageToken = '';
    for (let page = 0; page < 20; page++) {
      signal.throwIfAborted();
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      let response: Response;
      try { response = await fetch(url.toString(), { signal, headers: { 'x-goog-api-key': req.apiKey } }); }
      catch { signal.throwIfAborted(); throw new GeminiError('network'); }
      signal.throwIfAborted();
      if (!response.ok) {
        let body: unknown;
        try { body = JSON.parse(await response.text()); } catch { /* 本文は表示しない */ }
        signal.throwIfAborted();
        throw classifyGeminiHttpError(response.status, body, response.headers?.get('Retry-After') ?? null);
      }
      let raw: unknown;
      try { raw = await response.json(); } catch { signal.throwIfAborted(); throw new GeminiError('invalid_response'); }
      signal.throwIfAborted();
      const body = record(raw);
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || 'error' in body
        || (body.models !== undefined && !Array.isArray(body.models))
        || (body.nextPageToken !== undefined && typeof body.nextPageToken !== 'string')) throw new GeminiError('invalid_response');
      for (const item of (body.models ?? []) as unknown[]) {
        const model = record(item);
        if (typeof model.name !== 'string') throw new GeminiError('invalid_response');
        const id = model.name.startsWith('models/') ? model.name.slice(7) : '';
        if (!isAllowedModel(id)) continue;
        const canGenerate = Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent');
        // 重複する矛盾したエントリーは利用可と推測しない。
        found.set(id, (found.get(id) ?? true) && canGenerate);
      }
      pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
      if (!pageToken) return ALLOWED_MODELS.map((model) => {
        const capability = MODEL_CAPABILITIES[model];
        return { model, status: !found.has(model) ? 'not_listed'
          : found.get(model) && capability.textOutput && capability.structuredOutput && capability.release === 'stable' ? 'listed' : 'unsupported' };
      });
      if (seenTokens.has(pageToken)) throw new GeminiError('invalid_response');
      seenTokens.add(pageToken);
    }
    // 不完全な一覧を成功として保存しない。
    throw new GeminiError('invalid_response');
  }, req);
}
