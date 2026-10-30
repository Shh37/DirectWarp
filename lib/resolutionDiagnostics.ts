// Service WorkerのConsoleから明示的に有効化した場合だけ、次の検索1回を診断する。
// 診断用の通信・storage保存は行わず、キー・検索語・候補本文は受け取らない。
export interface ResolutionDiagnostic {
  extensionId: string;
  candidateLimit: number | null;
  candidateUrls: string[];
  prediction: { url: string; confidence: number } | null;
  predictionThreshold: number | null;
  matchedUrl: string | null;
  outcome: 'redirect' | 'fallback';
  error: string | null;
  elapsedMs: number;
}

declare global {
  var directWarpDiagnoseNextSearch: (() => string) | undefined;
}

let armedUntil = 0;

export function installResolutionDiagnostics(): void {
  armedUntil = 0;
  globalThis.directWarpDiagnoseNextSearch = () => {
    armedUntil = Date.now() + 60_000;
    return 'DirectWarp診断を有効にしました。60秒以内に検索を1回実行してください。比較URLをConsoleに表示します。';
  };
}

export function takeResolutionDiagnostic(): ((detail: ResolutionDiagnostic) => void) | undefined {
  const enabled = Date.now() < armedUntil;
  armedUntil = 0;
  if (!enabled) return;
  let reported = false;
  return (detail) => {
    if (reported) return;
    reported = true;
    // Consoleの状態が検索・転送の結果に影響しないようにする。
    try { console.info('DirectWarp診断:', JSON.stringify({ diagnosticVersion: 1, ...detail })); } catch { /* 診断だけを省略 */ }
  };
}
