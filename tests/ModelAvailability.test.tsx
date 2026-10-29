// @vitest-environment jsdom
import React from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelAvailability from '../entrypoints/shared/ModelAvailability';
import { API_KEY_KEY, DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import { mockStorage } from './storageMock';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('only sends the listing after an explicit click and restores its timestamp on reopening', async () => {
  const initial = { [API_KEY_KEY]: 'fake-key', [SETTINGS_KEY]: DEFAULT_SETTINGS };
  const { data } = mockStorage(initial);
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] })));
  const first = render(<ModelAvailability apiKeyInput="fake-key" />);
  const button = screen.getByRole<HTMLButtonElement>('button', { name: '保存済みキーでモデル一覧を確認' });
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText('モデル一覧は未確認です。')).toBeTruthy();
  fireEvent.click(button);
  await screen.findByText(/最終確認:/);
  expect(screen.getByText(/gemini-3.5-flash-lite: 一覧掲載/)).toBeTruthy();
  expect(screen.getByText(/掲載は生成成功・割り当て・課金条件を保証しません/)).toBeTruthy();
  expect(screen.getByRole<HTMLAnchorElement>('link', { name: '提供終了一覧' }).href).toBe('https://ai.google.dev/gemini-api/docs/deprecations');
  first.unmount(); render(<ModelAvailability apiKeyInput="fake-key" />);
  await screen.findByText(/最終確認:/);
  expect(fetch).toHaveBeenCalledOnce();
  expect(data[SETTINGS_KEY]).toEqual(initial[SETTINGS_KEY]);
});

it('does not send an unsaved key and invalidates the visible result on saved-key change', async () => {
  const { local } = mockStorage({ [API_KEY_KEY]: 'fake-key' });
  vi.mocked(fetch).mockResolvedValue(new Response('{}'));
  const view = render(<ModelAvailability apiKeyInput="unsaved-key" />);
  await screen.findByText(/未保存のキーでは通信しません/);
  expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(<ModelAvailability apiKeyInput="fake-key" />);
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(false));
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText(/最終確認:/);
  await act(async () => { await local.set({ [API_KEY_KEY]: 'another-project-key' }); });
  expect(screen.queryByText(/最終確認:/)).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
});

it('shows failure and keeps the saved settings intact', async () => {
  const { data } = mockStorage({ [API_KEY_KEY]: 'fake-key', [SETTINGS_KEY]: DEFAULT_SETTINGS });
  vi.mocked(fetch).mockResolvedValue(new Response('PRIVATE_KEY', { status: 403 }));
  render(<ModelAvailability apiKeyInput="fake-key" />);
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(false));
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('APIキーの認証・利用権限を確認してください。');
  expect(document.body.textContent).not.toContain('PRIVATE_KEY');
  expect(data[SETTINGS_KEY]).toEqual(DEFAULT_SETTINGS);
});

it('aborts when the settings view closes', async () => {
  mockStorage({ [API_KEY_KEY]: 'fake-key' });
  let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementation((_, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}); });
  const view = render(<ModelAvailability apiKeyInput="fake-key" />);
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(false));
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  view.unmount(); expect(signal.aborted).toBe(true);
});
