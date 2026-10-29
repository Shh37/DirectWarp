import { vi } from 'vitest';

export function mockStorage(initial: Record<string, unknown> = {}) {
  const data = structuredClone(initial);
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, structuredClone(values));
    }),
    remove: vi.fn(async (key: string) => { delete data[key]; }),
  };
  vi.stubGlobal('browser', {
    storage: { local },
    tabs: { onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
  });
  // A forgotten API mock must fail instead of making a real request.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  return { data, local };
}
