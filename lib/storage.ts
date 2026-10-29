// lib/storage.ts
// browser.storage.local を用いた安全な保存/取得のラッパー。
// 注意: APIキーはログに出力しない。例外時もキーを含めない。

import { type AppSettings, DEFAULT_SETTINGS, SETTINGS_KEY, API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, isAllowedModel } from './settings';

export interface SettingsSnapshot {
  settings: AppSettings;
  modelMigrated: boolean;
}

export async function getSettingsSnapshot(): Promise<SettingsSnapshot> {
  const obj = await browser.storage.local.get(SETTINGS_KEY);
  const raw: unknown = obj?.[SETTINGS_KEY];
  const partial = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<AppSettings>
    : {};
  const model = isAllowedModel(partial.model) ? partial.model : DEFAULT_SETTINGS.model;
  // 読込時はモデルだけ正規化する。background/content からの読込が設定編集中の
  // 保存と競合しないよう、永続化は設定画面の明示的な保存時に行う。
  // これにより先に background が読んでも、設定画面で移行を通知できる。
  return {
    settings: { ...DEFAULT_SETTINGS, ...partial, model },
    modelMigrated: raw != null && !isAllowedModel(partial.model),
  };
}

export async function getSettings(): Promise<AppSettings> {
  return (await getSettingsSnapshot()).settings;
}

export async function setSettings(next: AppSettings): Promise<void> {
  if (!isAllowedModel(next.model)) throw new Error('サポートされていないモデルです。');
  // ここでログは出さない（sensitiveな情報は含まれないが念のため最小限に）
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
}

export async function getApiKey(): Promise<string | null> {
  const obj = await browser.storage.local.get(API_KEY_KEY);
  const key = (obj?.[API_KEY_KEY] ?? null) as string | null;
  return key ? String(key) : null;
}

export async function setApiKey(key: string): Promise<void> {
  // APIキーは絶対にログに出さない
  await browser.storage.local.set({ [API_KEY_KEY]: key });
}

export async function clearApiKey(): Promise<void> {
  await browser.storage.local.remove(API_KEY_KEY);
}

export function maskKey(key: string | null | undefined): string {
  if (!key) return '';
  const len = key.length;
  if (len <= 4) return '••••';
  return `${key.slice(0, 2)}•••${key.slice(-2)}`;
}

// --- Custom Search API ---
export async function getCustomSearchApiKey(): Promise<string | null> {
  const obj = await browser.storage.local.get(CUSTOM_SEARCH_API_KEY_KEY);
  const key = (obj?.[CUSTOM_SEARCH_API_KEY_KEY] ?? null) as string | null;
  return key ? String(key) : null;
}

export async function setCustomSearchApiKey(key: string): Promise<void> {
  await browser.storage.local.set({ [CUSTOM_SEARCH_API_KEY_KEY]: key });
}

export async function clearCustomSearchApiKey(): Promise<void> {
  await browser.storage.local.remove(CUSTOM_SEARCH_API_KEY_KEY);
}

export async function getCustomSearchCx(): Promise<string | null> {
  const obj = await browser.storage.local.get(CUSTOM_SEARCH_CX_KEY);
  const cx = (obj?.[CUSTOM_SEARCH_CX_KEY] ?? null) as string | null;
  return cx ? String(cx) : null;
}

export async function setCustomSearchCx(cx: string): Promise<void> {
  await browser.storage.local.set({ [CUSTOM_SEARCH_CX_KEY]: cx });
}

export async function clearCustomSearchCx(): Promise<void> {
  await browser.storage.local.remove(CUSTOM_SEARCH_CX_KEY);
}
