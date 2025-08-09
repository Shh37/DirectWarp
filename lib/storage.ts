// lib/storage.ts
// browser.storage.local を用いた安全な保存/取得のラッパー。
// 注意: APIキーはログに出力しない。例外時もキーを含めない。

import { type AppSettings, DEFAULT_SETTINGS, SETTINGS_KEY, API_KEY_KEY } from './settings';

function mergeSettings(partial?: Partial<AppSettings> | null): AppSettings {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
}

export async function getSettings(): Promise<AppSettings> {
  const obj = await browser.storage.local.get(SETTINGS_KEY);
  const raw = (obj?.[SETTINGS_KEY] ?? null) as Partial<AppSettings> | null;
  return mergeSettings(raw);
}

export async function setSettings(next: AppSettings): Promise<void> {
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
