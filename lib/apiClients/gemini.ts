// lib/apiClients/gemini.ts
// background 専用。content からは直接呼ばないこと。
// Google Generative Language (Gemini) API v1beta を使用。

import { type GeminiModel } from '../settings';
import { withTimeout, type DeadlineOptions } from '../deadline';
import { isNavigationUrl, matchCandidateUrl } from '../navigationUrl';

export interface GeminiUrlRequest extends DeadlineOptions {
  apiKey: string;
  model: GeminiModel; // lib/settings.ts の明示的な許可モデル
  query: string; // トリガー除去後のクエリ
  candidateCount: number; // 設定のN（内部思考の目安としてプロンプトに含める）
  timeoutMs: number;
}

export interface GeminiUrlResponse {
  url: string;
  confidence: number; // 0.0 - 1.0
}

function buildPrompt(q: string, n: number): string {
  return [
    'あなたは検索アシスタントです。ユーザーの意図を正確に解釈し、',
    'ユーザーのクエリに対して最も関連性の高い1つのURLを選定してください。',
    `内部的に最大${n}件の候補を想定して比較・検討しても構いませんが、最終出力は1件のみです。`,
    '',
    '出力仕様:',
    '- 出力は必ず以下のJSONのみを返すこと。前後に説明文やコードブロックを付けないこと。',
    '- {"url": string, "confidence": number(0..1)}',
    '- confidenceは妥当な実数で、URL選定の確信度を0〜1で表す。',
    '- URLはhttp/httpsの完全なURLであること。',
    '',
    `ユーザーのクエリ: ${q}`,
  ].join('\n');
}

export async function getBestUrl(req: GeminiUrlRequest): Promise<GeminiUrlResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: buildPrompt(req.query, req.candidateCount) }],
      },
    ],
    // 必要に応じて generationConfig を追加可能
  } as const;

  return withTimeout((signal) => fetch(endpoint, {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini API error: ${res.status} ${res.statusText} ${text}`);
    }
    const json = await res.json();
    const candidates = json?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('Gemini: 応答候補が空です');
    }
    // テキスト抽出（最初の候補）
    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts) ? String(parts[0]?.text ?? '') : '';
    if (!text) throw new Error('Gemini: 応答テキストが空です');

    // JSONのみの出力を想定
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // まれにコードブロックで返すなどの逸脱対応: 波括弧部分を抽出して再トライ
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Gemini: JSON解析に失敗しました');
      parsed = JSON.parse(m[0]);
    }

    const url = (parsed as any)?.url;
    const confidence = Number((parsed as any)?.confidence);

    if (!isNavigationUrl(url)) {
      throw new Error('Gemini: URL形式が不正です');
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Gemini: confidenceが0..1の範囲外です');
    }
    return { url, confidence } satisfies GeminiUrlResponse;
  }), req);
}

// --- 予測的なURL推論（候補なしでクエリのみから） ---
export interface GeminiPredictionRequest extends DeadlineOptions {
  apiKey: string;
  model: GeminiModel;
  query: string;
  timeoutMs: number;
}

export async function predictBestUrl(req: GeminiPredictionRequest): Promise<GeminiUrlResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;

  const prompt = [
    'あなたは検索アシスタントです。ユーザーのクエリ意図から最も関連性の高いURLを予測してください。',
    '必ずJSONのみを返し、説明文やコードブロックを含めないこと。',
    '',
    '出力形式:',
    '{"url": string, "confidence": number(0..1)}',
    '',
    `ユーザーのクエリ: ${req.query}`,
  ].join('\n');

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  } as const;

  return withTimeout((signal) => fetch(endpoint, {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini API error: ${res.status} ${res.statusText} ${text}`);
    }
    const json = await res.json();
    const candidates = json?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('Gemini: 応答候補が空です');
    }
    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts) ? String(parts[0]?.text ?? '') : '';
    if (!text) throw new Error('Gemini: 応答テキストが空です');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Gemini: JSON解析に失敗しました');
      parsed = JSON.parse(m[0]);
    }

    const url = (parsed as any)?.url;
    const confidence = Number((parsed as any)?.confidence);
    if (!isNavigationUrl(url)) {
      throw new Error('Gemini: URL形式が不正です');
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Gemini: confidenceが0..1の範囲外です');
    }
    return { url, confidence } as GeminiUrlResponse;
  }), req);
}

// --- 候補URL群から1件選定するインターフェース ---
export interface GeminiSelectionRequest extends DeadlineOptions {
  apiKey: string;
  model: GeminiModel;
  query: string; // 元クエリ（文脈）
  candidates: Array<{ url: string; title?: string; snippet?: string }>; // Custom Search の結果
  timeoutMs: number;
}

export async function selectBestUrlFromCandidates(req: GeminiSelectionRequest): Promise<GeminiUrlResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;

  const list = req.candidates
    .map((c, i) => `#${i + 1}: ${c.url}${c.title ? `\nタイトル: ${c.title}` : ''}${c.snippet ? `\n要約: ${c.snippet}` : ''}`)
    .join('\n\n');

  const prompt = [
    'あなたは検索アシスタントです。以下の候補URL一覧から、ユーザーの意図に最も適合する1件のみを厳密に選んでください。',
    '必ずJSONのみを返し、説明文やコードブロックを含めないこと。',
    '',
    '出力形式:',
    '{"url": string, "confidence": number(0..1)}',
    '',
    `ユーザーのクエリ: ${req.query}`,
    '',
    '候補URL一覧:',
    list || '(候補なし)'
  ].join('\n');

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  } as const;

  return withTimeout((signal) => fetch(endpoint, {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini API error: ${res.status} ${res.statusText} ${text}`);
    }
    const json = await res.json();
    const candidates = json?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('Gemini: 応答候補が空です');
    }
    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts) ? String(parts[0]?.text ?? '') : '';
    if (!text) throw new Error('Gemini: 応答テキストが空です');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Gemini: JSON解析に失敗しました');
      parsed = JSON.parse(m[0]);
    }

    const url = (parsed as any)?.url;
    const confidence = Number((parsed as any)?.confidence);
    if (!isNavigationUrl(url)) {
      throw new Error('Gemini: URL形式が不正です');
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Gemini: confidenceが0..1の範囲外です');
    }
    const candidateUrl = matchCandidateUrl(url, req.candidates);
    if (!candidateUrl) throw new Error('Gemini: 選定URLが検索候補に一致しません');
    return { url: candidateUrl, confidence } as GeminiUrlResponse;
  }), req);
}
