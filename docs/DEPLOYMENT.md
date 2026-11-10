# 公開デモの運用

Hostingは `Cache-Control: no-cache` を付与し、再読み込み時に最新ビルドを検証します。以前の公開ページがブラウザに残っている場合は一度再読み込みしてください。ハッシュ付きファイルも再検証する構成で、オフラインキャッシュは提供しません。

公開先は https://tasuku-77c63.web.app です。道路・避難場所・災害情報は架空の訓練用です。実際の避難判断には使用できません。Firebase Hostingから東京リージョンのCloud Run `tasuku-api` へ `/api/**` を転送します。

## 更新の順序（Mac・Windows共通）

リポジトリのルートで実行します。Google Cloud CLI、Node.js 22、Python 3.14を準備し、作業前に `git status`、`git fetch origin`、共有差分の確認と取り込みを行ってください。

1. `npm ci` と `npm run setup:backend` を実行する。
2. `npm run test:backend`、`npm run lint:backend`、`npm run format:check` を実行する。認証・保存の変更時は `npm run test:firebase` も実行する。
3. [SETUP.md](SETUP.md) に従って `apps/mobile/.env.cloud` にFirebase Web設定とMapsブラウザキーを設定する。サーバーの秘密鍵は不要。
4. `npm run build:hosting` を実行する。公開ビルドはAPIを同一オリジンの `/api/v1` に固定し、認証エミュレータ設定を無効にする。`.env.cloud` にあるローカルAPI URLは公開されない。
5. 下記でAPIイメージをビルドし、Cloud Runへ反映する。
6. Firebase Hosting・Firestoreルールを反映し、公開URLで確認する。

```sh
gcloud auth login
gcloud auth application-default login
gcloud meta list-files-for-upload
gcloud builds submit --project=tasuku-77c63 --config=cloudbuild.yaml --service-account=projects/tasuku-77c63/serviceAccounts/tasuku-build@tasuku-77c63.iam.gserviceaccount.com
gcloud run deploy tasuku-api --project=tasuku-77c63 --region=asia-northeast1 --image=asia-northeast1-docker.pkg.dev/tasuku-77c63/tasuku/tasuku-api:demo --service-account=tasuku-api@tasuku-77c63.iam.gserviceaccount.com --env-vars-file=deploy/cloudrun.env.yaml --allow-unauthenticated --min=0 --max=1 --memory=512Mi --cpu=1 --concurrency=20 --timeout=60
npx firebase login
npx firebase deploy --project=tasuku-77c63 --only hosting,firestore:rules,firestore:indexes
```

コマンドは1行ずつ実行します。リリースを識別したい場合はCloud Buildに `--substitutions=_IMAGE=asia-northeast1-docker.pkg.dev/tasuku-77c63/tasuku/tasuku-api:任意のタグ` を追加し、Cloud Runの `--image` にも同じ値を指定します。ロールバックにはCloud Runの以前のリビジョンとFirebase Hostingの以前のリリースをそれぞれ選択してください。

## 初回に作成したクラウド構成

- Artifact Registry: 東京リージョンのDockerリポジトリ `tasuku`。
- `tasuku-api` 実行アカウント: `roles/datastore.user`、`roles/firebaseauth.viewer`、`roles/aiplatform.user`。鍵ファイルは作成しない。
- 実道路試験の追加ではRoutes APIを有効化し、実行アカウントに `roles/serviceusage.serviceUsageConsumer` を追加した。`deploy/cloudrun.env.yaml` の `REAL_ROUTES_ENABLED` と `ROUTES_PROJECT_ID` で接続を明示する。
- `tasuku-build` ビルドアカウント: プロジェクトの `roles/storage.objectViewer` と `roles/logging.logWriter`、`tasuku` リポジトリの `roles/artifactregistry.writer`。実行アカウントとは分ける。
- `.gcloudignore` はアップロード許可リスト。API実行コード・依存固定ファイル・模擬データ・Cloud Build定義だけを含め、`.env`、ADC、テスト、フロントコードを送信しない。
- `private_locations.expiresAt` にFirestore TTLを設定する。TTLは即時削除ではない。Cloud Runはリクエスト処理中以外にCPUが停止することがあり、アプリ内の60秒ごとの削除だけに依存しない。位置は保存後30分で候補評価から除外する。

Cloud Runへの未認証HTTPアクセスはHostingの転送に必要です。利用者のAPIはFirebase IDトークンで検証し、ローカルデモ認証は無効にします。管理操作には管理者クレームが必要です。Vertex AIは実行アカウントで接続し、AI Studioキーを設定しません。

## 公開後の確認

MapsのブラウザキーのHTTPリファラーに `https://tasuku-77c63.web.app/*` と `https://tasuku-77c63.firebaseapp.com/*` を登録し、Maps JavaScript APIの制限を保ってください。Firebase Authenticationの承認済みドメインにも公開ドメインが必要です。

- `/profile` の直接アクセス・保存・再読み込み、`/home` の模擬経路と訓練表示を確認する。
- `/api/v1/health` がメモリ／デモモードを示していないこと、認証なしのプロフィール取得が401になることを確認する。
- 災害案内が生成結果または明示的な固定文として表示されることを確認する。
- 2人デモは別ブラウザ／別プロファイルで [DEMO.md](DEMO.md) を実施する。同じブラウザのタブは匿名ユーザーを共有する。

ADCと両方の `.env.cloud` を設定済みの開発端末では、`npm run verify:cloud -- --project tasuku-77c63 --deployed` で公開APIの認証拒否・プロフィール保存復元・Vertex生成を確認できます。新しい検証専用アカウントだけを作成し、終了時にそのプロフィールとアカウントを削除します。位置は保存しません。既存のコレクションを消去する処理はありません。

さらに `--real-roads` を追加すると、公開地点2点での実道路経路・送信同意拒否・気象庁公開情報を確認します。実GPSは取得しません。詳細は [REAL_DATA.md](REAL_DATA.md) を参照してください。

最大インスタンスは1、最小は0ですが、Firestore・ビルド・保存・Maps・Vertexを含む無料利用を保証しません。ハッカソンクレジットの残額と対象は請求画面で確認してください。全件scanとポーリングを使う小規模デモで、利用者数を増やす前に [ARCHITECTURE.md](ARCHITECTURE.md) の制限を解消します。実端末のGPS・キーボード・iOS/Androidアプリは別途検証が必要です。
