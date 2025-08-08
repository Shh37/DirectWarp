// lib/settings.ts
// Settings definition and helpers (no API key exposure to content scripts)

import { getFromStorage, setToStorage } from './storage';

export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  trigger: string; // e.g. '/d'
  n: number; // candidate count
  model: string; // e.g. 'gemini-1.5-flash'
  timeoutMs: number; // inference timeout
  theme: Theme;
}

export const SETTINGS_KEY = 'directwarp:settings';
export const API_KEY_KEY = 'directwarp:apiKey'; // stored only in background context

export const defaultSettings: Settings = {
  trigger: '/d',
  n: 3,
  model: 'gemini-1.5-flash',
  timeoutMs: 15000,
  theme: 'system',
};

export async function loadSettings(): Promise<Settings> {
  const s = await getFromStorage<Partial<Settings>>(SETTINGS_KEY, {} as Partial<Settings>);
  return { ...defaultSettings, ...s } as Settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setToStorage(SETTINGS_KEY, settings);
}

// API key helpers (should only be called from background scripts)
export async function loadApiKey(): Promise<string | undefined> {
  return await getFromStorage<string | undefined>(API_KEY_KEY, undefined);
}

export async function saveApiKey(key: string | undefined): Promise<void> {
  if (!key) {
    // Clear key if undefined/empty
    await setToStorage(API_KEY_KEY, undefined);
  } else {
    await setToStorage(API_KEY_KEY, key);
  }
}
