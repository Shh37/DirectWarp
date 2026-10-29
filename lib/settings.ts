// lib/settings.ts
// アプリ設定の型定義とデフォルト値。APIキーは別ストレージキーに保存し、UI/設定オブジェクトには含めないこと。

export type Theme = 'system' | 'light' | 'dark';
export const SEARCH_PROVIDERS = ['none', 'custom-search', 'tavily'] as const;
export function isSearchProvider(value: unknown): value is typeof SEARCH_PROVIDERS[number] {
  return typeof value === 'string' && SEARCH_PROVIDERS.some((provider) => provider === value);
}

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

// Models APIだけでは判定できない能力・リリース区分を公式資料から管理する。
// 確認: 2026-10-29。新IDの追加にはモデル別資料・提供終了予定の再確認が必要。
export const MODEL_CAPABILITIES: Record<GeminiModel, { textOutput: boolean; structuredOutput: boolean; release: 'stable' | 'preview' }> = {
  'gemini-3.5-flash-lite': { textOutput: true, structuredOutput: true, release: 'stable' },
  'gemini-2.5-flash': { textOutput: true, structuredOutput: true, release: 'stable' },
};

export interface AppSettings {
  /** 未知の保存値も保持し、別サービスに自動で切り替えない。 */
  searchProvider: string;
  /** 検索トリガー（先頭一致）。例: /d, !d, #go */
  trigger: string;
  /** 検索候補数（N）。例: 1〜10 */
  candidateCount: number;
  /** 明示的に許可した安定版モデル。2.5 Flash は既存利用者向け。 */
  model: GeminiModel;
  /** URL解決全体の期限(ms)。検索・予測・選定と応答本文の読込で共有する。 */
  timeoutMs: number;
  /** リダイレクト許可の確信度しきい値(0.0-1.0) */
  confidenceThreshold: number;
  /** 予測早期リターンの確信度しきい値(0.0-1.0) */
  predictionConfidenceThreshold: number;
  /** テーマ */
  theme: Theme;
}

export const DEFAULT_SETTINGS: AppSettings = {
  searchProvider: 'none',
  trigger: '/d',
  candidateCount: 5,
  model: 'gemini-3.5-flash-lite',
  // URL解決全体の既定期限: 15s。既存の保存値は変更しない。
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
export const TAVILY_API_KEY_KEY = 'secret:tavily_api_key';
