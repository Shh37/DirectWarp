# requirements.md

## アプリ概要
DirectWarp は、Google/Bingの検索結果ページを介さず、検索結果の一番上のURLに直接ジャンプするブラウザ拡張機能である。ユーザーの検索クエリを元に、検索エンジンのトップ検索結果を取得し、検索体験を高速化する。

## ターゲットプラットフォーム
- Chrome
- Firefox

## フレームワーク
- WXT

## 基本方針
1. 検索クエリの先頭に「!d」を付けるとDirectWarpが起動する（デフォルトトリガー）。
2. トリガーの先頭が「!」である必要はない（先頭制約なし）このトリガーは設定画面から変更可能
3. トリガーの後ろの文字列でGoogleまたはBingを検索し、一番上の検索結果のURLにリダイレクトする
4. 使用する検索エンジン（Google/Bing）を選択可能
5. 検索エンジンの設定（デフォルトはGoogle）
6. 設定変更は次回の検索から反映されればよい（リアルタイム反映不要）
7. URLが取得できない場合、ローディング画面にエラーメッセージを表示し、数秒後に検索画面に自動で戻る

## アーキテクチャ構成

```
- manifest.json
- background/
  - background.ts
- content/
  - content.ts
- popup/
  - Popup.tsx
  - ProviderForm.tsx
  - ProviderList.tsx
- options/
  - Options.tsx
  - ThemeSelector.tsx
  - ProviderEditor.tsx
- lib/
  - apiClients/
    - google.ts
    - bing.ts
  - settings.ts
  - validator.ts
  - storage.ts
- styles/
  - tailwind.config.ts
  - globals.css
```

## 機能要件
### 1. 検索クエリの受け取りと処理
- Google/Bing検索ページ上で検索クエリを取得（contentスクリプト）
- バックグラウンドで選択された検索エンジンにリクエストを送信
- 検索結果の一番上のURLを抽出し、自動ジャンプ

### 2. 設定画面
- 使用する検索エンジンの選択（Google/Bing）
- トリガー文字列のカスタマイズ
- ダーク/ライトテーマの切り替え
- 設定のリセット機能

### 3. UI/UX
- ダークモード / ライトモードの切り替え対応
- アクセントカラーは藍鼠（#6B818E）
- モダンな角丸デザイン
- 最小限のUI
  - メニュー（設定、現在のプロバイダ）
  - 保存ボタン（バリデーション結果によってエラー表示）
- ローディングUIあり
  - 応答待機中にスピナー表示
  - 失敗時にはエラーメッセージ表示 + 2秒後に検索画面へ戻る

## 非機能要件
- 設定はローカル保存のみ（クラウドバックアップ不要）
- バックアップ・インポート機能はなし
- 検索クエリ履歴は保存しない

## テーマ・デザイン
- ダーク / ライトテーマ対応
- アクセントカラー：暗めの淡い青（例：#4A90E2）
- Tailwind CSS 使用
- UI構成：シンプル・ミニマル・コンパクト

## 将来的な拡張予定（MVP範囲外）
- 検索対象の言語や地域指定
- 他の検索エンジン対応（Yahoo、DuckDuckGoなど）

## ライセンス・公開
- オープンソース（GitHub）
- Chrome Web Store および Firefox Add-ons に公開予定