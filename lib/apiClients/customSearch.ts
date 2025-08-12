// lib/apiClients/customSearch.ts
// background 専用。Google Custom Search JSON API を利用して候補URLを取得する。

export interface CustomSearchItem {
  url: string;
  title?: string;
  snippet?: string;
}

export interface CustomSearchRequest {
  apiKey: string; // Google Cloud API Key for Custom Search API
  cx: string; // Custom Search Engine ID
  query: string; // 検索クエリ（トリガー除去後）
  num: number; // 1..10
  timeoutMs: number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return new Promise<T>((resolve, reject) => {
    p.then(resolve).catch(reject).finally(() => clearTimeout(t));
  });
}

export async function searchTopUrls(req: CustomSearchRequest): Promise<CustomSearchItem[]> {
  const n = Math.max(1, Math.min(10, Math.floor(req.num)));
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', req.apiKey);
  url.searchParams.set('cx', req.cx);
  url.searchParams.set('q', req.query);
  url.searchParams.set('num', String(n));

  const fetchPromise = fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Custom Search API error: ${res.status} ${res.statusText} ${text}`);
    }
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    const results: CustomSearchItem[] = [];
    for (const it of items) {
      const link = typeof it?.link === 'string' ? it.link : null;
      if (!link || !/^https?:\/\//i.test(link)) continue;
      results.push({
        url: link,
        title: typeof it?.title === 'string' ? it.title : undefined,
        snippet: typeof it?.snippet === 'string' ? it.snippet : undefined,
      });
    }
    return results;
  });

  return withTimeout(fetchPromise, req.timeoutMs);
}
