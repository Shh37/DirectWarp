// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsForm from '../entrypoints/shared/SettingsForm';
import { ALLOWED_MODELS, API_KEY_KEY, CUSTOM_SEARCH_API_KEY_KEY, CUSTOM_SEARCH_CX_KEY, DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { getSettings } from '../lib/storage';
import { mockStorage } from './storageMock';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
