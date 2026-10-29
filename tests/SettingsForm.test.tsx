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
