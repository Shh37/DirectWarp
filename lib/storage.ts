// lib/storage.ts
// Cross-browser storage helpers (Chrome/Firefox), MV3 compatible.

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject { [key: string]: JsonValue }
export interface JsonArray extends Array<JsonValue> {}

const area = chrome.storage?.local ?? browser.storage.local;

export async function getFromStorage<T = unknown>(key: string, fallback?: T): Promise<T> {
  const result = await area.get(key);
  const value = result?.[key];
  return (value === undefined ? fallback : value) as T;
}

export async function setToStorage<T = unknown>(key: string, value: T): Promise<void> {
  await area.set({ [key]: value });
}

export async function removeFromStorage(key: string): Promise<void> {
  await area.remove(key);
}

export async function getMany(keys: string[]): Promise<Record<string, unknown>> {
  return await area.get(keys);
}
