import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';

function Overlay({ message, error }: { message: string; error?: boolean }) {
  useEffect(() => {
    return () => {};
  }, []);
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[2147483647]">
      <div
        className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-xl px-5 py-4 min-w-[280px] max-w-[90vw] shadow-xl border border-accent/35"
        role="status"
        aria-live="polite"
      >
        <div className="flex gap-3 items-center">
          {!error && <div className="w-[18px] h-[18px] border-2 border-accent border-t-transparent rounded-full animate-spin" />}
          <h3 className={error ? 'text-sm text-red-300' : 'text-sm'}>{message}</h3>
        </div>
        {error && <div className="text-xs mt-2 text-gray-500 dark:text-gray-400">2秒後に元の検索ページへ戻ります…</div>}
      </div>
    </div>
  );
}

export type OverlayController = {
  update: (message: string, error?: boolean) => void;
  close: () => void;
};

export function showOverlay(message = 'DirectWarp: 推定中…'): OverlayController {
  const container = document.createElement('div');
  container.id = 'directwarp-overlay-root';
  document.documentElement.appendChild(container);
  const root = ReactDOM.createRoot(container);
  root.render(<Overlay message={message} />);

  return {
    update: (m: string, error?: boolean) => {
      root.render(<Overlay message={m} error={error} />);
    },
    close: () => {
      try { root.unmount(); } catch {}
      container.remove();
    },
  };
}
