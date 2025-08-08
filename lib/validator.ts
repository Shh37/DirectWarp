// lib/validator.ts

export function validateTrigger(trigger: string): { ok: true } | { ok: false; reason: string } {
  if (!trigger || typeof trigger !== 'string') return { ok: false, reason: 'トリガーが未設定です。' };
  if (trigger.length > 16) return { ok: false, reason: 'トリガーは16文字以内にしてください。' };
  // Any leading char allowed per requirements
  return { ok: true };
}

export function validateN(n: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(n) || n <= 0 || n > 10) return { ok: false, reason: '候補数は1〜10の整数にしてください。' };
  return { ok: true };
}

export function validateTimeout(ms: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(ms) || ms < 1000 || ms > 60000) return { ok: false, reason: 'タイムアウトは1,000〜60,000msにしてください。' };
  return { ok: true };
}

export function maskKey(key: string, visibleTail = 4): string {
  if (!key) return '';
  const tail = key.slice(-visibleTail);
  return '*'.repeat(Math.max(0, key.length - visibleTail)) + tail;
}
