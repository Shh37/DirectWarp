import { searchGoogle, GoogleSearchResponse } from '../lib/apiClients/google';
import { searchBing, BingSearchResponse } from '../lib/apiClients/bing';
import { validateSearchQuery } from '../lib/validator';
import type { SearchResponse, SearchError, SearchResult } from '../lib/types';

// エラーメッセージの定義
const ERROR_MESSAGES = {
  INVALID_QUERY: '検索クエリが無効です。',
  SEARCH_FAILED: '検索に失敗しました。',
  NETWORK_ERROR: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
  TIMEOUT: '検索がタイムアウトしました。',
  UNKNOWN: '不明なエラーが発生しました。',
} as const;

// エラーコードの型
type ErrorCode = keyof typeof ERROR_MESSAGES;

// エラーを正規化する関数
function normalizeError(error: unknown): { code: ErrorCode; message: string; details?: any } {
  if (error && typeof error === 'object') {
    const err = error as { code?: string; message?: string; details?: any };
    return {
      code: (err.code as ErrorCode) || 'UNKNOWN',
      message: err.message || ERROR_MESSAGES.UNKNOWN,
      details: err.details
    };
  }
  return {
    code: 'UNKNOWN',
    message: ERROR_MESSAGES.UNKNOWN,
    details: error
  };
}

export default defineBackground(() => {
  console.log('DirectWarp background script loaded', { id: browser.runtime.id });
  
  // メッセージリスナーを設定
  browser.runtime.onMessage.addListener(handleMessage);
  
  // エラーログを記録
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LOG_ERROR') {
      console.error('Error from content script:', message.error);
      return true;
    }
    return false;
  });
});

/**
 * コンテンツスクリプトからのメッセージを処理
 */
async function handleMessage(
  message: any,
  sender: browser.runtime.MessageSender,
  sendResponse: (response: SearchResponse) => void
): Promise<boolean> {
  // メッセージタイプをチェック
  if (message.type !== 'SEARCH') {
    return false; // 他のリスナーに処理を任せる
  }
  
  try {
    console.log('Search request received:', { message, sender });
    
    const { query, searchEngine } = message;
    
        // クエリの検証
    const validation = validateSearchQuery(query);
    if (!validation.isValid) {
      const error: SearchError = {
        message: validation.errors?.[0] || ERROR_MESSAGES.INVALID_QUERY,
        code: 'INVALID_QUERY'
      };
      sendResponse({ success: false, error });
      return true;
    }
    
    // 検索を実行
    try {
      const result = await performSearch(query, searchEngine);
      sendResponse(result);
    } catch (error) {
      const normalizedError = normalizeError(error);
      console.error('Search failed:', { error: normalizedError, query, searchEngine });
      
      const searchError: SearchError = {
        message: normalizedError.message,
        code: normalizedError.code,
        details: normalizedError.details
      };
      
      sendResponse({ success: false, error: searchError });
      
      // エラーをログに記録
      if (browser && browser.runtime) {
        browser.runtime.sendMessage({
          type: 'LOG_ERROR',
          error: searchError,
          query,
          searchEngine,
          timestamp: new Date().toISOString()
        }).catch(console.error);
      }
    }
    
    return true; // 非同期レスポンスを送信するためtrueを返す
  } catch (error) {
    const normalizedError = normalizeError(error);
    console.error('Unexpected error in handleMessage:', normalizedError);
    
    const errorResponse: SearchResponse = {
      success: false,
      error: {
        message: ERROR_MESSAGES.UNKNOWN,
        code: 'UNKNOWN',
        details: normalizedError.details
      }
    };
    
    sendResponse(errorResponse);
    return true;
  }
}

/**
 * 検索を実行
 */
async function performSearch(
  query: string,
  searchEngine: 'google' | 'bing'
): Promise<SearchResponse> {
  console.log(`Performing ${searchEngine} search for:`, query);
  
  try {
    let searchResult: GoogleSearchResponse | BingSearchResponse | null = null;
    const startTime = Date.now();
    
    // 検索を実行
    if (searchEngine === 'google') {
      searchResult = await searchGoogle(query);
    } else {
      searchResult = await searchBing(query);
    }
    
    const duration = Date.now() - startTime;
    console.log(`Search completed in ${duration}ms`, { searchResult });
    
    if (searchResult && searchResult.success && searchResult.result) {
      const result: SearchResult = {
        url: searchResult.result.url,
        title: searchResult.result.title || 'No title'
      };
      
      return { 
        success: true, 
        result
      };
    } else {
      const errorMessage = searchResult && !searchResult.success 
        ? searchResult.error || '検索に失敗しました。'
        : '検索結果が見つかりませんでした。';
      
      return { 
        success: false, 
        error: { 
          message: errorMessage,
          code: 'NO_RESULTS'
        } 
      };
    }
  } catch (error) {
    console.error('Search execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '検索中にエラーが発生しました',
    };
  }
}
