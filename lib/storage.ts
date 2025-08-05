/**
 * ストレージ管理ユーティリティ
 * Chrome/Firefox拡張機能のローカルストレージを管理
 */

export interface DirectWarpSettings {
  trigger: string;
  searchEngine: 'google' | 'bing';
  theme: 'light' | 'dark' | 'system';
}

export const DEFAULT_SETTINGS: DirectWarpSettings = {
  trigger: '!d',
  searchEngine: 'google',
  theme: 'system',
};

/**
 * 設定を保存
 */
export async function saveSettings(settings: Partial<DirectWarpSettings>): Promise<void> {
  try {
    await browser.storage.local.set({ directWarpSettings: settings });
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw new Error('設定の保存に失敗しました');
  }
}

/**
 * 設定を読み込み
 */
export async function loadSettings(): Promise<DirectWarpSettings> {
  try {
    const result = await browser.storage.local.get('directWarpSettings');
    const savedSettings = result.directWarpSettings || {};
    
    return {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
    };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * 設定をリセット
 */
export async function resetSettings(): Promise<void> {
  try {
    await browser.storage.local.remove('directWarpSettings');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    throw new Error('設定のリセットに失敗しました');
  }
}

/**
 * 設定変更を監視
 */
export function watchSettings(callback: (settings: DirectWarpSettings) => void): () => void {
  const listener = (changes: { [key: string]: browser.storage.StorageChange }) => {
    if (changes.directWarpSettings) {
      const newSettings = {
        ...DEFAULT_SETTINGS,
        ...changes.directWarpSettings.newValue,
      };
      callback(newSettings);
    }
  };

  browser.storage.onChanged.addListener(listener);
  
  // クリーンアップ関数を返す
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
