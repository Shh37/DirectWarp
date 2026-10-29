import { DeadlineError } from '../deadline';

export interface SearchCandidate { url: string; title?: string; snippet?: string }
export interface SearchContext { deadlineAt: number; signal: AbortSignal }
export interface SearchRequest extends SearchContext { query: string; count: number }
export type SearchFailureKind = 'not_configured' | 'unsupported_provider' | 'invalid_request' | 'authentication' | 'rate_limited' | 'unavailable' | 'network' | 'timeout' | 'cancelled' | 'invalid_response';
export type SearchFailure = { ok: false; error: { kind: SearchFailureKind; message: string } };
export type SearchResult = { ok: true; candidates: SearchCandidate[] } | SearchFailure;
export interface SearchProvider {
  /** 候補をGeminiに送れるかはプロバイダーの固定契約。保存設定から上書きしない。 */
  selectionMode: 'prediction-only' | 'candidate-selection';
  search(request: SearchRequest): Promise<SearchResult>;
}
export type PreparedSearchProvider = { ok: true; provider: SearchProvider } | SearchFailure;

const messages: Record<SearchFailureKind, string> = {
  not_configured: '検索プロバイダーが未設定です。設定画面で利用条件を確認できます。通常検索に戻ります。',
  unsupported_provider: '保存された検索プロバイダーには対応していません。設定画面で選び直してください。通常検索に戻ります。',
  invalid_request: '検索語または候補数が不正です。通常検索に戻ります。',
  authentication: '検索APIの認証または利用権限を確認してください。通常検索に戻ります。',
  rate_limited: '検索APIの利用上限に達しました。通常検索に戻ります。',
  unavailable: '検索サービスを利用できません。通常検索に戻ります。',
  network: '検索APIとの通信に失敗しました。通常検索に戻ります。',
  timeout: '検索処理がタイムアウトしました。通常検索に戻ります。',
  cancelled: '検索処理を中断しました。',
  invalid_response: '検索APIの応答形式が不正です。通常検索に戻ります。',
};

export class SearchProviderError extends Error {
  constructor(readonly kind: SearchFailureKind) { super(messages[kind]); }
}

export function searchFailure(kind: SearchFailureKind): SearchFailure {
  return { ok: false, error: { kind, message: messages[kind] } };
}

// 生の例外・HTTP本文・資格情報を共通契約へ持ち出さない。
export function toSearchFailure(error: unknown, signal: AbortSignal): SearchFailure {
  const reason = signal.aborted ? signal.reason : error;
  if (reason instanceof DeadlineError) return searchFailure('timeout');
  if (signal.aborted || (reason instanceof Error && reason.name === 'AbortError')) return searchFailure('cancelled');
  return searchFailure(reason instanceof SearchProviderError ? reason.kind : 'unavailable');
}
