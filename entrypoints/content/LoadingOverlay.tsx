// entrypoints/content/LoadingOverlay.tsx
// Reactに依存しない軽量オーバーレイ。アクセントカラーは #6B818E。

export type OverlayHandle = {
  setMessage: (msg: string) => void;
  setError: (msg: string) => void;
  setErrorWithActions: (
    msg: string,
    actions: {
      primaryLabel: string;
      onPrimary: () => void;
      secondaryLabel?: string;
      onSecondary?: () => void;
    },
  ) => void;
  clearActions: () => void;
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

   // actions container
   const actions = document.createElement('div');
   Object.assign(actions.style, {
     marginTop: '12px',
     display: 'flex',
     gap: '8px',
     justifyContent: 'flex-end',
   } as CSSStyleDeclaration);

   const makeBtn = (label: string) => {
     const btn = document.createElement('button');
     btn.textContent = label;
     Object.assign(btn.style, {
       fontSize: '13px',
       padding: '6px 10px',
       borderRadius: '8px',
       border: `1px solid ${ACCENT}80`,
       background: 'white',
       color: '#111827',
       cursor: 'pointer',
     } as CSSStyleDeclaration);
     btn.addEventListener('mouseenter', () => {
       btn.style.background = `${ACCENT}0D`;
     });
     btn.addEventListener('mouseleave', () => {
       btn.style.background = 'white';
     });
     return btn;
   };

   const clearActions = () => {
     actions.innerHTML = '';
   };

  row.appendChild(spinner);
  row.appendChild(text);
  card.appendChild(row);
  card.appendChild(actions);
  root.appendChild(style);
  root.appendChild(card);
  document.documentElement.appendChild(root);

  return {
    setMessage(msg: string) {
      text.textContent = msg;
      spinner.style.display = 'inline-block';
      card.style.background = 'white';
      (card.style as any).color = '#111827';
      card.style.border = '';
      clearActions();
    },
    setError(msg: string) {
      text.textContent = msg;
      spinner.style.display = 'none';
      card.style.background = '#FEF2F2';
      (card.style as any).color = '#991B1B';
      card.style.border = '1px solid #FCA5A5';
      clearActions();
    },
    setErrorWithActions(msg, cfg) {
      this.setError(msg);
      clearActions();
      const primary = makeBtn(cfg.primaryLabel);
      primary.style.borderColor = ACCENT;
      primary.style.background = ACCENT;
      (primary.style as any).color = 'white';
      primary.onclick = () => cfg.onPrimary();
      actions.appendChild(primary);
      if (cfg.secondaryLabel) {
        const secondary = makeBtn(cfg.secondaryLabel);
        secondary.onclick = () => cfg.onSecondary && cfg.onSecondary();
        actions.appendChild(secondary);
      }
    },
    clearActions() {
      clearActions();
    },
    remove() {
      root.remove();
    },
  };
}
