// background専用。2026-10-29確認: https://docs.tavily.com/documentation/api-reference/endpoint/search
import { runWithDeadline } from '../deadline';
import { isNavigationUrl } from '../navigationUrl';
import { validateTavilyApiKey } from '../validator';
import { SearchProviderError, type SearchCandidate, type SearchRequest } from '../search/types';

function parseCandidates(value: unknown, count: number): SearchCandidate[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('results' in value) || !Array.isArray(value.results)) throw new SearchProviderError('invalid_response');
  const candidates: SearchCandidate[] = [];
  for (const item of value.results) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.url !== 'string'
      || (item.title !== undefined && typeof item.title !== 'string')
      || (item.content !== undefined && typeof item.content !== 'string')) throw new SearchProviderError('invalid_response');
    if (isNavigationUrl(item.url)) candidates.push({ url: item.url, title: item.title, snippet: item.content });
  }
  return candidates.slice(0, count);
}

export async function searchTavily(req: SearchRequest & { apiKey: string }): Promise<SearchCandidate[]> {
  return runWithDeadline(async (signal) => {
    const key = validateTavilyApiKey(req.apiKey);
    if (!key.ok) throw new SearchProviderError('authentication');
    if (typeof req.query !== 'string' || !req.query.trim() || !Number.isInteger(req.count) || req.count < 1 || req.count > 10) {
      throw new SearchProviderError('invalid_request');
    }
    let response: Response;
    try {
      response = await fetch('https://api.tavily.com/search', {
        method: 'POST', signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.value}` },
        body: JSON.stringify({ query: req.query, max_results: req.count, topic: 'general',
          search_depth: 'basic', auto_parameters: false, include_answer: false,
          include_raw_content: false, include_images: false }),
      });
    } catch {
      signal.throwIfAborted();
      throw new SearchProviderError('network');
    }
    signal.throwIfAborted();
    // エラー本文は不要。個別のメッセージや資格情報を読み出さない。
    if (!response.ok) {
      const kind = [400, 422].includes(response.status) ? 'invalid_request'
        : [401, 403].includes(response.status) ? 'authentication'
        : [429, 432, 433].includes(response.status) ? 'rate_limited' : 'unavailable';
      throw new SearchProviderError(kind);
    }
    let json: unknown;
    try { json = await response.json(); } catch {
      signal.throwIfAborted();
      throw new SearchProviderError('invalid_response');
    }
    signal.throwIfAborted();
    return parseCandidates(json, req.count);
  }, req.deadlineAt, req.signal);
}
