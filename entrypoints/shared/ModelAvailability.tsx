import React, { useEffect, useRef, useState } from 'react';
import { API_KEY_KEY } from '../../lib/settings';
import { checkModelAvailability, readModelCheck, modelCheckFailureMessage, type ModelCheck } from '../../lib/modelAvailability';

export default function ModelAvailability({ apiKeyInput }: { apiKeyInput: string }) {
  const [result, setResult] = useState<ModelCheck | null>(null);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    let current = true;
    setResult(null); setSaved(false); setError(''); setChecking(false);
    void readModelCheck(apiKeyInput).then((state) => { if (current) { setSaved(state.saved); setResult(state.result); } }, () => { if (current) setError('保存された確認状態を読み込めませんでした。'); });
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && API_KEY_KEY in changes) { active.current?.abort(); setRevision((value) => value + 1); }
    };
    browser.storage.onChanged.addListener(changed);
    return () => { current = false; active.current?.abort(); browser.storage.onChanged.removeListener(changed); };
  }, [apiKeyInput, revision]);

  async function check() {
    const controller = new AbortController(); active.current?.abort(); active.current = controller;
    setChecking(true); setError('');
    try {
      const next = await checkModelAvailability(apiKeyInput, controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch {
      if (!controller.signal.aborted) { setResult(null); setError('確認できませんでした。保存済みキーと通信状態を確認してください。'); }
    } finally { if (!controller.signal.aborted) setChecking(false); }
  }

  return <section aria-label="モデル一覧の確認" style={{ fontSize: 13, lineHeight: 1.6 }}>
    <button type="button" disabled={!saved || checking} onClick={() => void check()}>{checking ? 'モデル一覧を確認中…' : '保存済みキーでモデル一覧を確認'}</button>
    {!saved && <p>APIキーを保存してから確認してください。未保存のキーでは通信しません。</p>}
    <div aria-live="polite">
      {!result ? <p>モデル一覧は未確認です。</p> : <>
        <p>最終確認: {new Date(result.checkedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST</p>
        {result.ok ? <ul>{result.models.map((entry) => <li key={entry.model}>{entry.model}: {entry.status === 'listed' ? '一覧掲載・generateContent対応' : entry.status === 'not_listed' ? '一覧に掲載なし' : '必要な機能を確認できません'}</li>)}</ul> : <p>{modelCheckFailureMessage(result)}</p>}
      </>}
      {error && <p>{error}</p>}
    </div>
    <p>明示操作でモデル一覧だけを取得します。検索語・候補の送信や生成テストは行いません。掲載は生成成功・割り当て・課金条件を保証しません。失敗しても対応モデル一覧・保存済みモデル・既定値を自動変更しません。</p>
    <p>対応対象は公式資料でテキスト出力・構造化出力・安定版と確認したモデルです。音声・画像・Embedding専用、Previewや未知のモデルを一覧取得だけで追加しません。</p>
    <p>公式資料確認: 2026年10月29日 20:20〜20:21 JST。
      {' '}<a href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noreferrer">公式モデル一覧</a>
      {' / '}<a href="https://ai.google.dev/gemini-api/docs/deprecations" target="_blank" rel="noreferrer">提供終了一覧</a>
    </p>
  </section>;
}
