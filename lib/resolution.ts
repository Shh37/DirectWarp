import { DEFAULT_SETTINGS } from './settings';

export type ResolveResponse = { ok: true; url: string } | { ok: false; error: string };
export const MAX_RESOLUTION_TIMEOUT_MS = 120_000;
export const SEARCH_RETURN_DELAY_MS = 2_000;

export function resolutionTimeout(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1_000 && value <= MAX_RESOLUTION_TIMEOUT_MS
    ? value : DEFAULT_SETTINGS.timeoutMs;
}
