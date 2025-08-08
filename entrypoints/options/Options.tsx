import React, { useEffect, useMemo, useState } from 'react';
import { defaultSettings, loadSettings, saveSettings, saveApiKey } from '@/lib/settings';
import { validateN, validateTimeout, validateTrigger } from '@/lib/validator';

export default function Options() {
  const [trigger, setTrigger] = useState(defaultSettings.trigger);
  const [n, setN] = useState<number>(defaultSettings.n);
  const [timeoutMs, setTimeoutMs] = useState<number>(defaultSettings.timeoutMs);
  const [model, setModel] = useState(defaultSettings.model);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(defaultSettings.theme);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setTrigger(s.trigger);
      setN(s.n);
      setTimeoutMs(s.timeoutMs);
      setModel(s.model);
      setTheme(s.theme);
    })();
  }, []);

  const canSave = useMemo(() => {
    return (
      validateTrigger(trigger).ok &&
      validateN(n).ok &&
      validateTimeout(timeoutMs).ok &&
      model.trim().length > 0
    );
  }, [trigger, n, timeoutMs, model]);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    setError(null);

    const vt = validateTrigger(trigger);
    if (!vt.ok) return bail(vt.reason);

    const vn = validateN(n);
    if (!vn.ok) return bail(vn.reason);

    const vto = validateTimeout(timeoutMs);
    if (!vto.ok) return bail(vto.reason);

    try {
      await saveSettings({ trigger, n, timeoutMs, model, theme });
      if (apiKeyInput.trim()) {
        // Overwrite key only when user provided a new one
        await saveApiKey(apiKeyInput.trim());
      }
      setMessage('保存しました。');
      setApiKeyInput('');
    } catch (e) {
      setError('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  async function onClearKey() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await saveApiKey('');
      setMessage('APIキーを削除しました。');
    } catch {
      setError('APIキーの削除に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  function bail(msg: string) {
    setError(msg);
    setSaving(false);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 font-sans text-sm">
      <h1 className="text-lg mb-4">DirectWarp 設定</h1>

      <Section title="基本設定">
        <Field label="トリガー文字列 (先頭一致)">
          <input value={trigger} onChange={(e) => setTrigger(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-300 outline-none" placeholder="/d" />
        </Field>
        <Field label="候補数 N">
          <select value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl border border-gray-300 outline-none">
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </Field>
        <Field label="タイムアウト (ms)">
          <input
            type="number"
            min={1000}
            max={60000}
            step={500}
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 outline-none"
          />
        </Field>
        <Field label="Gemini モデル">
          <input value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-300 outline-none" placeholder="gemini-1.5-flash" />
        </Field>
        <Field label="テーマ">
          <select value={theme} onChange={(e) => setTheme(e.target.value as any)} className="w-full px-3 py-2 rounded-xl border border-gray-300 outline-none">
            <option value="system">システムに追従</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </Field>
      </Section>

      <Section title="API キー (Gemini)">
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 outline-none"
            placeholder="新しいAPIキーを貼り付け (保存時に上書き)"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-gray-700"
          >
            {showKey ? '隠す' : '表示'}
          </button>
          <button type="button" onClick={onClearKey} className="px-3 py-2 rounded-xl border border-red-300 bg-white text-red-600">キー削除</button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          入力欄は空のまま保存するとAPIキーは変更されません。ログには出力しません。
        </p>
      </Section>

      {message && <p className="text-green-600 mt-2">{message}</p>}
      {error && <p className="text-red-600 mt-2">{error}</p>}

      <div className="flex justify-end mt-4">
        <button type="button" disabled={!canSave || saving} onClick={onSave} className="btn-primary disabled:opacity-60">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <section className="border border-gray-200 rounded-xl p-4 mb-4">
      <h2 className="text-sm mt-0 mb-3 text-gray-900 dark:text-gray-100">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-1.5 mb-3">
      <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

// Tailwind utilities are used; no inline style constants required.
