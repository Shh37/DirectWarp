// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsForm from '../entrypoints/shared/SettingsForm';
import { ALLOWED_MODELS, API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, DEFAULT_SETTINGS, SETTINGS_KEY, TAVILY_API_KEY_KEY } from '../lib/settings';
import { getSettings } from '../lib/storage';
import { mockStorage } from './storageMock';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('saves and switches Tavily explicitly, preserving legacy credentials and hidden thresholds without probes', async () => {
  const initial = { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, searchProvider: 'custom-search', confidenceThreshold: 0.73 }, [API_KEY_KEY]: 'gemini-key', [CUSTOM_SEARCH_API_KEY_KEY]: 'legacy-key', [CUSTOM_SEARCH_CX_KEY]: 'legacy-cx' };
  const { data, local } = mockStorage(initial);
  const first = render(<SettingsForm />);
  const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: /^検索プロバイダー/ });
  expect(select.value).toBe('custom-search'); expect(local.set).not.toHaveBeenCalled();
  const notice = screen.getByRole('region', { name: 'Tavily の利用条件' });
  expect(notice.textContent).toContain('カード不要'); expect(notice.textContent).toContain('月1,000 credits無料');
  expect(notice.textContent).toContain('検索結果はGeminiへ送らず');
  fireEvent.change(select, { target: { value: 'tavily' } });
  expect(screen.queryByText(/^確信度しきい値:/)).toBeNull();
  const input = screen.getByPlaceholderText<HTMLInputElement>('本人のTavily APIキー');
  expect(input.type).toBe('password');
  fireEvent.change(input, { target: { value: 'tvly-user-key' } });
  expect(data).toEqual(initial); expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '保存' })); await screen.findByText('保存しました。');
  const saved = { ...initial, [SETTINGS_KEY]: { ...initial[SETTINGS_KEY], searchProvider: 'tavily' }, [TAVILY_API_KEY_KEY]: 'tvly-user-key' };
  expect(data).toEqual(saved);
  first.unmount(); render(<SettingsForm />);
  const reloaded = await screen.findByRole<HTMLSelectElement>('combobox', { name: /^検索プロバイダー/ });
  expect(reloaded.value).toBe('tavily');
  expect(screen.getByPlaceholderText<HTMLInputElement>('本人のTavily APIキー').value).toBe('tvly-user-key');
  fireEvent.change(reloaded, { target: { value: 'custom-search' } });
  expect(screen.getByText('確信度しきい値: 73%')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '保存' })); await screen.findByText('保存しました。');
  expect(data).toEqual({ ...saved, [SETTINGS_KEY]: initial[SETTINGS_KEY] });
  expect(fetch).not.toHaveBeenCalled();
});

it('validates and explicitly clears only the Tavily key without changing the provider', async () => {
  const { data } = mockStorage({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, searchProvider: 'tavily' }, [TAVILY_API_KEY_KEY]: 'tvly-user-key', [API_KEY_KEY]: 'gemini-key' });
  render(<SettingsForm />);
  const input = await screen.findByPlaceholderText<HTMLInputElement>('本人のTavily APIキー');
  fireEvent.change(input, { target: { value: 'bad key' } });
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存' }).disabled).toBe(true);
  expect(data[TAVILY_API_KEY_KEY]).toBe('tvly-user-key');
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' })); await screen.findByText('保存しました。');
  expect(data[TAVILY_API_KEY_KEY]).toBeUndefined(); expect(data[API_KEY_KEY]).toBe('gemini-key');
  expect(data[SETTINGS_KEY]).toMatchObject({ searchProvider: 'tavily' });
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['gemini-2.0-flash', 'gemini-2.0-pro', 'invalid', null, undefined])('notifies for %j after a background read and saves without changing unrelated settings or keys', async (model) => {
  const saved = { ...DEFAULT_SETTINGS, model, trigger: '!keep', candidateCount: 7, theme: 'dark', timeoutMs: 29_500, confidenceThreshold: 0.73 };
  const secrets = { [API_KEY_KEY]: 'fake-gemini-key', [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-search-key', [CUSTOM_SEARCH_CX_KEY]: 'fake-cx' };
  const { data } = mockStorage({ [SETTINGS_KEY]: saved, ...secrets });
  await getSettings();
  const first = render(<SettingsForm />);
  const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: /^モデル/ });
  expect(select.value).toBe(DEFAULT_SETTINGS.model);
  expect(Array.from(select.options, (option) => option.value)).toEqual([...ALLOWED_MODELS]);
  expect(screen.getByRole('status').textContent).toContain('サポート対象外');
  const save = screen.getByRole<HTMLButtonElement>('button', { name: '保存' });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await screen.findByText('保存しました。');
  expect(data).toEqual({ [SETTINGS_KEY]: { ...saved, model: DEFAULT_SETTINGS.model }, ...secrets });
  expect(screen.queryByRole('status')).toBeNull();
  first.unmount();
  render(<SettingsForm />);
  expect((await screen.findByRole<HTMLSelectElement>('combobox', { name: /^モデル/ })).value).toBe(DEFAULT_SETTINGS.model);
  expect(screen.queryByRole('status')).toBeNull();
});

