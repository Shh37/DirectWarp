import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'DirectWarp',
    description:
      'Gemini を用いて検索クエリから最も関連性の高いURLを選定し、検索をスキップして直接ジャンプする拡張機能。',
    permissions: ['storage', 'scripting'],
    host_permissions: [
      'https://www.google.com/*',
      'https://www.bing.com/*',
      'https://generativelanguage.googleapis.com/*',
    ],
    action: {
      default_title: 'DirectWarp',
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
  },
});
