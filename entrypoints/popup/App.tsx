import React from 'react';

function App() {
  return (
    <div className="min-w-[260px] p-3 text-sm font-sans">
      <header className="flex items-center justify-between mb-2">
        <strong>DirectWarp</strong>
        <span className="text-accent text-[12px]">Gemini</span>
      </header>
      <div className="flex gap-2">
        <button className="btn-primary w-full" onClick={() => browser.runtime.openOptionsPage()}>
          設定を開く
        </button>
      </div>
    </div>
  );
}

export default App;
