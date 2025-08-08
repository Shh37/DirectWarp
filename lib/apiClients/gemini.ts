// lib/apiClients/gemini.ts (background only)
// NOTE: Do not import this from content scripts.

export interface GeminiOptions {
  apiKey: string;
  model: string; // e.g. 'gemini-1.5-flash'
  n: number; // number of candidates the model should consider
  timeoutMs: number;
}

export interface SuggestResult {
  ok: boolean;
  url?: string;
  confidence?: number;
  reason?: string;
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function suggestUrl(query: string, opts: GeminiOptions): Promise<SuggestResult> {
  if (!opts.apiKey) return { ok: false, reason: 'APIキーが未設定です。' };
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const prompt = buildPrompt(query, opts.n);
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt }
              ],
            },
          ],
          generationConfig: { temperature: 0.2, topK: 20, topP: 0.9 },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const text = await safeText(res);
      return { ok: false, reason: `Gemini API エラー: ${res.status} ${res.statusText}${text ? ' - ' + text : ''}` };
    }

    const data = (await res.json()) as any;
    const text = extractText(data);
    const url = extractFirstUrl(text);
    if (!url) return { ok: false, reason: '有効なURLを抽出できませんでした。' };
    return { ok: true, url, confidence: undefined };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, reason: 'Gemini 応答がタイムアウトしました。' };
    return { ok: false, reason: 'Gemini 呼び出しに失敗しました。' };
  } finally {
    clearTimeout(id);
  }
}

function buildPrompt(query: string, n: number): string {
  return `与えられた検索クエリに対して、ユーザが本当に求めているであろう最も適切な1つのURLのみを返してください。\n\n` +
    `要件:\n` +
    `- 出力はURLのみ（追加テキスト不可）。\n` +
    `- 確信度が低い場合は、最も一般的で権威ある入口URLを返してください。\n` +
    `- 候補は最大${n}件まで検討し、最終的に1つだけ選択してください。\n\n` +
    `クエリ: ${query}`;
}

function extractText(data: any): string {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return String(text || '');
}

function extractFirstUrl(text: string): string | undefined {
  const m = text.match(/https?:\/\/\S+/);
  if (!m) return undefined;
  // trim trailing punctuation
  return m[0].replace(/[),.;]*$/, '');
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
