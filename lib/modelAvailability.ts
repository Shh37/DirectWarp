import { listManagedModels, type ModelListing } from './apiClients/geminiModels';
import { GeminiError, record } from './apiClients/geminiErrors';
import { DeadlineError } from './deadline';
import { ALLOWED_MODELS } from './settings';
import { getApiKey } from './storage';

export const MODEL_CHECK_KEY = 'directwarp:model-check';
const failures = {
  authentication: 'APIキーの認証・利用権限を確認してください。',
  quota: 'モデル一覧の利用制限に達しました。時間をおいて確認してください。',
  network: 'モデル一覧を取得できませんでした。通信状態を確認してください。',
  timeout: 'モデル一覧の確認がタイムアウトしました。',
  response: 'モデル一覧の応答形式が不正です。',
  unavailable: 'モデル一覧を確認できませんでした。',
} as const;
export type ModelCheck = { checkedAt: number } & ({ ok: true; models: ModelListing[] } | { ok: false; failure: keyof typeof failures });
export const modelCheckFailureMessage = (check: Extract<ModelCheck, { ok: false }>) => failures[check.failure];

async function fingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readModelCheck(inputKey: string): Promise<{ saved: boolean; result: ModelCheck | null }> {
  const key = await getApiKey();
  if (!key || key !== inputKey) return { saved: false, result: null };
  const data = await browser.storage.local.get(MODEL_CHECK_KEY);
  const cache = record(data[MODEL_CHECK_KEY]);
  if (cache.version !== 1 || cache.keyFingerprint !== await fingerprint(key) || typeof cache.checkedAt !== 'number' || !Number.isFinite(cache.checkedAt)) return { saved: true, result: null };
  if (cache.ok === false && typeof cache.failure === 'string' && Object.hasOwn(failures, cache.failure)) {
    return { saved: true, result: { ok: false, checkedAt: cache.checkedAt, failure: cache.failure as keyof typeof failures } };
  }
  if (cache.ok === true && Array.isArray(cache.models) && cache.models.length === ALLOWED_MODELS.length
    && cache.models.every((item, i) => record(item).model === ALLOWED_MODELS[i] && ['listed', 'not_listed', 'unsupported'].includes(String(record(item).status)))) {
    return { saved: true, result: { ok: true, checkedAt: cache.checkedAt, models: cache.models.map((item) => ({ model: item.model, status: item.status })) } };
  }
  return { saved: true, result: null };
}

export async function checkModelAvailability(inputKey: string, signal: AbortSignal): Promise<ModelCheck> {
  const key = await getApiKey();
  signal.throwIfAborted();
  if (!key || inputKey !== key) throw new Error('APIキーを保存してから一覧を確認してください。');
  const keyFingerprint = await fingerprint(key);
  let result: ModelCheck;
  try {
    const models = await listManagedModels({ apiKey: key, timeoutMs: 15_000, signal });
    result = { ok: true, checkedAt: Date.now(), models };
  } catch (error) {
    signal.throwIfAborted();
    const failure = error instanceof DeadlineError ? 'timeout' : error instanceof GeminiError
      ? ['authentication', 'permission'].includes(error.kind) ? 'authentication'
        : ['quota', 'rate_limited'].includes(error.kind) ? 'quota'
          : error.kind === 'network' ? 'network' : error.kind === 'invalid_response' ? 'response' : 'unavailable'
      : 'unavailable';
    result = { ok: false, checkedAt: Date.now(), failure };
  }
  signal.throwIfAborted();
  if (await getApiKey() !== key) throw new Error('APIキーが変更されました。保存済みキーで再確認してください。');
  signal.throwIfAborted();
  // キー値・APIの生JSON・モデルの自由文を確認記録に含めない。
  await browser.storage.local.set({ [MODEL_CHECK_KEY]: { version: 1, keyFingerprint, ...result } });
  if (await getApiKey() !== key) throw new Error('APIキーが変更されました。保存済みキーで再確認してください。');
  return result;
}
