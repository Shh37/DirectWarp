import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'DirectWarp',
    version: '1.0.0',
    permissions: [
      'storage',
      'tabs',
      'scripting',
      'activeTab',
      'webNavigation'
    ],
    host_permissions: [
      'https://www.google.com/*',
      'https://www.google.co.jp/*',
      'https://www.bing.com/*',
      'https://www.bing.co.jp/*'
    ],
    content_scripts: [
      {
        matches: [
          'https://www.google.com/*',
          'https://www.google.co.jp/*',
          'https://www.bing.com/*',
          'https://www.bing.co.jp/*'
        ],
        js: ['content.ts'],
        run_at: 'document_idle'
      }
    ],
    web_accessible_resources: [
      {
        resources: ['*.js', '*.css', '*.png', '*.svg', '*.jpg', '*.jpeg', '*.gif'],
        matches: ['<all_urls>']
      }
    ]
  },
  // 開発サーバー設定
  dev: {
    server: {
      port: 3000
    },
    // ホットリロードを有効化
    reloadCommand: 'reload'
  },
  // ビルド設定
  build: {
    // ソースマップを生成
    sourcemap: true
  }
});
