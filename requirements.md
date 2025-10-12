# requirements.md

## アプリ概要
DirectWarp は、Google の Custom Search API で上位 N 件（デフォルト 5、設定で変更可）の候補 URL を取得し、その中から Gemini API を用いて最も関連性の高い 1 件を選定して即時ジャンプするブラウザ拡張機能。スクレイピングは行わず、公式 API（Custom Search API + Gemini）に依存する。

## ターゲットプラットフォーム
- Chrome
- Firefox

## フレームワーク
- WXT

## 基本方針
1. 検索クエリの先頭または最後に「/d」があるとDirectWarpが起動する（デフォルトトリガー）。例: "/d 検索クエリ" または "検索クエリ /d"
2. トリガー文字列は設定で任意に変更可能（先頭または最後に配置可能。先頭文字の種類に制約なし。例: /d, !d, #go など）。
3. Google Custom Search API で上位 N 件の候補 URL を取得し、Gemini で最適な 1 件を選定してリダイレクトする。
4. 候補数 N（Custom Search API の取得件数。デフォルト: N=5）、Gemini モデル（既定: gemini-2.0-flash）、タイムアウト、API キーは設定画面で指定可能。
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
    - customSearch.ts
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
  - background（`background.ts`）が `lib/apiClients/customSearch.ts` で Google Custom Search API を呼び出して上位 N 件の候補 URL を取得し、`lib/apiClients/gemini.ts` を用いて最適な 1 件を選定し、結果URLを content に返す。
  - content は結果に応じてページを遷移（成功: 結果URLへ、失敗: 2秒後にトリガーを除いた検索クエリで元の検索エンジンへ戻す）。
- 権限（Manifest v3 想定）
  - permissions: ["storage", "scripting"]
  - host_permissions: ["https://www.google.com/*", "https://www.bing.com/*", "https://generativelanguage.googleapis.com/*", "https://www.googleapis.com/*"]
  - 備考: Gemini API 呼び出しは background から行う。クロスオリジンの互換性確保のため Gemini API の明示的な許可を付与（Firefox でも同様）。

## 機能要件
### 1. 検索クエリの受け取りと処理
- Google Custom Search API で上位 N 件の候補 URL を取得（N は設定の「候補数 N」に従う。デフォルト 5）
- 候補 URL 群を Gemini API に渡し、最も関連性の高い 1 件を選定
- 選定した URL に自動ジャンプ（確信度不足時は中断/検索画面に戻る）

### 2. 設定画面
- 候補数 N（Custom Search API の取得件数）の設定（例: 3/5/10、デフォルト 5）
- タイムアウト設定
  - 1000ms単位のスライダーで調整可能
  - 範囲: 1000ms 〜 30000ms（30秒）
  - デフォルト: 5000ms（5秒）
  - スライダーのステップ: 1000ms（1秒単位）
  - スライダーの横に現在の値（ミリ秒）を数値表示
- 確信度しきい値
  - 0.1単位のスライダーで調整可能
  - 範囲: 0.1 〜 1.0
  - デフォルト: 0.7
  - スライダーのステップ: 0.1
  - スライダーの横に現在の値をパーセンテージ表示（例: 0.7 → 70%）
  - 値が0.5未満の場合は警告メッセージを表示（「低い値を設定すると、関連性の低い結果にリダイレクトされる可能性があります」）
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
 - スクレイピングは行わない。検索候補の取得は Google Custom Search API を使用し、必要最小限の host_permissions を付与

## テーマ・デザイン
- ダーク / ライトテーマ対応
- アクセントカラー：藍鼠 #6B818E
- 設定画面の色も選択されたテーマに応じて自動的に変更（ダーク/ライト）
- スライダーコントロールのスタイリングはテーマに準拠
  - スライダーのつまみとトラックの色はテーマに応じて調整
  - ホバー時のフィードバックを視覚的に分かりやすく表示
- Tailwind CSS 使用
- UI構成：シンプル・ミニマル・コンパクト

## 将来的な拡張予定（MVP範囲外）
- 検索対象の言語や地域指定
- 他の検索エンジン対応（Yahoo、DuckDuckGoなど）
- 他LLMプロバイダー対応（Claude/OpenAI など）

## ライセンス・公開
- オープンソース（GitHub）
- Chrome Web Store および Firefox Add-ons に公開予定

## セキュリティ・責務分離
- 各 API キー（Gemini / Custom Search など）は background のみで保持し、content には渡さない（ログ・例外・メッセージングにも含めない）。
- `lib/apiClients/gemini.ts` は background 専用（content から直接呼ばない）。

## マルチプロバイダUIとの整合
- MVPでは Gemini のみを有効化。`ProviderList`/`ProviderEditor` は将来拡張用のUIとし、現状は Gemini 固定（追加プロバイダの表示は非表示または無効化）。