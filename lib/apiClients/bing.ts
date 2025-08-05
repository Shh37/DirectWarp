/**
 * Bing検索APIクライアント
 * Bing検索結果のトップURLを取得
 */

export interface SearchResult {
  url: string;
  title: string;
  description: string;
}

export interface BingSearchResponse {
  success: boolean;
  result?: SearchResult;
  error?: string;
}

/**
 * Bing検索を実行してトップ結果を取得
 */
export async function searchBing(query: string): Promise<BingSearchResponse> {
  try {
    // Bing検索のURLを構築
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ja`;
    
    // フェッチリクエストを送信
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    
    // HTMLから検索結果を抽出
    const result = parseBingSearchResults(html);
    
    if (!result) {
      return {
        success: false,
        error: '検索結果が見つかりませんでした',
      };
    }

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error('Bing search error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '検索中にエラーが発生しました',
    };
  }
}

/**
 * Bing検索結果のHTMLを解析してトップ結果を抽出
 */
function parseBingSearchResults(html: string): SearchResult | null {
  try {
    // Bing検索結果の構造に基づいてURLを抽出
    // Bingの検索結果リンクパターン
    const linkRegex = /<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/g;
    
    let match = linkRegex.exec(html);
    if (match) {
      const url = match[1];
      const title = match[2];
      
      // 有効なURLかチェック
      if (isValidUrl(url)) {
        return {
          url,
          title: cleanTitle(title),
          description: '',
        };
      }
    }

    // 代替方法：より広範囲な検索
    const altLinkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/g;
    const altTitleRegex = /<h2[^>]*>([^<]+)<\/h2>/g;
    
    const altMatch = altLinkRegex.exec(html);
    if (altMatch) {
      const url = altMatch[1];
      if (isValidUrl(url) && !isBingUrl(url)) {
        const titleMatch = altTitleRegex.exec(html);
        const title = titleMatch ? cleanTitle(titleMatch[1]) : 'タイトルなし';
        
        return {
          url,
          title,
          description: '',
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing Bing search results:', error);
    return null;
  }
}

/**
 * タイトルをクリーンアップ
 */
function cleanTitle(title: string): string {
  // HTMLエンティティをデコード
  return title
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * 有効なURLかチェック
 */
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * BingのURLかチェック（除外用）
 */
function isBingUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('bing.com') || 
           urlObj.hostname.includes('microsoft.com') ||
           urlObj.hostname.includes('msn.com');
  } catch {
    return false;
  }
}
