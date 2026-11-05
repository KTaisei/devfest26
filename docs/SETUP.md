# 外部サービスとデプロイ

この文書はチーム用の設定手順です。サービスの作成・課金設定・デプロイは今回実施していません。模擬専用Firebaseプロジェクトを用意してください。

先に [Firebaseローカル開発](FIREBASE_LOCAL.md) で動作確認できます。クラウドプロジェクト作成からの順序は [ROADMAP.md](ROADMAP.md) を参照してください。

## Firebase Authentication / Firestore

クラウドへ接続するときはFIREBASE_EMULATOR_MODEをfalseにし、FIREBASE_AUTH_EMULATOR_HOST、FIRESTORE_EMULATOR_HOST、VITE_FIREBASE_AUTH_EMULATOR_URLを未設定にします。`.firebaserc`はローカル専用なので、Firebase CLIには必ず実プロジェクトの `--project <project-id>` を渡します。

1. FirebaseでWebアプリを登録し、AuthenticationのAnonymousプロバイダを有効にする。
2. Firestoreを作成し、`firestore.rules` と `firestore.indexes.json` をデプロイする。期限切れ削除用にprivate_locationsのexpiresAt TTLを有効にする。
3. `apps/mobile/.env` にAPI key、auth domain、project IDを設定する。
4. `backend/.env` に `DEMO_MODE=false`、`STORAGE_BACKEND=firestore`、`FIREBASE_PROJECT_ID=<project>` を設定する。
5. ローカルはApplication Default Credentials、Cloud Runでは実行サービスアカウントを使う。サービスアカウントJSONをリポジトリに置かない。
6. 管理者だけFirebaseカスタムクレーム `admin: true` を設定する。クライアントから設定できる仕組みを作らない。

バックエンドがFirestoreへ書き込みます。クライアント側の直接書き込みはルールで拒否します。本人プロフィールと当事者の依頼・マッチ以外は読み取れません。位置は本人も含めて直接読み取り不可です。Admin SDKはルールを迂回するので、サービスアカウントのIAMとAPIの検証が保護境界です。

本実装の状態同期はTanStack Queryで3秒ごとにAPIを確認する方式です。Firestore onSnapshotによる即時同期への移行は可能ですが、未実装です。

## Google Maps

Google CloudでMaps JavaScript APIを有効にし、ブラウザ用APIキーを `VITE_GOOGLE_MAPS_API_KEY` に設定します。キーのAPI制限とHTTPリファラー制限を付け、localhostと実ホストを許可します。これは公開ブラウザキーであり、Gemini等のサーバー用秘密鍵と共有しません。未設定・SDKロード失敗時は模式図を表示します。キーの認証失敗時はMapsの画面側にもエラーが出る場合があります。

## Gemini

`backend/.env` またはCloud RunのSecret Manager参照で `GEMINI_API_KEY` を設定します。モデルは `GEMINI_MODEL` で変更できます。フロントには渡しません。サーバー所有の模擬原文を翻訳するだけで、道路の安全性をAIに判定させません。生成文は「AI翻訳（要確認）」として原文を併記します。原文の意味が完全に保持されることは未保証なので、公開前に人によるレビューが必要です。

キーなし・タイムアウト・失敗時は固定文で動作し、providerにtemplate / template_fallbackを返します。支援要請文のAI解析は未実装です。

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
