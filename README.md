# TASUKU

**知らない街でも、ひとりにしない。** DevFest 2026向けの避難・相互支援シミュレーションです。

Ionic + React + TypeScript / Capacitor と Python + FastAPI を分離したモノレポです。模擬道路グラフによる避難経路と、支援要請→候補探索→承諾→合流→支援→完了の一連の操作ができます。

> 福山駅付近の座標を使っていますが、道路・避難場所・災害情報はすべて架空です。実際の避難判断には使用しないでください。

## 最初の起動

Node.js 22、Python 3.14を使用します。Mac・Windows共通のコマンドです。Windowsの導入方法とPowerShellの注意点は [Windows開発手順](docs/WINDOWS.md) を参照してください。リポジトリのルートで実行してください。依存関係は `package-lock.json` と `backend/requirements.lock.txt` で固定しています。

```sh
# 開発前に必ずチームの更新を取得。未コミット変更があるときは先に確認・保存する。
git status
git fetch origin
git pull --ff-only

npm ci
npm run setup:backend
```

ターミナルを2つ開きます。

```sh
# ターミナル1：リポジトリのルートから
npm run dev:api
```

```sh
# ターミナル2：リポジトリのルートから
npm run dev
```

[アプリ](http://127.0.0.1:5173)、[APIドキュメント](http://127.0.0.1:8000/docs) を開きます。初期設定では外部APIキーは不要です。地図は架空道路の模式図、認証はタブごとのローカルデモセッション、保存先はメモリ、翻訳は日本語・英語の固定文になります。再読み込みするとデモの利用者IDが変わります。API再起動でメモリデータとセッションは消えます。

## 実装済みの操作

- 地図中心のレスポンシブUI、日本語・英語切替、プロフィール登録
- Capacitor GeolocationによるGPS取得、拒否時・対象外エリアでの手動出発点選択
- 災害種別、階段回避、車いす、速度を考慮したNetworkXの経路候補計算
- 通行不可・未確認の道路除外、管理操作による道路変更、5秒ごとの再取得と再計算
- 支援要請の確認・送信・取消、支援者の対応能力と位置共有の登録
- 到着時間、言語、通行可能性、支援後の避難と追加移動時間による候補評価
- 双方の同意に基づく承諾、同じ支援者への同時確定防止、3秒ごとの状態同期
- 5分で未承諾オファーを失効し、別候補を手動で再探索
- Firebase匿名認証・IDトークン検証とFirestore保存の接続実装
- Geminiによる模擬災害情報の日本語・英語案内と、未設定・失敗時の明示的な固定文フォールバック
- OpenAPIと生成TypeScript型、Firestoreルール、GitHub Actions CI、Cloud Run用Dockerfile

## Firebaseを使ったローカル開発

チーム用プロジェクトは `tasuku-77c63` です。クラウドの設定前でも、公式エミュレータで匿名認証・Firestore保存を使用できます。Node/Pythonの依存導入とJava 21以上が必要です。

```sh
npm run dev:firebase   # エミュレータ・API・アプリを一括起動（アプリは5174番）
npm run test:firebase  # 開発環境を停止してから実行：ルール4件＋結合4件
```

クラウドキー不要です。詳しくは [Firebaseローカル開発](docs/FIREBASE_LOCAL.md)、次の作業順は [開発ロードマップ](docs/ROADMAP.md) を参照してください。

## デモを試す

手順は [docs/DEMO.md](docs/DEMO.md) を参照してください。2つのタブで依頼者と支援者を分けて操作できます。第三者の正確な座標はAPIで公開しません。承諾後は、両者に同じ模擬合流地点と移動時間の目安を表示します。

## チーム開発

| ディレクトリ                  | 責務・担当の目安                                           |
| ----------------------------- | ---------------------------------------------------------- |
| `apps/mobile/src/pages/`      | 画面UI、フロントエンド担当                                 |
| `apps/mobile/src/components/` | 共通レイアウト・地図描画                                   |
| `apps/mobile/src/features/`   | API呼び出しとサーバー状態管理                              |
| `apps/mobile/src/services/`   | 認証・API・位置情報など外部接続                            |
| `apps/mobile/src/stores/`     | 端末内の一時状態。座標・トークンをlocalStorageに保存しない |
| `backend/app/api/`            | 入力検証、認証・権限、エンドポイント                       |
| `backend/app/services/`       | 経路・マッチング・翻訳・位置情報保持の業務処理             |
| `backend/app/core/`           | 設定、認証、メモリ／Firestoreの保存境界                    |
| `backend/app/models/`         | API契約の正本となるPydanticモデル                          |
| `data/simulation/`            | チームで共有する模擬シナリオ                               |

開発前の最新取得、ブランチ運用、レビュー基準は [CONTRIBUTING.md](CONTRIBUTING.md) に記載しています。

```sh
# ルートから
npm run typecheck
npm run build
npm run test:backend
npm run format

# APIモデル変更時：生成ファイルを手編集しない
npm run api:export
npm run api:types
```

## 外部サービス・デプロイ

[docs/SETUP.md](docs/SETUP.md) にFirebase、Google Maps、Gemini、Cloud Run、Capacitorの設定をまとめています。秘密鍵・`.env` はコミットしません。FirebaseのWeb設定・Google Mapsのブラウザキーは公開される前提なので、API制限・リファラー制限を設定してください。

Firebaseは実プロジェクトでのAPI認証・プロフィール保存・復元と、ブラウザでの保存・再読み込みまで確認済みです。Google Mapsはローカルで背景地図・架空マーカー・模擬経路の表示を確認済みです。Geminiの実サービス接続、Cloud Runへのデプロイ、iOS/Android実機は未検証です。詳細は [検証記録](docs/TESTING.md) を参照してください。

## MVPの残作業

この実装は仕様v2.0の土台と一連のデモフローです。すべての完成条件を検証済みという意味ではありません。

- Geminiの設定と結合試験へ進む。Google Mapsはローカル表示確認済み（キーは各自のGit管理外 `.env.cloud` に設定）
- Firebase実環境での同時承諾・ルール・TTL検証と共同開発者のIAM設定（基本の認証・保存は確認済み）
- F-014の支援要請文からの支援内容抽出（現状は選択式）
- 通知、複数候補への自動再依頼
- iOS/Androidプロジェクト追加・権限文言・実機確認
- 公式災害情報・実道路グラフ・データの安全性検証
- PWAマニフェストを用意しています。オフライン動作・地図キャッシュ・バックグラウンド処理は未実装です。インストール可否はブラウザで異なります。
- 現在の災害バナーは固定の地震訓練情報です。津波・洪水の選択は経路フィルターのデモです。

[仕様書](docs/SPECIFICATION.md) / [構成](docs/ARCHITECTURE.md) / [API](docs/API.md) / [デモ](docs/DEMO.md)
