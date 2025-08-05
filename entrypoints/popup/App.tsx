import { useEffect, useState, useCallback } from 'react';
import { getSettingsManager } from '../../lib/settings';
import { getEffectiveTheme } from '../../lib/settings';
import type { DirectWarpSettings, SearchError } from '../../lib/types';
import '../../assets/globals.css';

function App() {
  const [currentSettings, setCurrentSettings] = useState<DirectWarpSettings>({
    trigger: '!d',
    searchEngine: 'google',
    theme: 'system',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<SearchError | null>(null);
  const [activeTab, setActiveTab] = useState<'quick' | 'settings'>('quick');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const settingsManager = getSettingsManager();

  // 設定を読み込む
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await settingsManager.getSettings();
        setCurrentSettings(settings);
        setError(null);
        
        // テーマを適用
        applyTheme(getEffectiveTheme(settings.theme));
      } catch (error) {
        console.error('設定の読み込みに失敗しました:', error);
        setError({
          message: '設定の読み込みに失敗しました。',
          code: 'LOAD_SETTINGS_ERROR',
          details: error
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();

    // 設定変更を監視
    const unsubscribe = settingsManager.addListener((newSettings) => {
      setCurrentSettings(newSettings);
      applyTheme(getEffectiveTheme(newSettings.theme));
    });

    return () => {
      unsubscribe();
    };
  }, [settingsManager]);

  // テーマを適用
  const applyTheme = (theme: 'light' | 'dark') => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // 設定画面を開く
  const openOptionsPage = () => {
    browser.runtime.openOptionsPage();
  };

  // クイック検索を実行
  const handleQuickSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setError(null);
    
    try {
      const searchUrl = currentSettings.searchEngine === 'google'
        ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
        : `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      
      // 新しいタブで検索を開く
      window.open(searchUrl, '_blank');
      
      // 検索後にポップアップを閉じる（短い遅延を入れてUXを向上）
      setTimeout(() => {
        window.close();
      }, 200);
    } catch (error) {
      console.error('検索の実行中にエラーが発生しました:', error);
      setError({
        message: '検索の実行中にエラーが発生しました。',
        code: 'SEARCH_ERROR',
        details: error
      });
    } finally {
      setIsSearching(false);
    }
  }, [currentSettings.searchEngine]);

  // ローディング中
  if (isLoading) {
    return (
      <div className="w-80 p-4 bg-white dark:bg-gray-800 min-h-[200px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">設定を読み込んでいます...</p>
        </div>
      </div>
    );
  }
  
  // エラー表示
  if (error) {
    return (
      <div className="w-80 p-4 bg-white dark:bg-gray-800 min-h-[200px] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 dark:text-red-400 text-4xl mb-3">⚠️</div>
          <h3 className="font-medium text-gray-900 dark:text-white mb-1">エラーが発生しました</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-accent text-white rounded-md hover:bg-opacity-90 transition-colors text-sm font-medium"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">DirectWarp</h1>
          <button
            onClick={openOptionsPage}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="設定を開く"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          className={`flex-1 py-2 text-sm font-medium ${activeTab === 'quick' ? 'text-accent border-b-2 border-accent' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          onClick={() => setActiveTab('quick')}
        >
          クイック検索
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium ${activeTab === 'settings' ? 'text-accent border-b-2 border-accent' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          onClick={() => setActiveTab('settings')}
        >
          設定
        </button>
      </div>

      {/* コンテンツ */}
      <div className="p-4">
        {activeTab === 'quick' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-medium mb-2">クイック検索</h2>
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full input-field text-sm pr-10"
                    placeholder={`例: ${currentSettings.trigger} 天気`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        handleQuickSearch(searchQuery.trim());
                      }
                    }}
                    disabled={isSearching}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      disabled={isSearching}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  onClick={() => handleQuickSearch(searchQuery.trim())}
                  disabled={!searchQuery.trim() || isSearching}
                  className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    !searchQuery.trim() || isSearching
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-opacity-90'
                  }`}
                >
                  {isSearching ? (
                    <span className="inline-flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      検索中...
                    </span>
                  ) : (
                    '検索する'
                  )}
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium mb-2">よく使う検索</h2>
              <div className="grid grid-cols-2 gap-2">
                {['天気', '地図', '翻訳', 'ニュース'].map((item) => (
                  <button
                    key={item}
                    className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors"
                    onClick={() => {
                      handleQuickSearch(item);
                      window.close();
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-medium mb-2">現在の設定</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">トリガー</p>
                  <p className="text-sm">{currentSettings.trigger}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">検索エンジン</p>
                  <p className="text-sm">{currentSettings.searchEngine === 'google' ? 'Google' : 'Bing'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">テーマ</p>
                  <p className="text-sm">
                    {currentSettings.theme === 'system' ? 'システム設定' : 
                     currentSettings.theme === 'light' ? 'ライト' : 'ダーク'}
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={openOptionsPage}
              className="w-full btn-primary py-2 text-sm"
            >
              詳細設定を開く
            </button>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="p-2 text-center text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
        <p>DirectWarp v0.1.0</p>
      </div>
    </div>
  );
}

export default App;
