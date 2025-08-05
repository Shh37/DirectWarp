/**
 * Google検索APIクライアント
 * Google検索結果のトップURLを取得
 */

export interface SearchResult {
  url: string;
  title: string;
  description: string;
}

export interface GoogleSearchResponse {
  success: boolean;
  result?: SearchResult;
  error?: string;
}

/**
 * Google検索を実行してトップ結果を取得
 */
export async function searchGoogle(query: string): Promise<GoogleSearchResponse> {
  try {
    // Google検索のURLを構築
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ja`;
    
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
    const result = parseGoogleSearchResults(html);
    
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
    console.error('Google search error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '検索中にエラーが発生しました',
    };
  }
}

/**
 * Google検索結果のHTMLを解析してトップ結果を抽出
 */
function parseGoogleSearchResults(html: string): SearchResult | null {
  try {
    // 基本的な正規表現でリンクを抽出
    // Google検索結果の構造に基づいてURLを抽出
    const linkRegex = /<a[^>]+href="\/url\?q=([^&"]+)[^"]*"[^>]*>/g;
    const titleRegex = /<h3[^>]*>([^<]+)<\/h3>/g;
    
    let match = linkRegex.exec(html);
    if (match) {
      const url = decodeURIComponent(match[1]);
      
      // タイトルを抽出
      const titleMatch = titleRegex.exec(html);
      const title = titleMatch ? titleMatch[1] : 'タイトルなし';
      
      // 有効なURLかチェック
      if (isValidUrl(url)) {
        return {
          url,
          title,
          description: '',
        };
      }
    }

    // 代替方法：より広範囲な検索
    const altLinkRegex = /href="(https?:\/\/[^"]+)"/g;
    const altMatch = altLinkRegex.exec(html);
    
    if (altMatch) {
      const url = altMatch[1];
      if (isValidUrl(url) && !isGoogleUrl(url)) {
        return {
          url,
          title: 'タイトルなし',
          description: '',
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing Google search results:', error);
    return null;
  }
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
 * GoogleのURLかチェック（除外用）
 */
function isGoogleUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('google.com') || 
           urlObj.hostname.includes('youtube.com') ||
           urlObj.hostname.includes('googlevideo.com');
  } catch {
    return false;
  }
}
