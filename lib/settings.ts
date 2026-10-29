// lib/settings.ts
// アプリ設定の型定義とデフォルト値。APIキーは別ストレージキーに保存し、UI/設定オブジェクトには含めないこと。

export type Theme = 'system' | 'light' | 'dark';

// 2026-10-29 に公式の安定版・提供状況を確認。latest / Preview は自動採用しない。
// https://ai.google.dev/gemini-api/docs/deprecations
export const ALLOWED_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
] as const;
export type GeminiModel = typeof ALLOWED_MODELS[number];

export const MODEL_LABELS: Record<GeminiModel, string> = {
  'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite（既定・新規プロジェクト向け）',
  'gemini-2.5-flash': 'gemini-2.5-flash（過去に利用したユーザー限定）',
};

export function isAllowedModel(value: unknown): value is GeminiModel {
  return typeof value === 'string' && ALLOWED_MODELS.some((model) => model === value);
}

export interface AppSettings {
  /** 検索トリガー（先頭一致）。例: /d, !d, #go */
  trigger: string;
  /** 候補数（N）。Custom Search API の取得件数。例: 1〜10 */
  candidateCount: number;
  /** 明示的に許可した安定版モデル。2.5 Flash は既存利用者向け。 */
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
  model: 'gemini-3.5-flash-lite',
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
