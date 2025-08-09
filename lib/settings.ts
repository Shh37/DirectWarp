// lib/settings.ts
// アプリ設定の型定義とデフォルト値。APIキーは別ストレージキーに保存し、UI/設定オブジェクトには含めないこと。

export type Theme = 'system' | 'light' | 'dark';

// MVPでは Gemini 固定
export const ALLOWED_MODELS = ['gemini-1.5-flash'] as const;
export type GeminiModel = typeof ALLOWED_MODELS[number];

export interface AppSettings {
  /** 検索トリガー（先頭一致）。例: /d, !d, #go */
  trigger: string;
  /** Gemini へ投げる候補数（N）。例: 3/5/10 */
  candidateCount: number;
  /** 使用モデル（MVPは gemini-1.5-flash のみ） */
  model: GeminiModel;
  /** 推論タイムアウト(ms) */
  timeoutMs: number;
  /** リダイレクト許可の確信度しきい値(0.0-1.0) */
  confidenceThreshold: number;
  /** テーマ */
  theme: Theme;
}

export const DEFAULT_SETTINGS: AppSettings = {
  trigger: '/d',
  candidateCount: 3,
  model: 'gemini-1.5-flash',
  // デフォルトの推論タイムアウト: 15s（要件に明記なしのため合理的な値を採用）
  timeoutMs: 15_000,
  confidenceThreshold: 0.5,
  theme: 'system',
};

// storage.local のキー名
export const SETTINGS_KEY = 'app:settings';
export const API_KEY_KEY = 'secret:gemini_api_key';
