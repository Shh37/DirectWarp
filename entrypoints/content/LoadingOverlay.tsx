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
  startWarpTransition: (onComplete?: () => void) => void;
};

const ACCENT = '#6B818E';
type ThemeMode = 'system' | 'light' | 'dark';

export function createOverlay(initialMsg = 'DirectWarp: 実行中...', options?: { theme?: ThemeMode }): OverlayHandle {
  const root = document.createElement('div');
  root.id = 'directwarp-overlay-root';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: 'rgba(0,0,0,0.25)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSStyleDeclaration);

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: 'rgba(255, 255, 255, 0.9)',
    color: '#111827',
    minWidth: '360px',
    maxWidth: '90vw',
    padding: '24px 28px',
    borderRadius: '16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    fontFamily: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`,
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
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
  style.textContent = `
    @keyframes directwarp-spin { 
      from { transform: rotate(0deg);} 
      to { transform: rotate(360deg);} 
    }
    @keyframes directwarp-warp-cover {
      0% { 
        transform: translateY(100%);
        opacity: 0;
      }
      10% {
        opacity: 1;
      }
      100% { 
        transform: translateY(0%);
        opacity: 1;
      }
    }
  `;

  const text = document.createElement('div');
  text.textContent = initialMsg;
  Object.assign(text.style, {
    fontSize: '16px',
    lineHeight: '1.6',
    fontWeight: '500',
  } as CSSStyleDeclaration);

   // actions container
   const actions = document.createElement('div');
   Object.assign(actions.style, {
     marginTop: '0',
     display: 'flex',
     gap: '8px',
     justifyContent: 'flex-end',
   } as CSSStyleDeclaration);

   const theme: ThemeMode = options?.theme ?? 'system';
   const prefersDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
   const isDark = theme === 'dark' || (theme === 'system' && prefersDark);

   const makeBtn = (label: string) => {
     const btn = document.createElement('button');
     btn.textContent = label;
     Object.assign(btn.style, {
       fontSize: '13px',
       padding: '6px 10px',
       borderRadius: '8px',
       border: `1px solid ${ACCENT}80`,
       background: isDark ? '#1F2937' : 'white',
       color: isDark ? '#E5E7EB' : '#111827',
       cursor: 'pointer',
     } as CSSStyleDeclaration);
     btn.addEventListener('mouseenter', () => {
       btn.style.background = isDark ? 'rgba(255,255,255,0.06)' : `${ACCENT}0D`;
     });
     btn.addEventListener('mouseleave', () => {
       btn.style.background = isDark ? '#1F2937' : 'white';
     });
     return btn;
   };

   const clearActions = () => {
     actions.innerHTML = '';
     actions.style.marginTop = '0';
   };

  row.appendChild(spinner);
  row.appendChild(text);
  card.appendChild(row);
  card.appendChild(actions);
  root.appendChild(style);
  root.appendChild(card);
  document.documentElement.appendChild(root);

  function applyNormal() {
    if (isDark) {
      card.style.background = '#111827';
      (card.style as any).color = '#F3F4F6';
      card.style.border = '';
    } else {
      card.style.background = 'white';
      (card.style as any).color = '#111827';
      card.style.border = '';
    }
  }

  function applyError() {
    if (isDark) {
      card.style.background = '#3F1D1D';
      (card.style as any).color = '#FCA5A5';
      card.style.border = '1px solid #7F1D1D';
    } else {
      card.style.background = '#FEF2F2';
      (card.style as any).color = '#991B1B';
      card.style.border = '1px solid #FCA5A5';
    }
  }

  // 初期表示時にもテーマを反映
  applyNormal();

  return {
    setMessage(msg: string) {
      text.textContent = msg;
      spinner.style.display = 'inline-block';
      applyNormal();
      clearActions();
    },
    setError(msg: string) {
      text.textContent = msg;
      spinner.style.display = 'none';
      applyError();
      clearActions();
    },
    setErrorWithActions(msg, cfg) {
      this.setError(msg);
      clearActions();
      actions.style.marginTop = '12px';
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
    startWarpTransition(onComplete?: () => void) {
      // ワープ用の半透明のぼかし覆いを作成
      const warpCover = document.createElement('div');
      Object.assign(warpCover.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(80px)',
        WebkitBackdropFilter: 'blur(80px)',
        zIndex: '2147483648',
        transform: 'translateY(100%)',
        opacity: '0',
        animation: 'directwarp-warp-cover 0.6s cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
      } as any);
      
      document.documentElement.appendChild(warpCover);
      
      // アニメーション完了後にコールバック実行
      setTimeout(() => {
        if (onComplete) onComplete();
        // 覆いを削除しない（ワープ後に自然に消える）
      }, 600);
    },
  };
}
