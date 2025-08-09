import React, { useEffect, useMemo, useState } from 'react';
import { getSettings, setSettings, getApiKey, setApiKey, clearApiKey } from '../../lib/storage';
import { DEFAULT_SETTINGS, ALLOWED_MODELS, type AppSettings, type GeminiModel, type Theme } from '../../lib/settings';
import { validateApiKey, validateCandidateCount, validateModel, validateTheme, validateTimeoutMs, validateTrigger, normalizeSettings } from '../../lib/validator';

type FieldErrors = Partial<Record<'apiKey' | keyof AppSettings, string>>;

export default function SettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [apiKey, setApiKeyState] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [trigger, setTrigger] = useState(DEFAULT_SETTINGS.trigger);
  const [candidateCount, setCandidateCount] = useState<number>(DEFAULT_SETTINGS.candidateCount);
  const [model, setModel] = useState<GeminiModel>(DEFAULT_SETTINGS.model);
  const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_SETTINGS.timeoutMs);
  const [theme, setTheme] = useState<Theme>(DEFAULT_SETTINGS.theme);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, k] = await Promise.all([getSettings(), getApiKey()]);
        setTrigger(s.trigger);
        setCandidateCount(s.candidateCount);
        setModel(s.model);
        setTimeoutMs(s.timeoutMs);
        setTheme(s.theme);
        setApiKeyState(k ?? '');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canSave = useMemo(() => {
    if (loading || saving) return false;
    const v1 = validateTrigger(trigger);
    const v2 = validateCandidateCount(candidateCount);
    const v3 = validateModel(model);
    const v4 = validateTimeoutMs(timeoutMs);
    const v5 = validateTheme(theme);
    const v6 = apiKey ? validateApiKey(apiKey) : { ok: true as const, value: '' };
    const e: FieldErrors = {};
    if (!v1.ok) e.trigger = v1.error;
    if (!v2.ok) e.candidateCount = v2.error;
    if (!v3.ok) e.model = v3.error;
    if (!v4.ok) e.timeoutMs = v4.error;
    if (!v5.ok) e.theme = v5.error;
    if (!v6.ok) e.apiKey = v6.error;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [trigger, candidateCount, model, timeoutMs, theme, apiKey, loading, saving]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      // validate
      const normalized = normalizeSettings({ trigger, candidateCount, model, timeoutMs, theme });
      if (!normalized.ok) {
        setErrors({ general: normalized.error } as any);
        return;
      }
      await Promise.all([
        setSettings(normalized.value),
        apiKey ? setApiKey(apiKey) : clearApiKey(),
      ]);
      setMessage('保存しました。');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minWidth: 320 }}>
      <h2 style={{ marginBottom: 12 }}>DirectWarp 設定</h2>

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) void handleSave();
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>トリガー文字列（先頭一致）</span>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="/d"
            />
            {errors.trigger && <span style={{ color: '#B91C1C' }}>{errors.trigger}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>候補数 N</span>
            <select
              value={String(candidateCount)}
              onChange={(e) => setCandidateCount(Number(e.target.value))}
            >
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {errors.candidateCount && <span style={{ color: '#B91C1C' }}>{errors.candidateCount}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>モデル</span>
            <select value={model} onChange={(e) => setModel(e.target.value as GeminiModel)}>
              {ALLOWED_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {errors.model && <span style={{ color: '#B91C1C' }}>{errors.model}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>タイムアウト (ms)</span>
            <input
              type="number"
              min={1000}
              max={120000}
              step={500}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
            />
            {errors.timeoutMs && <span style={{ color: '#B91C1C' }}>{errors.timeoutMs}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>テーマ</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
            {errors.theme && <span style={{ color: '#B91C1C' }}>{errors.theme}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Gemini APIキー</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder="AIza..."
                style={{ flex: 1 }}
              />
              <button type="button" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隠す' : '表示'}
              </button>
            </div>
            {errors.apiKey && <span style={{ color: '#B91C1C' }}>{errors.apiKey}</span>}
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="submit" disabled={!canSave || saving} style={{ background: '#6B818E', color: 'white', padding: '8px 12px', borderRadius: 8 }}>
              {saving ? '保存中...' : '保存'}
            </button>
            {message && <span>{message}</span>}
          </div>
        </form>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: '#6B7280' }}>
        APIキーは端末ローカルの拡張機能ストレージに保存され、ログや例外に出力されません。
      </p>
    </div>
  );
}
