// lib/validator.ts
// 設定/入力値のバリデーションと正規化

import { type AppSettings, type GeminiModel, type Theme, DEFAULT_SETTINGS, ALLOWED_MODELS } from './settings';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function validateTrigger(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') return { ok: false, error: 'トリガーは文字列である必要があります。' };
  const v = input.trim();
  if (!v) return { ok: false, error: 'トリガーを入力してください。' };
  // 先頭文字種に制約なし（例: /d, !d, #go）
  // 検索クエリ先頭一致で使うため、空文字のみ禁止
  return { ok: true, value: v };
}

export function validateCandidateCount(input: unknown): ValidationResult<number> {
  const n = Number(input);
  if (!Number.isInteger(n)) return { ok: false, error: '候補数は整数である必要があります。' };
  // UI想定は 3/5/10 だが、将来拡張余地を考慮し 1..10 を許可
  if (n < 1 || n > 10) return { ok: false, error: '候補数は1〜10の範囲で指定してください。' };
  return { ok: true, value: n };
}

export function validateTimeoutMs(input: unknown): ValidationResult<number> {
  const n = Number(input);
  if (!Number.isInteger(n)) return { ok: false, error: 'タイムアウトは整数(ms)である必要があります。' };
  // 実運用レンジ: 1s〜120s を許可
  if (n < 1_000 || n > 120_000) return { ok: false, error: 'タイムアウトは1,000〜120,000msの範囲で指定してください。' };
  return { ok: true, value: n };
}

export function validateConfidenceThreshold(input: unknown): ValidationResult<number> {
  const n = Number(input);
  if (!Number.isFinite(n)) return { ok: false, error: 'しきい値は数値である必要があります。' };
  if (n < 0 || n > 1) return { ok: false, error: 'しきい値は0.0〜1.0の範囲で指定してください。' };
  // 小数許容
  return { ok: true, value: n };
}

export function validateModel(input: unknown): ValidationResult<GeminiModel> {
  if (typeof input !== 'string') return { ok: false, error: 'モデルは文字列である必要があります。' };
  if (!ALLOWED_MODELS.includes(input as GeminiModel)) {
    return { ok: false, error: `サポートされていないモデルです（許可: ${ALLOWED_MODELS.join(', ')}）` };
  }
  return { ok: true, value: input as GeminiModel };
}

export function validateTheme(input: unknown): ValidationResult<Theme> {
  if (input === 'system' || input === 'light' || input === 'dark') return { ok: true, value: input };
  return { ok: false, error: 'テーマは system / light / dark のいずれかを指定してください。' };
}

export function validateApiKey(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') return { ok: false, error: 'APIキーは文字列である必要があります。' };
  const v = input.trim();
  if (!v) return { ok: false, error: 'APIキーを入力してください。' };
  // 形式チェックは緩めに（将来のキー形式変更に備える）
  return { ok: true, value: v };
}

export function normalizeSettings(partial: Partial<AppSettings>): ValidationResult<AppSettings> {
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...partial };

  const t = validateTrigger(merged.trigger);
  if (!t.ok) return t as ValidationResult<AppSettings>;

  const c = validateCandidateCount(merged.candidateCount);
  if (!c.ok) return c as ValidationResult<AppSettings>;

  const m = validateModel(merged.model);
  if (!m.ok) return m as ValidationResult<AppSettings>;

  const tm = validateTimeoutMs(merged.timeoutMs);
  if (!tm.ok) return tm as ValidationResult<AppSettings>;

  const ct = validateConfidenceThreshold(merged.confidenceThreshold);
  if (!ct.ok) return ct as ValidationResult<AppSettings>;

  const th = validateTheme(merged.theme);
  if (!th.ok) return th as ValidationResult<AppSettings>;

  return {
    ok: true,
    value: {
      trigger: t.value,
      candidateCount: c.value,
      model: m.value,
      timeoutMs: tm.value,
      confidenceThreshold: ct.value,
      theme: th.value,
    },
  };
}
