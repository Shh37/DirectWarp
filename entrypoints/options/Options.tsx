import React, { useState, useEffect } from 'react';
import { getSettingsManager, DirectWarpSettings, getEffectiveTheme } from '../../lib/settings';
import { validateTrigger, validateSearchEngine, validateTheme } from '../../lib/validator';

const Options: React.FC = () => {
  const [settings, setSettings] = useState<DirectWarpSettings>({
    trigger: '!d',
    searchEngine: 'google',
    theme: 'system',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  const settingsManager = getSettingsManager();

  // 設定を読み込み
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = settingsManager.getSettings();
        setSettings(currentSettings);
        
        // テーマを適用
        applyTheme(getEffectiveTheme(currentSettings.theme));
      } catch (error) {
        console.error('Failed to load settings:', error);
        setErrors(['設定の読み込みに失敗しました']);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();

    // 設定変更を監視
    const unsubscribe = settingsManager.addListener((newSettings) => {
      setSettings(newSettings);
      applyTheme(getEffectiveTheme(newSettings.theme));
    });

    return unsubscribe;
  }, []);

  // テーマを適用
  const applyTheme = (theme: 'light' | 'dark') => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // 設定を保存
  const handleSave = async () => {
    setIsSaving(true);
    setErrors([]);
    setSaveMessage('');

    try {
      // バリデーション
      const triggerValidation = validateTrigger(settings.trigger);
      const engineValidation = validateSearchEngine(settings.searchEngine);
      const themeValidation = validateTheme(settings.theme);

      const allErrors = [
        ...triggerValidation.errors,
        ...engineValidation.errors,
        ...themeValidation.errors,
      ];

      if (allErrors.length > 0) {
        setErrors(allErrors);
        return;
      }

      // 設定を保存
      await settingsManager.updateSettings(settings);
      setSaveMessage('設定を保存しました');
      
      // 3秒後にメッセージを消去
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setErrors([error instanceof Error ? error.message : '設定の保存に失敗しました']);
    } finally {
      setIsSaving(false);
    }
  };

  // 設定をリセット
  const handleReset = async () => {
    if (!confirm('設定をリセットしますか？この操作は元に戻せません。')) {
      return;
    }

    setIsSaving(true);
    setErrors([]);
    setSaveMessage('');

    try {
      await settingsManager.resetSettings();
      setSaveMessage('設定をリセットしました');
      
      // 3秒後にメッセージを消去
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to reset settings:', error);
      setErrors([error instanceof Error ? error.message : '設定のリセットに失敗しました']);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">設定を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            DirectWarp 設定
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            検索結果のトップURLに直接ジャンプする拡張機能の設定を変更できます
          </p>
        </div>

        {/* エラーメッセージ */}
        {errors.length > 0 && (
          <div className="card p-4 mb-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center mb-2">
              <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center mr-3">
                <span className="text-white text-sm font-bold">!</span>
              </div>
              <h3 className="font-medium text-red-800 dark:text-red-200">エラー</h3>
            </div>
            <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 保存メッセージ */}
        {saveMessage && (
          <div className="card p-4 mb-6 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center mr-3">
                <span className="text-white text-sm font-bold">✓</span>
              </div>
              <p className="text-green-800 dark:text-green-200">{saveMessage}</p>
            </div>
          </div>
        )}

        {/* 設定フォーム */}
        <div className="card p-6 mb-6">
          <div className="space-y-6">
            {/* トリガー設定 */}
            <div>
              <label htmlFor="trigger" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                トリガー文字列
              </label>
              <input
                type="text"
                id="trigger"
                value={settings.trigger}
                onChange={(e) => setSettings({ ...settings, trigger: e.target.value })}
                className="input-field"
                placeholder="!d"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                検索クエリの先頭に付ける文字列（例：「!d 天気予報」）
              </p>
            </div>

            {/* 検索エンジン設定 */}
            <div>
              <label htmlFor="searchEngine" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                検索エンジン
              </label>
              <select
                id="searchEngine"
                value={settings.searchEngine}
                onChange={(e) => setSettings({ ...settings, searchEngine: e.target.value as 'google' | 'bing' })}
                className="input-field"
              >
                <option value="google">Google</option>
                <option value="bing">Bing</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                検索結果を取得する検索エンジンを選択
              </p>
            </div>

            {/* テーマ設定 */}
            <div>
              <label htmlFor="theme" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                テーマ
              </label>
              <select
                id="theme"
                value={settings.theme}
                onChange={(e) => setSettings({ ...settings, theme: e.target.value as 'light' | 'dark' | 'system' })}
                className="input-field"
              >
                <option value="system">システム設定に従う</option>
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                アプリケーションのカラーテーマを選択
              </p>
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="btn-secondary px-6 py-2 text-sm"
          >
            デフォルトにリセット
          </button>
          
          <div className="space-x-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary px-6 py-2 text-sm"
            >
              {isSaving ? '保存中...' : '設定を保存'}
            </button>
          </div>
        </div>

        {/* フッター */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            DirectWarp v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default Options;
