# requirements.md

## アプリ概要
DirectWarp は、Gemini を用いて検索クエリから直接、最も関連性の高いURLを選定し、該当ページへ即時ジャンプするブラウザ拡張機能。外部検索エンジン結果のスクレイピングや候補収集に依存せず、AIのみで推定・選定を行う。

## ターゲットプラットフォーム
- Chrome
- Firefox

## フレームワーク
- WXT

## 基本方針
1. 検索クエリの先頭に「/d」を付けるとDirectWarpが起動する（デフォルトトリガー、先頭一致）。
2. トリガー文字列は設定で任意に変更可能（先頭文字の種類に制約なし。例: /d, !d, #go など）。
3. クエリを Gemini に入力し、AIのみで最も関連性の高いURLを選定してリダイレクトする（検索エンジン候補取得は行わない）。
4. 生成候補数N、Geminiモデル（既定: gemini-1.5-flash）、タイムアウト、APIキーは設定画面で指定可能（デフォルト: N=3）。
5. 設定変更は次回の検索から反映（リアルタイム反映不要）。
6. モデルが確信度の低い結果しか返せない/失敗した場合は、ローディングオーバーレイにエラーメッセージを表示し、2秒後に検索エンジン（Google/Bing）の検索ページへトリガーを除いたクエリで戻す（フォールバックで検索結果の取得は行わない）。

## アーキテクチャ構成

```
- manifest.json
- background/
  - background.ts
- content/
  - content.ts
  - LoadingOverlay.tsx
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
    - gemini.ts
  - settings.ts
  - validator.ts
  - storage.ts
- styles/
  - tailwind.config.ts
  - globals.css
```

### 起動経路と権限設計（最小権限）
- 起動経路
  - Google/Bing の検索ページ上で content script（`content.ts`）が検索ボックスのクエリ先頭を監視。
  - トリガー一致時にオーバーレイ（`LoadingOverlay.tsx`）を表示し、background にメッセージ送信。
  - background（`background.ts`）が `lib/apiClients/gemini.ts` を用いて Gemini API を呼び出し、結果URLを content に返す。
  - content は結果に応じてページを遷移（成功: 結果URLへ、失敗: 2秒後にトリガーを除いた検索クエリで元の検索エンジンへ戻す）。
- 権限（Manifest v3 想定）
  - permissions: ["storage", "scripting"]
  - host_permissions: ["https://www.google.com/*", "https://www.bing.com/*", "https://generativelanguage.googleapis.com/*"]
  - 備考: Gemini API 呼び出しは background から行う。クロスオリジンの互換性確保のため Gemini API の明示的な許可を付与（Firefox でも同様）。

## 機能要件
### 1. 検索クエリの受け取りと処理
- Gemini APIにクエリを渡し、AIのみで最も関連性の高いURLを選定・評価
- 最も関連性の高いURLを選定し、自動ジャンプ（確信度不足時は中断/検索画面に戻る）

### 2. 設定画面
- 生成候補数Nの設定（例: 3/5/10）
- タイムアウト（Gemini推論）
- Gemini設定（APIキー、モデル）
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
- ローディングUIあり（オーバーレイ表示）
  - 応答待機中にスピナー表示
  - 失敗時にはエラーメッセージ表示 + 2秒後に、使用した検索エンジン（Google/Bing）の検索ページへ、トリガー文字列を除いたクエリで戻る
 - APIキー入力はマスキング（表示/非表示切替）と貼り付けに対応し、キーはログに出力しない

## 非機能要件
- 設定はローカル保存のみ（クラウドバックアップ不要）
- バックアップ・インポート機能はなし
- 検索クエリ履歴は保存しない
- APIキーはローカル（拡張機能ストレージ）に保存し、外部送信やログ出力を行わない
- 例外やデバッグ出力にもAPIキーを含めない（マスキング）
 - 検索結果の取得やスクレイピングには依存しない。起動検知のために Google/Bing への最小限の host_permissions のみ付与

## テーマ・デザイン
- ダーク / ライトテーマ対応
- アクセントカラー：藍鼠 #6B818E
- Tailwind CSS 使用
- UI構成：シンプル・ミニマル・コンパクト

## 将来的な拡張予定（MVP範囲外）
- 検索対象の言語や地域指定
- 他の検索エンジン対応（Yahoo、DuckDuckGoなど）
- 他LLMプロバイダー対応（Claude/OpenAI など）
 - ハイブリッド方式（検索候補+AI選定）の導入オプション

## ライセンス・公開
- オープンソース（GitHub）
- Chrome Web Store および Firefox Add-ons に公開予定

## セキュリティ・責務分離
- APIキーは background のみで保持し、content には渡さない（ログ・例外・メッセージングにも含めない）。
- `lib/apiClients/gemini.ts` は background 専用（content から直接呼ばない）。

## マルチプロバイダUIとの整合
- MVPでは Gemini のみを有効化。`ProviderList`/`ProviderEditor` は将来拡張用のUIとし、現状は Gemini 固定（追加プロバイダの表示は非表示または無効化）。