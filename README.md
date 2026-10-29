# DirectWarp
DirectWarpは、Google/Bingの検索ページ上でクエリ先頭のトリガーを検知し、Geminiを用いたAI推論のみで最も関連性の高いURLを特定し、そのページへ直接ジャンプするブラウザ拡張機能です。検索結果のスクレイピングには依存しません。

## 🌟 特徴

- カスタマイズ可能なトリガー文字列（デフォルト: `/d`）
- GoogleとBingの検索エンジンに対応
- ダーク/ライトテーマ対応
- 軽量で高速な動作
- オープンソース（MITライセンス）

## 🚀 インストール方法

### 開発モードでインストール

1. リポジトリをクローンします:
   ```bash
   git clone https://github.com/yourusername/DirectWarp.git
   cd DirectWarp
   ```

2. 依存関係をインストールします:
   ```bash
   npm install
   ```

3. 拡張機能をビルドします:
   ```bash
   npm run build
   ```

4. ブラウザに拡張機能を読み込みます:
   - **Chrome**の場合:
     1. `chrome://extensions/` を開く
     2. 右上の「デベロッパーモード」を有効にする
     3. 「パッケージ化されていない拡張機能を読み込む」をクリック
     4. `.output/chrome-mv3` フォルダを選択

   - **Firefox**の場合:
     1. `about:debugging#/runtime/this-firefox` を開く
     2. 「一時的なアドオンを読み込む」をクリック
     3. `.output/firefox-mv2` フォルダ内の `manifest.json` を選択

## 🎮 使い方

1. 検索エンジン（GoogleまたはBing）で検索します
2. 検索クエリの先頭にトリガー文字（デフォルトでは `/d`）を付けます
   - 例: `/d 天気`
3. 検索を実行すると、最も関連性の高い検索結果に自動でリダイレクトされます

## ⚙️ 設定

拡張機能のアイコンをクリックして設定画面を開き、以下の設定をカスタマイズできます:

- **トリガー文字列**: デフォルトは `/d`
- **モデル**: 既定は `gemini-3.5-flash-lite`。`gemini-2.5-flash` は過去に利用したユーザー向けに保持します（下記参照）。
- **候補数 N**: 生成する候補数（例: 1〜5）
- **タイムアウト(ms)**: 推論の待機時間（1,000〜120,000ms）
- **確信度しきい値**: リダイレクトを許可する最小スコア（0.0〜1.0、デフォルト 0.5）
- **テーマ**: システム設定に従う / ライト / ダーク
- **Gemini APIキー**: 背景ページのみに安全に保存（content script には共有されません）

### Gemini モデルと保存済み設定

公式資料の確認日時: **2026年10月29日 18:34 JST**。利用できるモデルIDは `lib/settings.ts` で明示し、`latest` や Preview に自動追従しません。全カタログを許可するのではなく、次の2モデルを対象にします。

| モデル | 用途と利用条件 |
| --- | --- |
| `gemini-3.5-flash-lite` | 新規設定・移行先の既定。公式に安定版でテキスト出力対応、新規プロジェクト向けに案内されています。 |
| `gemini-2.5-flash` | 既存設定を保持。過去に利用したユーザーだけにアクセスが制限されており、新規プロジェクト向けの既定にはしません。2.5 Pro / Flash-Lite は今回の許可対象には追加しません。 |

3.5 Flash-Lite は短いURL選定に用いるモデルとして、公式の低コスト・低遅延向けの位置づけと安定版提供を理由に採用します。Standard の料金は100万トークンあたり入力 **US$0.30**、出力（思考を含む）**US$2.50**。無料枠もありますが、割り当てや実際のアクセス権はプロジェクトに依存します。入力上限は1,048,576、出力上限は65,536トークンです。既存クライアントは `generateContent` に user テキストを送るだけで、非推奨のサンプリング指定や model ターンの事前入力は行っていません。

`gemini-2.0-flash` は2026年6月1日に提供終了。`gemini-2.0-pro` は今回確認した公式カタログに正式IDとして確認できないため許可しません。保存済みモデルが終了済み・不正・未設定の場合は、読込時に既定モデルを適用します。トリガー、候補数、タイムアウト、しきい値、テーマ、各キーはそのまま保持します。有効な保存モデルは変更しません。

読込だけではストレージを書き換えず、設定画面に移行通知を出します。「保存」で選択中のモデルを永続化し、通知を解除します。background が先に読み込んだ場合も通知は失われず、保存前後とも再読込でモデルが変わることはありません。

**実APIによる利用可否・品質・速度は未検証**です。モデルの利用条件と拡張全体の導入可否は別で、検索用APIキーとCXも必要です。この変更ではサービス登録、課金、実API呼び出しを行いません。

根拠: [モデルカタログ](https://ai.google.dev/gemini-api/docs/models)、[3.5 Flash-Lite の仕様](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)、[提供終了・アクセス制限](https://ai.google.dev/gemini-api/docs/deprecations)、[料金](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)、[リリースノート](https://ai.google.dev/gemini-api/docs/changelog)、[移行時のAPI変更](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6)。

## 🛠 開発

### 開発サーバーの起動

```bash
npm run dev
```

### ビルド

```bash
npm run build
```

### 検証

検証環境は Node.js 24.14.0 です。テスト用の Vitest 5 / jsdom 29 に対応する Node.js（24系を推奨）を使用してください。

```bash
npm test
npm run compile
npm run build
npm run build:firefox
```

テストは拡張機能ストレージと外部APIをモックし、設定移行・設定画面での保存・background のモデル選択と失敗応答を検証します。実APIへの通信は行いません。タイムアウトの強制終了自体は Issue #3 の対象です。

### パッケージ化

```bash
npm run zip
```

## 🤝 貢献

バグの報告や機能の要望、プルリクエストは大歓迎です！

## 📄 ライセンス

このプロジェクトは [MITライセンス](LICENSE) の下で公開されています。

## サポートブラウザ
- Google Chrome
- Mozilla Firefox

## フレームワーク
- WXT
