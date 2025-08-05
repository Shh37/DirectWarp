/**
 * 設定管理ユーティリティ
 * DirectWarp拡張機能の設定を管理
 */

import { DirectWarpSettings, loadSettings, saveSettings, DEFAULT_SETTINGS } from './storage';
import { validateTrigger, validateSearchEngine, validateTheme } from './validator';

export type { DirectWarpSettings } from './storage';
export { DEFAULT_SETTINGS } from './storage';

/**
 * 設定管理クラス
 */
export class SettingsManager {
  private settings: DirectWarpSettings = DEFAULT_SETTINGS;
  private listeners: ((settings: DirectWarpSettings) => void)[] = [];

  constructor() {
    this.loadSettings();
  }

  /**
   * 現在の設定を取得
   */
  getSettings(): DirectWarpSettings {
    return { ...this.settings };
  }

  /**
   * 設定を更新
   */
  async updateSettings(newSettings: Partial<DirectWarpSettings>): Promise<void> {
    // バリデーション
    const errors: string[] = [];

    if (newSettings.trigger !== undefined) {
      const triggerValidation = validateTrigger(newSettings.trigger);
      if (!triggerValidation.isValid) {
        errors.push(...triggerValidation.errors);
      }
    }

    if (newSettings.searchEngine !== undefined) {
      const engineValidation = validateSearchEngine(newSettings.searchEngine);
      if (!engineValidation.isValid) {
        errors.push(...engineValidation.errors);
      }
    }

    if (newSettings.theme !== undefined) {
      const themeValidation = validateTheme(newSettings.theme);
      if (!themeValidation.isValid) {
        errors.push(...themeValidation.errors);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    // 設定を更新
    this.settings = { ...this.settings, ...newSettings };
    
    // ストレージに保存
    await saveSettings(this.settings);
    
    // リスナーに通知
    this.notifyListeners();
  }

  /**
   * 設定をリセット
   */
  async resetSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await saveSettings(this.settings);
    this.notifyListeners();
  }

  /**
   * 設定変更リスナーを追加
   */
  addListener(listener: (settings: DirectWarpSettings) => void): () => void {
    this.listeners.push(listener);
    
    // クリーンアップ関数を返す
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 設定を読み込み
   */
  private async loadSettings(): Promise<void> {
    try {
      this.settings = await loadSettings();
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = DEFAULT_SETTINGS;
    }
  }

  /**
   * リスナーに通知
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getSettings());
      } catch (error) {
        console.error('Error in settings listener:', error);
      }
    });
  }
}

// グローバル設定管理インスタンス
let globalSettingsManager: SettingsManager | null = null;

/**
 * グローバル設定管理インスタンスを取得
 */
export function getSettingsManager(): SettingsManager {
  if (!globalSettingsManager) {
    globalSettingsManager = new SettingsManager();
  }
  return globalSettingsManager;
}

/**
 * 検索クエリがトリガーを含むかチェック
 */
export function hasDirectWarpTrigger(query: string, trigger: string): boolean {
  if (!query || !trigger) {
    return false;
  }
  
  return query.trim().startsWith(trigger);
}

/**
 * 検索クエリからトリガーを除去
 */
export function removeTriggerFromQuery(query: string, trigger: string): string {
  if (!hasDirectWarpTrigger(query, trigger)) {
    return query;
  }
  
  return query.substring(trigger.length).trim();
}

/**
 * システムテーマを検出
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * 実際に適用するテーマを取得
 */
export function getEffectiveTheme(theme: DirectWarpSettings['theme']): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}
