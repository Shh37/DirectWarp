export class DeadlineError extends Error {
  constructor() {
    super('処理がタイムアウトしました。通常検索に戻ります。');
    this.name = 'TimeoutError';
  }
}

export interface DeadlineOptions {
  timeoutMs: number;
  deadlineAt?: number;
  signal?: AbortSignal;
}

// fetch と本文読込を同じ operation に含める。中断を無視するモック/処理でも
// 呼出側は必ず期限で確定し、後からの成功・失敗は Promise.race が回収する。
export async function runWithDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineAt: number,
  parent?: AbortSignal,
): Promise<T> {
  parent?.throwIfAborted();
  if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now()) throw new DeadlineError();
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', forwardAbort, { once: true });
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(new DeadlineError()), deadlineAt - Date.now());
  try {
    const work = Promise.resolve().then(async () => {
      controller.signal.throwIfAborted();
      const result = await operation(controller.signal);
      if (Date.now() >= deadlineAt) controller.abort(new DeadlineError());
      controller.signal.throwIfAborted();
      return result;
    });
    return await Promise.race([work, aborted]);
  } finally {
    clearTimeout(timer);
    // 成功/失敗どちらでも、この処理から派生した未完了の通信を終了する。
    controller.abort();
    parent?.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}

export function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, options: DeadlineOptions): Promise<T> {
  return runWithDeadline(operation, Math.min(options.deadlineAt ?? Infinity, Date.now() + options.timeoutMs), options.signal);
}
