# TASUKU

**知らない街でも、ひとりにしない。** DevFest 2026向けの、実位置による地図・避難場所・相互支援の試験アプリです。

Ionic + React + TypeScript / Capacitor と Python + FastAPI を分離したモノレポです。通常のマップは実GPS・Googleの実道路・国土地理院の実在する指定緊急避難場所・P2P地震情報を使います。本人がGPSで支援を依頼し、近くの支援者が承諾すると実在する公開合流地点を決め、それぞれの道順と双方の合流確認まで操作できます。

> **訓練・試験版です。** 道路の被災状況・避難場所の開設・入口・階段・車いす対応・緊急地震速報の配信品質は未確認です。実災害で安全に避難できるとは表現しません。従来の架空グラフは `/simulation` 以下の明示された訓練画面へ分離しています。

**公開版： [tasuku-77c63.web.app](https://tasuku-77c63.web.app/home)** — [実データの範囲・操作・出典](docs/REAL_DATA.md) / [公開の運用](docs/DEPLOYMENT.md)

通常のマップには架空の初期現在地はありません。GPSを取得するまで位置を使わず、拒否時も架空地点へ切り替えません。地震は現在地の対象地域で絞り込み、避難先は近い最大3候補の実際の徒歩経路を比較できます。安全性の自動判定、背景受信、プッシュ通知、カメラARは未実装です。

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

[アプリ](http://127.0.0.1:5173)、[APIドキュメント](http://127.0.0.1:8000/docs) を開きます。初期設定の認証はタブごとのローカルデモセッション、保存先はメモリです。通常の実地図にはMapsブラウザキー、実道路にはRoutesの設定とADCが必要です。P2PとGSIにはネットワーク接続が必要です。外部キーなしで試す場合は `/simulation` で架空グラフの模式図を使用できます。再読み込みするとデモの利用者IDが変わります。API再起動でメモリデータとセッションは消えます。

## 架空グラフの訓練機能（実データ機能とは別）

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

## 旧シミュレーションを試す

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

Firebase HostingとCloud Runへ公開しました。公開APIのFirebase認証・Firestore保存・復元・Vertex AI生成を確認済みです。iOS/Android実機は未検証です。今回の新しい実GPS機能も実機未検証です。詳細は [検証記録](docs/TESTING.md) を参照してください。

## MVPの残作業

この実装は仕様v2.0の土台と一連のデモフローです。すべての完成条件を検証済みという意味ではありません。

- 公開環境で2人の支援フローとスマートフォン実機を確認する（地図・AI・保存は公開版でも確認済み）
- Firebase実環境での同時承諾競合・TTL非同期削除の検証と共同開発者のIAM設定（ルール・TTL設定は公開先へ反映済み）
- F-014の支援要請文からの支援内容抽出（現状は選択式）
- 通知、複数候補への自動再依頼
- iOS/Androidプロジェクト追加・権限文言・実機確認
- 実道路・公開避難場所の被災・開設・移動条件への適合検証と、通知・運用基盤
- PWAマニフェストを用意しています。オフライン動作・地図キャッシュ・バックグラウンド処理は未実装です。インストール可否はブラウザで異なります。
- `/simulation` の災害バナーだけは固定訓練情報です。通常マップの地震はP2P地震情報です。津波・洪水の実経路には未対応です。

[仕様書](docs/SPECIFICATION.md) / [構成](docs/ARCHITECTURE.md) / [API](docs/API.md) / [デモ](docs/DEMO.md)
