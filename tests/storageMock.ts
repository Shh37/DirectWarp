import { vi } from 'vitest';

export function mockStorage(initial: Record<string, unknown> = {}) {
  const data = structuredClone(initial);
  const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(data[key]) !== JSON.stringify(value)).map(([key, value]) => [key, { oldValue: data[key], newValue: value }]));
      Object.assign(data, structuredClone(values));
      if (Object.keys(changes).length) listeners.forEach((listener) => listener(changes, 'local'));
    }),
    remove: vi.fn(async (key: string) => {
      const oldValue = data[key]; delete data[key];
      if (oldValue !== undefined) listeners.forEach((listener) => listener({ [key]: { oldValue } }, 'local'));
    }),
  };
  vi.stubGlobal('browser', {
    storage: { local, onChanged: { addListener: vi.fn((listener) => listeners.add(listener)), removeListener: vi.fn((listener) => listeners.delete(listener)) } },
    tabs: { onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
  });
  // A forgotten API mock must fail instead of making a real request.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  return { data, local };
}
