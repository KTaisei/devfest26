# 外部サービスとデプロイ

この文書はチーム用の設定手順です。サービスの作成・課金設定・デプロイは今回実施していません。模擬専用Firebaseプロジェクトを用意してください。

先に [Firebaseローカル開発](FIREBASE_LOCAL.md) で動作確認できます。クラウドプロジェクト作成からの順序は [ROADMAP.md](ROADMAP.md) を参照してください。

## Firebase Authentication / Firestore

クラウドへ接続するときはFIREBASE_EMULATOR_MODEをfalseにし、FIREBASE_AUTH_EMULATOR_HOST、FIRESTORE_EMULATOR_HOST、VITE_FIREBASE_AUTH_EMULATOR_URLを未設定にします。チームのプロジェクトIDは **`tasuku-77c63`** です。`.firebaserc` に `team` エイリアスを登録しています。既定はローカル用の `demo-tasuku` なので、クラウド操作では `--project tasuku-77c63` を明示します。

1. FirebaseでWebアプリを登録し、AuthenticationのAnonymousプロバイダを有効にする。
2. Firestoreを作成し、`firestore.rules` と `firestore.indexes.json` をデプロイする。期限切れ削除用にprivate_locationsのexpiresAt TTLを有効にする。
3. `apps/mobile/.env.cloud.example` を `apps/mobile/.env.cloud` にコピーし、Firebase ConsoleのWeb設定からAPI keyとauth domainを設定する。auth domainの例はConsoleの値と照合する。
4. `backend/.env.cloud.example` を `backend/.env.cloud` にコピーする。チームのproject ID・Firestore・実認証の設定が入っている。
5. ローカルはApplication Default Credentials、Cloud Runでは実行サービスアカウントを使う。サービスアカウントJSONをリポジトリに置かない。
6. 管理者だけFirebaseカスタムクレーム `admin: true` を設定する。クライアントから設定できる仕組みを作らない。

設定ファイルのコピーは、すでにある `.env.cloud` の内容を確認してから行います。PowerShellの例：

```powershell
Copy-Item backend/.env.cloud.example backend/.env.cloud
Copy-Item apps/mobile/.env.cloud.example apps/mobile/.env.cloud
```