it.each(ALLOWED_MODELS)('can save valid model %s and explains project eligibility', async (model) => {
  const { data } = mockStorage({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, model } });
  render(<SettingsForm />);
  const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: /^モデル/ });
  expect(select.value).toBe(model);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText(/新規プロジェクトには/).textContent).toContain('過去に利用したユーザー');
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('保存しました。');
  expect(data[SETTINGS_KEY]).toEqual({ ...DEFAULT_SETTINGS, model });
});

it('selects the current default for a new user and supports explicit model changes', async () => {
  const { data } = mockStorage();
  render(<SettingsForm />);
  const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: /^モデル/ });
  expect(select.value).toBe(DEFAULT_SETTINGS.model);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: /^検索プロバイダー/ }).value).toBe('none');
  fireEvent.change(select, { target: { value: 'gemini-2.5-flash' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(data[SETTINGS_KEY]).toEqual({ ...DEFAULT_SETTINGS, model: 'gemini-2.5-flash' }));
});

it('keeps the migration notice when saving fails', async () => {
  const { local } = mockStorage({ [SETTINGS_KEY]: { model: 'invalid' } });
  local.set.mockRejectedValueOnce(new Error('Storage unavailable'));
  render(<SettingsForm />);
  await screen.findByRole('status');
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('Storage unavailable');
  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存' }).disabled).toBe(false);
});

it('still blocks invalid settings through the shared validator', async () => {
  const { local } = mockStorage({ [SETTINGS_KEY]: { model: 'invalid' } });
  render(<SettingsForm />);
  await screen.findByRole('status');
  fireEvent.change(screen.getByPlaceholderText('/d'), { target: { value: ' ' } });
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存' }).disabled).toBe(true);
  expect(screen.getByText('トリガーを入力してください。')).toBeTruthy();
  expect(local.set).not.toHaveBeenCalled();
});

