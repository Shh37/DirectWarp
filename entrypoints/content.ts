import { getSettingsManager, hasDirectWarpTrigger, removeTriggerFromQuery } from '../lib/settings';
import type { SearchError, SearchResponse } from '../lib/types';

export default defineContentScript({
  matches: ['*://*.google.com/*', '*://*.bing.com/*'],
  main() {
    console.log('DirectWarp content script loaded');
    
    // 検索ページの監視を開始
    initDirectWarp();
  },
});

/**
 * DirectWarp機能を初期化
 */
async function initDirectWarp(): Promise<void> {
  try {
    const settingsManager = getSettingsManager();
    const settings = settingsManager.getSettings();
    
    // 現在のページが検索結果ページかチェック
    if (isSearchResultsPage()) {
      // 検索クエリを取得
      const query = getSearchQuery();
      
      if (query && hasDirectWarpTrigger(query, settings.trigger)) {
        console.log('DirectWarp trigger detected:', query);
        
        try {
          // ローディング画面を表示
          const loadingScreen = showLoadingScreen();
          
          // トリガー文字列を削除したクエリを取得
          const cleanQuery = removeTriggerFromQuery(query, settings.trigger);
          
          // バックグラウンドスクリプトに検索を依頼（タイムアウト付き）
          const searchPromise = browser.runtime.sendMessage({
            type: 'SEARCH',
            query: cleanQuery,
            searchEngine: settings.searchEngine
          });
          
          // タイムアウト設定（10秒）
          const timeoutPromise = new Promise<SearchResponse>((_, reject) => {
            setTimeout(() => {
              reject(new Error('検索がタイムアウトしました。しばらくしてからもう一度お試しください。'));
            }, 10000);
          });
          
          // 検索実行（タイムアウト付き）
          const response = await Promise.race([searchPromise, timeoutPromise]) as SearchResponse;
          
          // ローディング画面を削除
          if (loadingScreen && loadingScreen.parentNode) {
            loadingScreen.parentNode.removeChild(loadingScreen);
          }
          
          if (response.success) {
            // 検索結果にリダイレクト
            window.location.href = response.result.url;
          } else {
            // エラー表示
            showErrorScreen(response.error?.message || '検索中にエラーが発生しました');
          }
        } catch (error) {
          console.error('Error in DirectWarp:', error);
          const errorMessage = error instanceof Error 
            ? error.message 
            : 'エラーが発生しました。ページを更新して再度お試しください。';
          showErrorScreen(errorMessage);
        }
      }
    }
  } catch (error) {
    console.error('DirectWarp initialization error:', error);
  }
}

/**
 * 現在のページが検索結果ページかチェック
 */
function isSearchResultsPage(): boolean {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  const search = window.location.search;
  
  // Google検索結果ページ
  if (hostname.includes('google.com') && pathname === '/search' && search.includes('q=')) {
    return true;
  }
  
  // Bing検索結果ページ
  if (hostname.includes('bing.com') && pathname === '/search' && search.includes('q=')) {
    return true;
  }
  
  return false;
}

/**
 * 検索クエリを取得
 */
function getSearchQuery(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('q');
}

/**
 * ローディング画面を表示
 * @returns 作成したローディング要素（後で削除するために使用）
 */
function showLoadingScreen(): HTMLElement {
  // 既存のローディング画面を削除
  const existingScreen = document.getElementById('directwarp-loading');
  if (existingScreen) {
    existingScreen.remove();
  }
  
  // ローディング画面を作成
  const loadingScreen = document.createElement('div');
  loadingScreen.id = 'directwarp-loading';
  loadingScreen.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="
        width: 40px;
        height: 40px;
        border: 3px solid #6B818E;
        border-top: 3px solid transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
      "></div>
      <div style="
        font-size: 18px;
        color: #333;
        font-weight: 500;
      ">DirectWarp で検索中...</div>
      <div style="
        font-size: 14px;
        color: #666;
        margin-top: 8px;
      ">最適な検索結果に移動しています</div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  document.body.appendChild(loadingScreen);
  return loadingScreen;
}

/**
 * エラー画面を表示
 * @param errorMessage 表示するエラーメッセージ
 * @param autoDismissMs 自動で閉じるまでのミリ秒（0の場合は自動で閉じない）
 */
function showErrorScreen(errorMessage: string, autoDismissMs: number = 5000): void {
  // 既存の画面を削除
  const existingScreen = document.getElementById('directwarp-loading');
  if (existingScreen) {
    existingScreen.remove();
  }
  
  // エラー画面を作成
  const errorScreen = document.createElement('div');
  errorScreen.id = 'directwarp-error';
  errorScreen.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="
        width: 60px;
        height: 60px;
        background: #ef4444;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-bottom: 20px;
      ">
        <div style="
          color: white;
          font-size: 24px;
          font-weight: bold;
        ">!</div>
      </div>
      <div style="
        font-size: 18px;
        color: #333;
        font-weight: 500;
        margin-bottom: 8px;
      ">DirectWarp エラー</div>
      <div style="
        font-size: 14px;
        color: #666;
        text-align: center;
        max-width: 400px;
        line-height: 1.5;
      ">${errorMessage}</div>
      <div style="
        font-size: 12px;
        color: #999;
        margin-top: 20px;
      ">2秒後に検索画面に戻ります...</div>
    </div>
  `;
  
  document.body.appendChild(errorScreen);
  
  // 2秒後に検索画面に戻る
  setTimeout(() => {
    errorScreen.remove();
    // 検索画面に戻る（トリガーなしのクエリで再検索）
    const query = getSearchQuery();
    if (query) {
      const settingsManager = getSettingsManager();
      const settings = settingsManager.getSettings();
      const cleanQuery = removeTriggerFromQuery(query, settings.trigger);
      
      const hostname = window.location.hostname;
      if (hostname.includes('google.com')) {
        window.location.href = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`;
      } else if (hostname.includes('bing.com')) {
        window.location.href = `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}`;
      }
    }
  }, 2000);
}
