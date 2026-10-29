import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALLOWED_MODELS, API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, DEFAULT_SETTINGS, SETTINGS_KEY, type AppSettings } from '../lib/settings';
import { getSettings, getSettingsSnapshot, setSettings } from '../lib/storage';
import { normalizeSettings, validateModel } from '../lib/validator';
import { mockStorage } from './storageMock';

afterEach(() => vi.unstubAllGlobals());

describe('saved model migration', () => {
  const unrelated = {
    trigger: '!warp', candidateCount: 9, timeoutMs: 29_000,
    confidenceThreshold: 0.7, predictionConfidenceThreshold: 0.95, theme: 'dark',
  } as const;
  const secrets = {
    [API_KEY_KEY]: 'fake-gemini-key',
    [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-search-key',
    [CUSTOM_SEARCH_CX_KEY]: 'fake-search-cx',
  };

  it.each([
    'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash', 'unknown',
    'gemini-flash-latest', 'gemini-3-flash-preview', '', null, undefined, 42, {}, [],
  ])('replaces unsupported value %j without changing other settings or keys', async (model) => {
    const saved = { ...unrelated, model };
    const { data, local } = mockStorage({ [SETTINGS_KEY]: saved, ...secrets });
    const expected = { ...unrelated, model: DEFAULT_SETTINGS.model };
    expect(await getSettings()).toEqual(expected); // background may read first
    expect(await getSettingsSnapshot()).toEqual({ settings: expected, modelMigrated: true });
    expect(await getSettings()).toEqual(expected);
    expect(local.set).not.toHaveBeenCalled();
    expect(data).toEqual({ [SETTINGS_KEY]: saved, ...secrets });
    expect(normalizeSettings(await getSettings())).toEqual({ ok: true, value: expected });
    await setSettings(await getSettings());
    expect(await getSettingsSnapshot()).toEqual({ settings: expected, modelMigrated: false });
    expect(await getSettings()).toEqual(expected);
    expect(data).toEqual({ [SETTINGS_KEY]: expected, ...secrets });
  });

  it.each(ALLOWED_MODELS)('preserves valid model %s', async (model) => {
    const settings = { ...unrelated, model };
    const { local } = mockStorage({ [SETTINGS_KEY]: settings });
    expect(await getSettingsSnapshot()).toEqual({ settings, modelMigrated: false });
    expect(validateModel(model)).toEqual({ ok: true, value: model });
    expect(normalizeSettings(settings)).toEqual({ ok: true, value: settings });
    await setSettings(settings);
    expect(await getSettings()).toEqual(settings);
    expect(local.set).toHaveBeenCalledOnce();
  });

  it('uses the current default without a migration notice for a new user', async () => {
    const { local } = mockStorage();
    expect(DEFAULT_SETTINGS.model).toBe('gemini-3.5-flash-lite');
    expect(await getSettingsSnapshot()).toEqual({ settings: DEFAULT_SETTINGS, modelMigrated: false });
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(local.set).not.toHaveBeenCalled();
  });

  it('fills a missing saved model and missing fields', async () => {
    mockStorage({ [SETTINGS_KEY]: { trigger: '!keep' } });
    expect(await getSettingsSnapshot()).toEqual({
      settings: { ...DEFAULT_SETTINGS, trigger: '!keep' }, modelMigrated: true,
    });
  });

  it.each([null, 'broken', 0, []])('handles malformed settings %j', async (raw) => {
    mockStorage({ [SETTINGS_KEY]: raw });
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects unsupported models on explicit saves', async () => {
    const { local } = mockStorage();
    const invalid = { ...DEFAULT_SETTINGS, model: 'gemini-2.0-flash' } as unknown as AppSettings;
    expect(validateModel(invalid.model).ok).toBe(false);
    expect(normalizeSettings(invalid).ok).toBe(false);
    await expect(setSettings(invalid)).rejects.toThrow('サポートされていないモデル');
    expect(local.set).not.toHaveBeenCalled();
  });
});
