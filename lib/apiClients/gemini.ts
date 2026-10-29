// background専用。generateContentのREST契約を使用する。
import { type GeminiModel } from '../settings';
import { DeadlineError, withTimeout, type DeadlineOptions } from '../deadline';
import { isNavigationUrl, matchCandidateUrl } from '../navigationUrl';
import { GeminiError, classifyGeminiHttpError, record } from './geminiErrors';

export interface GeminiPredictionRequest extends DeadlineOptions {
  apiKey: string;
  model: GeminiModel;
  query: string;
}
export interface GeminiUrlRequest extends GeminiPredictionRequest { candidateCount: number }
export interface GeminiSelectionRequest extends GeminiPredictionRequest {
  candidates: Array<{ url: string; title?: string; snippet?: string }>;
}
export interface GeminiUrlResponse { url: string; confidence: number }

// 2026-10-29: generateContentのresponseFormat。旧responseMimeType等とは混在させない。
const generationConfig = {
  responseFormat: {
    text: {
      mimeType: 'APPLICATION_JSON',
      schema: {
        type: 'object',
        properties: { url: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 } },
        required: ['url', 'confidence'], additionalProperties: false,
      },
    },
  },
};

function parseResponse(value: unknown): GeminiUrlResponse {
  const response = record(value);
  const blockReason = record(response.promptFeedback).blockReason;
  if (blockReason !== undefined && blockReason !== 'BLOCK_REASON_UNSPECIFIED') throw new GeminiError('blocked');
  if (!Array.isArray(response.candidates) || !response.candidates.length) throw new GeminiError('no_candidates');
  // 別候補への切替・候補間の連結をしない。選択する候補は先頭の1件だけ。
  const candidate = record(response.candidates[0]);
  if (candidate.finishReason === 'MAX_TOKENS') throw new GeminiError('output_limit');
  if (['SAFETY', 'RECITATION', 'LANGUAGE', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION', 'ESCALATION', 'PUP_LIMITED_DISABLED'].includes(String(candidate.finishReason))) throw new GeminiError('blocked');
  if (candidate.finishReason !== 'STOP') throw new GeminiError('incomplete');
  const parts = record(candidate.content).parts;
  if (!Array.isArray(parts)) throw new GeminiError('no_text');
  const text = parts.map(record).filter((part) => part.thought === undefined || part.thought === false)
    .filter((part) => typeof part.text === 'string').map((part) => part.text).join('');
  if (!text.trim()) throw new GeminiError('no_text');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new GeminiError('invalid_json'); }
  const result = record(parsed);
  if (Object.keys(result).length !== 2 || !isNavigationUrl(result.url)
    || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    throw new GeminiError('invalid_value');
  }
  return { url: result.url, confidence: result.confidence };
}

function backoff(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, delay);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function generateUrl(req: GeminiPredictionRequest, prompt: string): Promise<GeminiUrlResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig });
  const deadlineAt = Math.min(req.deadlineAt ?? Infinity, Date.now() + req.timeoutMs);
  try {
    return await withTimeout(async (signal) => {
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        let res: Response;
        try {
          res = await fetch(endpoint, { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        } catch {
          signal.throwIfAborted();
          throw new GeminiError('network');
        }
        signal.throwIfAborted();
        if (res.ok) {
          let json: unknown;
          try { json = await res.json(); } catch { signal.throwIfAborted(); throw new GeminiError('invalid_response'); }
          signal.throwIfAborted();
          return parseResponse(json);
        }
        const text = await res.text().catch(() => '');
        signal.throwIfAborted();
        let json: unknown;
        try { json = JSON.parse(text); } catch { /* 生の本文は保持・表示しない */ }
        const error = classifyGeminiHttpError(res.status, json, res.headers?.get('Retry-After') ?? null);
        if (attempt >= 2 || !['rate_limited', 'temporary'].includes(error.kind)) throw error;
        const delay = Math.max(1000 * 2 ** attempt + Math.floor(Math.random() * 250), error.retryAfterMs ?? 0);
        // 再試行で新しい期限を与えない。待機だけで期限を使い切る場合も打ち切る。
        if (delay >= deadlineAt - Date.now()) throw error;
        await backoff(delay, signal);
      }
    }, { ...req, deadlineAt });
  } catch (error) {
    if (error instanceof DeadlineError || error instanceof GeminiError) throw error;
    if (req.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw new DOMException('処理を中断しました。', 'AbortError');
    throw new GeminiError('invalid_response');
  }
}

const outputInstruction = 'JSONのみで {"url": string, "confidence": number(0..1)} を返してください。URLはhttp/httpsの完全なURLにしてください。';

export function getBestUrl(req: GeminiUrlRequest): Promise<GeminiUrlResponse> {
  return generateUrl(req, [
    'あなたは検索アシスタントです。ユーザーの意図に最も関連性の高い1つのURLを選定してください。',
    `内部的に最大${req.candidateCount}件の候補を想定して比較しても構いませんが、最終出力は1件です。`,
    outputInstruction, `ユーザーのクエリ: ${req.query}`,
  ].join('\n'));
}

export function predictBestUrl(req: GeminiPredictionRequest): Promise<GeminiUrlResponse> {
  return generateUrl(req, [
    'あなたは検索アシスタントです。ユーザーのクエリ意図から最も関連性の高いURLを予測してください。',
    outputInstruction, `ユーザーのクエリ: ${req.query}`,
  ].join('\n'));
}

export async function selectBestUrlFromCandidates(req: GeminiSelectionRequest): Promise<GeminiUrlResponse> {
  const list = req.candidates.map((c, i) => `#${i + 1}: ${c.url}${c.title ? `\nタイトル: ${c.title}` : ''}${c.snippet ? `\n要約: ${c.snippet}` : ''}`).join('\n\n');
  const result = await generateUrl(req, [
    'あなたは検索アシスタントです。以下の候補URL一覧から、ユーザーの意図に最も適合する1件のみを厳密に選んでください。',
    outputInstruction, `ユーザーのクエリ: ${req.query}`, '候補URL一覧:', list || '(候補なし)',
  ].join('\n'));
  const url = matchCandidateUrl(result.url, req.candidates);
  if (!url) throw new GeminiError('outside_candidates');
  return { url, confidence: result.confidence };
}
