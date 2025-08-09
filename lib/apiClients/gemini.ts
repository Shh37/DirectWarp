// lib/apiClients/gemini.ts
// background 専用。content からは直接呼ばないこと。
// Google Generative Language (Gemini) API v1beta を使用。

import { type GeminiModel } from '../settings';

export interface GeminiUrlRequest {
  apiKey: string;
  model: GeminiModel; // MVP: 'gemini-1.5-flash'
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return new Promise<T>((resolve, reject) => {
    p.then(resolve).catch(reject).finally(() => clearTimeout(t));
  });
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

  const fetchPromise = fetch(endpoint, {
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

    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Gemini: URL形式が不正です');
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Gemini: confidenceが0..1の範囲外です');
    }
    return { url, confidence } satisfies GeminiUrlResponse;
  });

  return withTimeout(fetchPromise, req.timeoutMs);
}
