export type GeminiFailureKind = 'invalid_input' | 'authentication' | 'permission' | 'payment' | 'model_unavailable' | 'quota' | 'rate_limited' | 'temporary' | 'http' | 'network' | 'invalid_response' | 'no_candidates' | 'blocked' | 'output_limit' | 'incomplete' | 'no_text' | 'invalid_json' | 'invalid_value' | 'outside_candidates';

const messages: Record<GeminiFailureKind, string> = {
  invalid_input: 'Geminiへの入力または設定が不正です。',
  authentication: 'GeminiのAPIキーを確認してください。',
  permission: 'Geminiの利用権限を確認してください。',
  payment: 'Geminiの利用クレジット・請求状態を確認してください。',
  model_unavailable: 'Geminiの指定モデルを利用できません。',
  quota: 'Geminiの利用枠を確認してください。自動再試行は行いません。',
  rate_limited: 'Geminiの一時的な利用制限に達しました。',
  temporary: 'Geminiで一時的な障害が発生しました。',
  http: 'Geminiへの要求に失敗しました。',
  network: 'Geminiとの通信に失敗しました。',
  invalid_response: 'Geminiの応答形式が不正です。',
  no_candidates: 'Geminiの応答候補が空です。',
  blocked: 'Geminiが入力または回答をブロックしました。',
  output_limit: 'Geminiの出力上限に達しました。',
  incomplete: 'Geminiの回答が正常に完了していません。',
  no_text: 'Geminiの回答テキストが空です。',
  invalid_json: 'Geminiの回答JSONが不正です。',
  invalid_value: 'GeminiのURLまたはconfidenceの型・値が不正です。',
  outside_candidates: 'Geminiの選定URLが検索候補に一致しません。',
};

// 元のレスポンスや例外をcause等にも保持しない。
export class GeminiError extends Error {
  constructor(readonly kind: GeminiFailureKind, readonly status?: number, readonly retryAfterMs?: number) {
    super(`${messages[kind]}${status === undefined ? '' : ` (HTTP ${status})`}`);
    this.name = 'GeminiError';
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function classifyGeminiHttpError(status: number, body: unknown, retryAfter: string | null): GeminiError {
  const permanent: Record<number, GeminiFailureKind> = { 400: 'invalid_input', 401: 'authentication', 402: 'payment', 403: 'permission', 404: 'model_unavailable' };
  if (permanent[status]) return new GeminiError(permanent[status], status);
  const details = record(record(body).error).details;
  const entries = Array.isArray(details) ? details.map(record) : [];
  const retryInfo = entries.find((detail) => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
  const duration = typeof retryInfo?.retryDelay === 'string' && /^\d+(\.\d+)?s$/.test(retryInfo.retryDelay)
    ? Number(retryInfo.retryDelay.slice(0, -1)) * 1000 : undefined;
  const headerDelay = retryAfter === null ? undefined : /^\d+$/.test(retryAfter)
    ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
  const delays = [duration, headerDelay].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const retryAfterMs = delays.length ? Math.max(...delays) : undefined;
  if (status === 429) {
    const quotas = entries.filter((detail) => detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure');
    const violations = quotas.flatMap((detail) => Array.isArray(detail.violations) ? detail.violations.map(record) : [{}]);
    // 未知・日次・ゼロ枠は短期制限と推測しない。本文の自然言語には依存しない。
    const temporaryQuota = violations.length > 0 && violations.every((violation) => {
      const id = [violation.quotaId, violation.quotaMetric].filter((value) => typeof value === 'string').join('').replace(/[^a-z]/gi, '').toLowerCase();
      return !id.includes('perday') && (id.includes('perminute') || id.includes('persecond'))
        && violation.quotaValue !== 0 && violation.quotaValue !== '0';
    });
    const retryable = quotas.length ? temporaryQuota : duration !== undefined && Number.isFinite(duration);
    return new GeminiError(retryable ? 'rate_limited' : 'quota', status, retryable ? retryAfterMs : undefined);
  }
  // 501は機能未対応。恒常的な4xxや不明な状態は再試行しない。
  return new GeminiError(status === 408 || [500, 502, 503, 504].includes(status) ? 'temporary' : 'http', status, retryAfterMs);
}