Macでは同じパスで `cp` を使います。どちらもコピー後にWeb用のapiKeyを記入してください。プロジェクトIDだけではWeb認証を開始できません。Firebase ConsoleでWebアプリを登録すると設定を取得できます（[公式手順](https://firebase.google.com/docs/web/setup)）。

バックエンドにはGoogle Cloud CLIで各開発者自身のADCを用意します。チーム管理者がプロジェクトへの必要なIAM権限を付与したうえで実行します。

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project tasuku-77c63
npm run dev:api:cloud
# 別ターミナルから
npm run dev:cloud
```

`.env.cloud` はGit管理外です。通常の `npm run dev:api` と `npm run dev` は既存の `.env` を使い、クラウド用コマンドだけが `.env.cloud` を読みます。同じポートを使うため、ローカルデモを停止してから起動します。

Firebase CLIへのログインとADCは別です。秘密鍵ファイルをチームで配布する必要はありません。Web設定・匿名ログイン有効化・Firestore作成・ADCが揃うまでは `npm run dev:firebase` で開発を進めます。この変更ではクラウドへのデプロイやデータ書き込みは実施していません。

設定が揃ったら、ルートから明示的に実プロジェクトを指定して接続確認できます。これはローカルエミュレータのテストと別のコマンドです。

```sh
npm run verify:cloud -- --project tasuku-77c63
```

一時的な匿名アカウントを1つ作り、署名付きトークン検証、APIのプロフィール保存、保存アダプタを作り直した後の復元、未認証・偽トークンの拒否を確認します。位置情報は保存しません。終了時にその検証アカウントと専用プロフィールだけを削除し、コレクション全体の削除は行いません。通信や削除に失敗した場合はエラー終了するので、検証結果と残ったデータを確認してください。CIでは実クラウドへ接続せず、引き続きエミュレータを使用します。

バックエンドがFirestoreへ書き込みます。クライアント側の直接書き込みはルールで拒否します。本人プロフィールと当事者の依頼・マッチ以外は読み取れません。位置は本人も含めて直接読み取り不可です。Admin SDKはルールを迂回するので、サービスアカウントのIAMとAPIの検証が保護境界です。

本実装の状態同期はTanStack Queryで3秒ごとにAPIを確認する方式です。Firestore onSnapshotによる即時同期への移行は可能ですが、未実装です。

## Google Maps

Google CloudでMaps JavaScript APIを有効にし、ブラウザ用APIキーを `VITE_GOOGLE_MAPS_API_KEY` に設定します。キーのAPI制限とHTTPリファラー制限を付け、localhostと実ホストを許可します。これは公開ブラウザキーであり、Gemini等のサーバー用秘密鍵と共有しません。未設定・SDKロード失敗時は模式図を表示します。キーの認証失敗時はMapsの画面側にもエラーが出る場合があります。

## Gemini

チームのクラウド開発ではVertex AIを使用します。`backend/.env.cloud` に以下を設定し、`npm run dev:api:cloud` を再起動します。Mac・Windows共通です。設定例は `backend/.env.cloud.example` を参照してください。

```dotenv
GEMINI_BACKEND=vertex
GEMINI_PROJECT_ID=tasuku-77c63
GEMINI_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash
```

Vertex AI APIの有効化と、対象プロジェクトの請求設定が必要です。ローカルは各開発者のADC（`gcloud auth application-default login`）、Cloud Runは付与されたサービスアカウントを使います。呼び出すアカウントにVertex AIの利用権限（例：`roles/aiplatform.user`）が必要です。権限付与・請求変更は管理者が行います。秘密鍵を共有しないでください。`global` はリージョン固定ではないため、データ所在地の要件がある場合は対応リージョンを別途確認します。

VertexモードではAI Studioの `GEMINI_API_KEY` を渡しません。Cloudの利用料金が適用され、クレジット消費の可否・残高は請求画面で確認します。APIの成功だけではクレジットの適用を証明できません。

AI Studio方式を使う場合は `GEMINI_BACKEND=developer` と `GEMINI_API_KEY` をサーバー側に設定します。こちらは別の請求経路です。キーはフロントに渡しません。未設定の通常デモは固定文を使います。接続先は明示的に選び、Vertex失敗時にAI Studioへ切り替えません。

サーバー所有の模擬原文だけを翻訳し、道路の安全性をAIに判定させません。生成文は「AI翻訳（要確認）」として原文を併記します。原文の意味が完全に保持されることは未保証なので、公開前に人によるレビューが必要です。タイムアウト・権限・残高・モデル等のエラー時は固定文で動作し、providerにtemplate / template_fallbackを返します。支援要請文のAI解析は未実装です。

404の場合はモデル名と利用可能な場所、403はAPI有効化とIAM、429は割当、認証エラーはADCを確認します。モデルは `GEMINI_MODEL` で変更できます。接続設定が不足したVertexモードは起動時に拒否します。

[Google Gen AI SDK](https://github.com/googleapis/python-genai) / [Gemini 3.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash)

## Cloud Run / Firebase Hosting

```sh
# リポジトリのルートがDockerのビルドコンテキスト
 docker build -f backend/Dockerfile -t tasuku-api .
```

コンテナは `$PORT`（デフォルト8080）で起動します。Firebase Hostingのrewriteは `tasuku-api` / `asia-northeast1` を想定しています。実サービス名・リージョンに合わせて `firebase.json` を編集します。`npm run build` の生成物は `apps/mobile/dist` です。

クラウド上では `DEMO_MODE=false`、Firestore保存、Firebase認証を必須とし、CORS_ORIGINSを実際のWebホストに限定します。模擬データ表示は引き続き有効です。自動デプロイは未設定で、GitHub Actionsはビルドとテストのみ実行します。実環境の動作確認・権限・Secret Manager設定を終えてからデプロイしてください。

## Capacitor / iOS / Android

WebビルドとCapacitor設定は用意しています。ネイティブプロジェクトは生成していません。チームで検証するOSとCapacitorメジャーバージョンを揃えてから追加します。

```sh
cd apps/mobile
npm install @capacitor/ios@7 @capacitor/android@7
npx cap add ios
npx cap add android
npm run build
npx cap sync
```

iOSでは位置情報利用説明 `NSLocationWhenInUseUsageDescription`、Androidでは位置情報権限・実行時許可を確認します。ネイティブはViteのAPIプロキシを利用できないため、ビルド前に `VITE_API_BASE_URL` をCloud Run等のHTTPS URLへ設定します。必要に応じて `capacitor://localhost` 等の実際のOriginをサーバー側CORSに追加し、ネイティブ用Mapsキーの制限方式を別途確認します。バックグラウンド共有・通知は含みません。

## 参照した公式資料

- [Ionic React navigation](https://ionicframework.com/docs/react/navigation)
- [Firebase ID Token検証](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firestoreトランザクション](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Google Gen AI Python SDK](https://github.com/googleapis/python-genai)