it.each([
  ['', '', 'APIキー・CXが未設定'],
  ['fake-search-key', '', 'CXが未設定'],
  ['', 'fake-cx', 'APIキーが未設定'],
  ['fake-search-key', 'fake-cx', 'APIキー・CXは入力済み'],
])('explains search availability for key=%j, cx=%j without probing or changing storage', async (key, cx, status) => {
  const initial = { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS }, [CUSTOM_SEARCH_API_KEY_KEY]: key, [CUSTOM_SEARCH_CX_KEY]: cx };
  const { data, local } = mockStorage(initial);
  render(<SettingsForm />);
  const notice = await screen.findByRole('region', { name: 'Custom Search の利用条件' });
  expect(notice.textContent).toContain('新規顧客の受付は終了');
  expect(notice.textContent).toContain('2027年1月1日に終了');
  expect(notice.textContent).toContain('1日100件まで無料');
  expect(notice.textContent).toContain('US$5 / 1,000件');
  expect(notice.textContent).toContain('最大1日10,000件');
  expect(notice.textContent).toContain('2026年1月20日');
  expect(notice.textContent).toContain('JSON API自体の提供終了とは別');
  expect(notice.textContent).toContain('2026年10月29日 19:26 JST');
  expect(screen.getByRole<HTMLAnchorElement>('link', { name: '公式の提供状況・料金' }).href).toBe('https://developers.google.com/custom-search/v1/overview');
  expect(screen.getByRole<HTMLAnchorElement>('link', { name: '公式の検索エンジン変更案内' }).href).toBe('https://programmablesearchengine.googleblog.com/2026/01/updates-to-our-web-search-products.html');
  const state = screen.getByText((_, element) => element?.tagName === 'P' && element.textContent?.startsWith('Custom Search:') === true);
  expect(state.textContent).toContain(status);
  expect(state.textContent).toContain('通常検索を続けられます');
  if (key && cx) expect(state.textContent).toContain('利用資格は未確認');
  expect(data).toEqual(initial);
  expect(local.set).not.toHaveBeenCalled();
  expect(local.remove).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves existing credentials on save and does not disable settings based on the shutdown date', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2027-01-02T00:00:00+09:00').getTime());
  const initial = { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS }, [API_KEY_KEY]: 'fake-gemini-key', [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-search-key', [CUSTOM_SEARCH_CX_KEY]: 'fake-cx' };
  const { data, local } = mockStorage(initial);
  render(<SettingsForm />);
  const save = await screen.findByRole<HTMLButtonElement>('button', { name: '保存' });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await screen.findByText('保存しました。');
  expect(data).toEqual(initial);
  expect(local.remove).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('shows an unknown saved provider and requires an explicit choice without probing or clearing keys', async () => {
  const initial = { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, searchProvider: 'future-service' }, [CUSTOM_SEARCH_API_KEY_KEY]: 'fake-search', [CUSTOM_SEARCH_CX_KEY]: 'fake-cx' };
  const { data, local } = mockStorage(initial);
  render(<SettingsForm />);
  const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: /^検索プロバイダー/ });
  expect(select.value).toBe('future-service');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存' }).disabled).toBe(true);
  expect(local.set).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: 'none' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('保存しました。');
  expect(data).toEqual({ ...initial, [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, searchProvider: 'none' } });
  expect(fetch).not.toHaveBeenCalled();
});

it('displays the legacy provider until the user explicitly changes it', async () => {
  const { searchProvider: _, ...legacy } = DEFAULT_SETTINGS;
  const { local } = mockStorage({ [SETTINGS_KEY]: legacy });
  render(<SettingsForm />);
  expect((await screen.findByRole<HTMLSelectElement>('combobox', { name: '検索プロバイダー' })).value).toBe('custom-search');
  expect(local.set).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('explains key eligibility and distinct data policies while preserving keys of an unfamiliar format', async () => {
  const initial = { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS }, [API_KEY_KEY]: 'future-auth:dummy.key-format', [CUSTOM_SEARCH_API_KEY_KEY]: 'separate-search-key', [CUSTOM_SEARCH_CX_KEY]: 'fake-cx' };
  const { data, local } = mockStorage(initial);
  render(<SettingsForm />);
  const notice = await screen.findByRole('region', { name: 'Gemini の認証とデータ利用' });
  for (const text of ['Auth key', 'Standard key', '無制限の旧', '2026年5月28日', '2026年10月26日', 'store:false', '無料サービスのデータ利用や全種類の保持を無効にする指定ではありません', '検索語', 'URL・タイトル・要約', '20:16〜20:17 JST']) expect(notice.textContent).toContain(text);
  expect(screen.getByRole<HTMLAnchorElement>('link', { name: '認証条件' }).href).toBe('https://ai.google.dev/gemini-api/docs/api-key');
  expect(screen.getByRole<HTMLAnchorElement>('link', { name: 'リクエスト保存' }).href).toBe('https://ai.google.dev/gemini-api/docs/logs-datasets');
  expect(screen.getByRole<HTMLAnchorElement>('link', { name: 'データ利用条件' }).href).toBe('https://ai.google.dev/gemini-api/terms');
  expect((screen.getByPlaceholderText('Gemini用のAPIキー') as HTMLInputElement).value).toBe(initial[API_KEY_KEY]);
  expect(local.set).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('保存しました。');
  expect(data).toEqual(initial);
  expect(fetch).not.toHaveBeenCalled();
});
