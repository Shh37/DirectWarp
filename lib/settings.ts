// lib/settings.ts
// アプリ設定の型定義とデフォルト値。APIキーは別ストレージキーに保存し、UI/設定オブジェクトには含めないこと。

export type Theme = 'system' | 'light' | 'dark';

// サポートするGeminiモデル一覧 (2.x系に更新)
export const ALLOWED_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-pro',
] as const;
export type GeminiModel = typeof ALLOWED_MODELS[number];

export interface AppSettings {
  /** 検索トリガー（先頭一致）。例: /d, !d, #go */
  trigger: string;
  /** 候補数（N）。Custom Search API の取得件数。例: 1〜10 */
  candidateCount: number;
  /** 使用モデル（MVPは gemini-1.5-flash のみ） */
  model: GeminiModel;
  /** 推論タイムアウト(ms) */
  timeoutMs: number;
  /** リダイレクト許可の確信度しきい値(0.0-1.0) */
  confidenceThreshold: number;
  /** 予測早期リターンの確信度しきい値(0.0-1.0) */
  predictionConfidenceThreshold: number;
  /** テーマ */
  theme: Theme;
}

export const DEFAULT_SETTINGS: AppSettings = {
  trigger: '/d',
  candidateCount: 5,
  model: 'gemini-2.0-flash',
  // デフォルトの推論タイムアウト: 15s（要件に明記なしのため合理的な値を採用）
  timeoutMs: 15_000,
  confidenceThreshold: 0.5,
  predictionConfidenceThreshold: 0.85,
  theme: 'system',
};

// storage.local のキー名
export const SETTINGS_KEY = 'app:settings';
export const API_KEY_KEY = 'secret:gemini_api_key';
export const CUSTOM_SEARCH_API_KEY_KEY = 'secret:custom_search_api_key';
export const CUSTOM_SEARCH_CX_KEY = 'secret:custom_search_cx';
