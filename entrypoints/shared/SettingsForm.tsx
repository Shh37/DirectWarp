import React, { useEffect, useMemo, useState } from 'react';
import {
  getSettingsSnapshot,
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
import { DEFAULT_SETTINGS, ALLOWED_MODELS, MODEL_LABELS, type AppSettings, type GeminiModel, type Theme } from '../../lib/settings';
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
  const [modelMigrated, setModelMigrated] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_SETTINGS.timeoutMs);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(DEFAULT_SETTINGS.confidenceThreshold);
  const [predictionConfidenceThreshold, setPredictionConfidenceThreshold] = useState<number>(DEFAULT_SETTINGS.predictionConfidenceThreshold);
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
        const [snapshot, k, csk, cscx] = await Promise.all([
          getSettingsSnapshot(),
          getApiKey(),
          getCustomSearchApiKey(),
          getCustomSearchCx(),
        ]);
        const s = snapshot.settings;
        setModelMigrated(snapshot.modelMigrated);
        setTrigger(s.trigger);
        setCandidateCount(s.candidateCount);
        setModel(s.model);
        setTimeoutMs(s.timeoutMs);
        setConfidenceThreshold(s.confidenceThreshold);
        setPredictionConfidenceThreshold(s.predictionConfidenceThreshold);
        setTheme(s.theme);
        setApiKeyState(k ?? '');
        setCsApiKey(csk ?? '');
        setCsCx(cscx ?? '');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 保存値（例: 0.85）はスライダーの刻みと一致しない場合もある。
  // form の noValidate と組み合わせ、保存可否は共通バリデーターで判定する。
  const canSave = useMemo(() => {
    if (loading || saving) return false;
    const v1 = validateTrigger(trigger);
    const v2 = validateCandidateCount(candidateCount);
    const v3 = validateModel(model);
    const v4 = validateTimeoutMs(timeoutMs);
    const v5 = validateConfidenceThreshold(confidenceThreshold);
    const v6 = validateConfidenceThreshold(predictionConfidenceThreshold);
    const v7 = validateTheme(theme);
    const v8 = apiKey ? validateApiKey(apiKey) : { ok: true as const, value: '' };
    const v9 = csApiKey ? validateApiKey(csApiKey) : { ok: true as const, value: '' };
    // CX は形式が固定ではないため、入力がある場合は最小限の非空チェックのみ（空/空白はエラー）
    const v10 = (() => {
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
    if (!v6.ok) e.predictionConfidenceThreshold = v6.error as any;
    if (!v7.ok) e.theme = v7.error;
    if (!v8.ok) e.apiKey = v8.error;
    if (!v9.ok) e.csApiKey = v9.error;
    if (!v10.ok) e.csCx = v10.error;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [trigger, candidateCount, model, timeoutMs, confidenceThreshold, predictionConfidenceThreshold, theme, apiKey, csApiKey, csCx, loading, saving]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      // validate
      const normalized = normalizeSettings({ trigger, candidateCount, model, timeoutMs, confidenceThreshold, predictionConfidenceThreshold, theme });
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
      setModelMigrated(false);
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
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) void handleSave();
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <section aria-label="Custom Search の利用条件" style={{ fontSize: 13, lineHeight: 1.6 }}>
            <strong>Custom Search JSON API は既存顧客向けです</strong>
            <p>
              新規顧客の受付は終了しており、既存顧客向けの提供も2027年1月1日に終了します。
              新しいAPIキー・CXを作るだけでは利用できません。既存のキー・CXがあっても利用資格は保証されません。
            </p>
            <p>
              既存顧客の料金は1日100件まで無料、追加はUS$5 / 1,000件、最大1日10,000件です。
              Gemini の料金・割り当ては別途適用されます。
              {' '}<a href="https://developers.google.com/custom-search/v1/overview" target="_blank" rel="noreferrer">公式の提供状況・料金</a>
            </p>
            <p>
              検索エンジンの設定制限として、2026年1月20日以降に作成するエンジンは対象サイト指定（Sites to search）が必要です。
              既存エンジンの全Web検索は2027年1月1日まで継続可能と案内されています。
              これはJSON API自体の提供終了とは別の変更です。
              {' '}<a href="https://programmablesearchengine.googleblog.com/2026/01/updates-to-our-web-search-products.html" target="_blank" rel="noreferrer">公式の検索エンジン変更案内</a>
            </p>
            <p style={{ marginBottom: 0 }}>
              公式資料確認: 2026年10月29日 19:26 JST。この画面では利用資格をAPIで確認しません。
              通常検索はトリガーを付けずに利用できます。
            </p>
          </section>

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
                <option key={m} value={m}>{MODEL_LABELS[m]}</option>
              ))}
            </select>
            {errors.model && <span style={{ color: '#B91C1C' }}>{errors.model}</span>}
          </label>

          {modelMigrated && (
            <p role="status" style={{ margin: 0, fontSize: 13 }}>
              保存済みモデルが未設定またはサポート対象外のため、{DEFAULT_SETTINGS.model} を適用しています。
              検索時にもこの移行が適用されます。「保存」で選択中のモデルを記録します。他の設定やキーは移行では変更しません。
            </p>
          )}
          <p style={{ margin: 0, fontSize: 13 }}>
            新規プロジェクトには gemini-3.5-flash-lite を選んでください。
            gemini-2.5-flash は過去に利用したユーザーにアクセスが制限されています。
            利用可否・割り当てはプロジェクトに依存し、この画面では実APIで確認していません。
          </p>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={titleStyle}>タイムアウト: {timeoutMs / 1000} 秒</span>
              <span style={{ fontSize: 14, color: '#6B7280' }}>{timeoutMs.toLocaleString()} ミリ秒</span>
            </div>
            <input
              type="range"
              min={1000}
              max={30000}
              step={1000}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280' }}>
              <span>1秒</span>
              <span>30秒</span>
            </div>
            {errors.timeoutMs && <span style={{ color: '#B91C1C' }}>{errors.timeoutMs}</span>}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={titleStyle}>確信度しきい値: {(confidenceThreshold * 100).toFixed(0)}%</span>
            </div>
            {confidenceThreshold < 0.5 && (
              <div style={{ fontSize: 12, color: '#B45309', marginTop: -4 }}>
                低い値を設定すると、関連性の低い結果にリダイレクトされる可能性があります
              </div>
            )}
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280' }}>
              <span>10%</span>
              <span>100%</span>
            </div>
            {errors.confidenceThreshold && <span style={{ color: '#B91C1C' }}>{errors.confidenceThreshold}</span>}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={titleStyle}>予測早期リターンしきい値: {(predictionConfidenceThreshold * 100).toFixed(0)}%</span>
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: -4 }}>
              この値以上の確信度で予測結果があれば即時にワープします
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={predictionConfidenceThreshold}
              onChange={(e) => setPredictionConfidenceThreshold(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280' }}>
              <span>10%</span>
              <span>100%</span>
            </div>
            {errors.predictionConfidenceThreshold && <span style={{ color: '#B91C1C' }}>{errors.predictionConfidenceThreshold}</span>}
          </div>

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

          <p aria-live="polite" style={{ margin: 0, fontSize: 13 }}>
            {csApiKey.trim() && csCx.trim()
              ? 'Custom Search: APIキー・CXは入力済みです（利用資格は未確認）。'
              : `Custom Search: ${[!csApiKey.trim() && 'APIキー', !csCx.trim() && 'CX'].filter(Boolean).join('・')}が未設定です。自動転送には両方が必要です。`}
            入力の変更は「保存」で適用します。自動転送できない場合は通常検索へ戻ります。
            探索画面の「キャンセル」でも通常検索を続けられます。
          </p>
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
