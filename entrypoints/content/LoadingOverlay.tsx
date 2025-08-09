// entrypoints/content/LoadingOverlay.tsx
// Reactに依存しない軽量オーバーレイ。アクセントカラーは #6B818E。

export type OverlayHandle = {
  setMessage: (msg: string) => void;
  setError: (msg: string) => void;
  remove: () => void;
};

const ACCENT = '#6B818E';

export function createOverlay(initialMsg = 'DirectWarp: 実行中...'): OverlayHandle {
  const root = document.createElement('div');
  root.id = 'directwarp-overlay-root';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSStyleDeclaration);

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: 'white',
    color: '#111827',
    minWidth: '280px',
    maxWidth: '90vw',
    padding: '16px 20px',
    borderRadius: '14px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    fontFamily: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`,
  } as CSSStyleDeclaration);

  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as CSSStyleDeclaration);

  const spinner = document.createElement('div');
  Object.assign(spinner.style, {
    width: '20px',
    height: '20px',
    borderRadius: '9999px',
    border: `2px solid ${ACCENT}33`,
    borderTopColor: ACCENT,
    animation: 'directwarp-spin 1s linear infinite',
  } as CSSStyleDeclaration);

  const style = document.createElement('style');
  style.textContent = `@keyframes directwarp-spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`;

  const text = document.createElement('div');
  text.textContent = initialMsg;
  Object.assign(text.style, {
    fontSize: '14px',
    lineHeight: '1.5',
  } as CSSStyleDeclaration);

  row.appendChild(spinner);
  row.appendChild(text);
  card.appendChild(row);
  root.appendChild(style);
  root.appendChild(card);
  document.documentElement.appendChild(root);

  return {
    setMessage(msg: string) {
      text.textContent = msg;
      spinner.style.display = 'inline-block';
      card.style.background = 'white';
      (card.style as any).color = '#111827';
    },
    setError(msg: string) {
      text.textContent = msg;
      spinner.style.display = 'none';
      card.style.background = '#FEF2F2';
      (card.style as any).color = '#991B1B';
      card.style.border = '1px solid #FCA5A5';
    },
    remove() {
      root.remove();
    },
  };
}
