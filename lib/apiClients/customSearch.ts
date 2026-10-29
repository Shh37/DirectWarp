// lib/apiClients/customSearch.ts
// background 専用。Google Custom Search JSON API を利用して候補URLを取得する。
import { withTimeout, type DeadlineOptions } from '../deadline';
import { isNavigationUrl } from '../navigationUrl';
import { SearchProviderError, type SearchCandidate } from '../search/types';

export type CustomSearchItem = SearchCandidate;

export interface CustomSearchRequest extends DeadlineOptions {
  apiKey: string; // Google Cloud API Key for Custom Search API
  cx: string; // Custom Search Engine ID
  query: string; // 検索クエリ（トリガー除去後）
  num: number; // 1..10
  timeoutMs: number;
}

export async function searchTopUrls(req: CustomSearchRequest): Promise<CustomSearchItem[]> {
  const n = Math.max(1, Math.min(10, Math.floor(req.num)));
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', req.apiKey);
  url.searchParams.set('cx', req.cx);
  url.searchParams.set('q', req.query);
  url.searchParams.set('num', String(n));

  return withTimeout((signal) => fetch(url.toString(), {
    signal,
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  }).catch(() => {
    signal.throwIfAborted();
    throw new SearchProviderError('network');
  }).then(async (res) => {
    if (!res.ok) {
      await res.text().catch(() => ''); // 本文待ちも期限に含めるが、外へ返さない。
      throw new SearchProviderError(res.status === 429 ? 'rate_limited'
        : res.status === 401 || res.status === 403 ? 'authentication'
        : res.status === 400 ? 'invalid_request' : 'unavailable');
    }
    let json;
    try { json = await res.json(); } catch { throw new SearchProviderError('invalid_response'); }
    if (!json || typeof json !== 'object' || Array.isArray(json) || 'error' in json || (json.items !== undefined && !Array.isArray(json.items))) {
      throw new SearchProviderError('invalid_response');
    }
    const items = json.items ?? [];
    const results: CustomSearchItem[] = [];
    for (const it of items) {
      const link = typeof it?.link === 'string' ? it.link : null;
      if (!isNavigationUrl(link)) continue;
      results.push({
        url: link,
        title: typeof it?.title === 'string' ? it.title : undefined,
        snippet: typeof it?.snippet === 'string' ? it.snippet : undefined,
      });
    }
    return results;
  }), req);
}
