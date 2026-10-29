// URLの構文と候補所属は別々に検証する。存在確認の通信は行わない。
export function isNavigationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || /[\s\u0000-\u001f\u007f\\]/u.test(value) || /%(?![\da-f]{2})/i.test(value)) return false;
  // URLパーサーによる空のauthorityやバックスラッシュ等の補正を許さない。
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority || authority.includes('@')) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function matchCandidateUrl(value: unknown, candidates: ReadonlyArray<{ url: string }>): string | null {
  if (!isNavigationUrl(value)) return null;
  // query・fragment・port・pathを含む元の候補文字列に完全一致するものだけ。
  // 同等に見える別表記も推測で同一視せず、モデル出力ではなく候補の値を返す。
  return candidates.find((candidate) => candidate.url === value)?.url ?? null;
}
