import React, { useEffect, useMemo, useState } from 'react';
import {
  getSettings,
  setSettings,
  getApiKey,
  setApiKey,
  clearApiKey,
  getCustomSearchApiKey,
  setCustomSearchApiKey,
  clearCustomSearchApiKey,
  getCustomSearchCx,
  setCustomSearchCx,
  clearCustomSearchCx,
} from '../../lib/storage';
import { DEFAULT_SETTINGS, ALLOWED_MODELS, type AppSettings, type GeminiModel, type Theme } from '../../lib/settings';
import { validateApiKey, validateCandidateCount, validateModel, validateTheme, validateTimeoutMs, validateTrigger, normalizeSettings, validateConfidenceThreshold } from '../../lib/validator';

type FieldErrors = Partial<Record<'apiKey' | 'csApiKey' | 'csCx' | keyof AppSettings, string>>;

export default function SettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [apiKey, setApiKeyState] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [csApiKey, setCsApiKey] = useState('');
  const [showCsKey, setShowCsKey] = useState(false);
  const [csCx, setCsCx] = useState('');

  const [trigger, setTrigger] = useState(DEFAULT_SETTINGS.trigger);
  const [candidateCount, setCandidateCount] = useState<number>(DEFAULT_SETTINGS.candidateCount);
  const [model, setModel] = useState<GeminiModel>(DEFAULT_SETTINGS.model);
  const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_SETTINGS.timeoutMs);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(DEFAULT_SETTINGS.confidenceThreshold);
  const [theme, setTheme] = useState<Theme>(DEFAULT_SETTINGS.theme);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>('');

  // 入力系コントロールの共通スタイル（色は変更しない）
  const controlStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 14,
    borderRadius: 8,
  };
  // セクション名（ラベル）の左寄せ・やや大きめ
  const titleStyle: React.CSSProperties = {
    textAlign: 'left',
    fontSize: 15,
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, k, csk, cscx] = await Promise.all([
          getSettings(),
          getApiKey(),
          getCustomSearchApiKey(),
          getCustomSearchCx(),
        ]);
        setTrigger(s.trigger);
        setCandidateCount(s.candidateCount);
        setModel(s.model);
        setTimeoutMs(s.timeoutMs);
        setConfidenceThreshold(s.confidenceThreshold);
        setTheme(s.theme);
        setApiKeyState(k ?? '');
        setCsApiKey(csk ?? '');
        setCsCx(cscx ?? '');
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
    const v5 = validateConfidenceThreshold(confidenceThreshold);
    const v6 = validateTheme(theme);
    const v7 = apiKey ? validateApiKey(apiKey) : { ok: true as const, value: '' };
    const v8 = csApiKey ? validateApiKey(csApiKey) : { ok: true as const, value: '' };
    // CX は形式が固定ではないため、入力がある場合は最小限の非空チェックのみ（空/空白はエラー）
    const v9 = (() => {
      if (typeof csCx !== 'string') return { ok: false as const, error: 'CXは文字列である必要があります。' };
      if (!csCx.trim()) return { ok: true as const, value: '' }; // 未入力は許容（使用時にbackground側で検知）
      return { ok: true as const, value: csCx.trim() };
    })();
    const e: FieldErrors = {};
    if (!v1.ok) e.trigger = v1.error;
    if (!v2.ok) e.candidateCount = v2.error;
    if (!v3.ok) e.model = v3.error;
    if (!v4.ok) e.timeoutMs = v4.error;
    if (!v5.ok) e.confidenceThreshold = v5.error as any;
    if (!v6.ok) e.theme = v6.error;
    if (!v7.ok) e.apiKey = v7.error;
    if (!v8.ok) e.csApiKey = v8.error;
    if (!v9.ok) e.csCx = v9.error;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [trigger, candidateCount, model, timeoutMs, confidenceThreshold, theme, apiKey, csApiKey, csCx, loading, saving]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      // validate
      const normalized = normalizeSettings({ trigger, candidateCount, model, timeoutMs, confidenceThreshold, theme });
      if (!normalized.ok) {
        setErrors({ general: normalized.error } as any);
        return;
      }
      await Promise.all([
        setSettings(normalized.value),
        apiKey ? setApiKey(apiKey) : clearApiKey(),
        csApiKey ? setCustomSearchApiKey(csApiKey) : clearCustomSearchApiKey(),
        csCx ? setCustomSearchCx(csCx) : clearCustomSearchCx(),
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
      <h2 style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 20 }}>DirectWarp 設定</h2>

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
            <span style={titleStyle}>トリガー文字列（先頭一致）</span>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="/d"
              style={controlStyle}
            />
            {errors.trigger && <span style={{ color: '#B91C1C' }}>{errors.trigger}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>候補数 N: {candidateCount}</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={candidateCount}
              onChange={(e) => setCandidateCount(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            {errors.candidateCount && <span style={{ color: '#B91C1C' }}>{errors.candidateCount}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>モデル</span>
            <select value={model} onChange={(e) => setModel(e.target.value as GeminiModel)} style={controlStyle}>
              {ALLOWED_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {errors.model && <span style={{ color: '#B91C1C' }}>{errors.model}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>タイムアウト (ms)</span>
            <input
              type="number"
              min={1000}
              max={120000}
              step={500}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              style={controlStyle}
            />
            {errors.timeoutMs && <span style={{ color: '#B91C1C' }}>{errors.timeoutMs}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>確信度しきい値 (0.0 - 1.0)</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              style={controlStyle}
            />
            {errors.confidenceThreshold && <span style={{ color: '#B91C1C' }}>{errors.confidenceThreshold}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>テーマ</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} style={controlStyle}>
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
            {errors.theme && <span style={{ color: '#B91C1C' }}>{errors.theme}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>Gemini APIキー</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder="AIza..."
                style={{ ...controlStyle, flex: 1 }}
              />
              <button type="button" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隠す' : '表示'}
              </button>
            </div>
            {errors.apiKey && <span style={{ color: '#B91C1C' }}>{errors.apiKey}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>Custom Search APIキー</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showCsKey ? 'text' : 'password'}
                value={csApiKey}
                onChange={(e) => setCsApiKey(e.target.value)}
                placeholder="AIza..."
                style={{ ...controlStyle, flex: 1 }}
              />
              <button type="button" onClick={() => setShowCsKey((v) => !v)}>
                {showCsKey ? '隠す' : '表示'}
              </button>
            </div>
            {errors.csApiKey && <span style={{ color: '#B91C1C' }}>{errors.csApiKey}</span>}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={titleStyle}>Custom Search CX（検索エンジンID）</span>
            <input
              value={csCx}
              onChange={(e) => setCsCx(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxx:yyyyyyyyyyy"
              style={controlStyle}
            />
            {errors.csCx && <span style={{ color: '#B91C1C' }}>{errors.csCx}</span>}
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', margin: '12px 0' }}>
            <button
              type="submit"
              disabled={!canSave || saving}
              style={{ background: '#6B818E', color: 'white', padding: '12px 24px', borderRadius: 8, minWidth: 180, fontSize: 15 }}
            >
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
