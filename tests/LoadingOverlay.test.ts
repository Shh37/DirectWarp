// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createOverlay } from '../entrypoints/content/LoadingOverlay';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { expect(vi.getTimerCount()).toBe(0); document.body.innerHTML = ''; vi.useRealTimers(); });

it('removes the pending warp timer and cover when the overlay is removed', async () => {
  const overlay = createOverlay(); const complete = vi.fn();
  overlay.startWarpTransition(complete); overlay.startWarpTransition(complete);
  expect(vi.getTimerCount()).toBe(1);
  overlay.remove(); await vi.advanceTimersByTimeAsync(1000);
  expect(complete).not.toHaveBeenCalled();
  expect(document.querySelector('#directwarp-overlay-root')).toBeNull();
  expect(document.documentElement.querySelector('[style*="directwarp-warp-cover"]')).toBeNull();
});

it('completes a successful transition once', async () => {
  const overlay = createOverlay(); const complete = vi.fn();
  overlay.startWarpTransition(complete); await vi.advanceTimersByTimeAsync(600);
  expect(complete).toHaveBeenCalledOnce(); overlay.remove();
});
