# Firebaseのローカル開発

Firebaseプロジェクト未作成でも、公式エミュレータで匿名認証・Firestore保存・アクセス制御を検証できます。クラウドへのログインや秘密鍵は不要です。

## 最短の起動

Node.js 22、Python 3.14、Java 21以上が必要です。依存関係を導入済みなら、ルートから次の1コマンドで起動します。

```sh
npm run dev:firebase
```

初回だけFirebase公式エミュレータをダウンロードします。Javaの標準設定が古い場合、このMacではインストール済みHomebrew JDKを自動的に探します。見つからなければ、Java 21以上のJDKをインストールしてJAVA_HOMEを指定してください。システムのJava設定は変更しません。

| サービス                | 接続先                     |
| ----------------------- | -------------------------- |
| アプリ                  | http://127.0.0.1:5174      |
| FastAPI・Swagger        | http://127.0.0.1:8001/docs |
| Authentication emulator | 127.0.0.1:9099             |
| Firestore emulator      | 127.0.0.1:8085             |

画面にエミュレータ利用中の表示が出ます。プロフィールを保存して再読み込みし、同じ内容が復元されることを確認できます。位置情報共有は初期状態でOFFです。

`.env`を変更せず、起動した子プロセスだけにローカル用設定を渡します。従来の `npm run dev`（5173番）と別ポートなので、キー不要のメモリデモとも区別できます。

止めるときは起動したターミナルでCtrl+Cを押します。開発モードでは通常終了時に `.cache/firebase/data/` へエクスポートし、次回起動時に読み込みます。これはGit管理外のローカルデータです。エミュレータが強制終了した場合は保存されないことがあります。

## 自動テスト

開発用エミュレータを停止してから実行します。

```sh
npm run test:firebase
```

公式エミュレータを起動し、4件のSecurity Rulesテストと4件のPython結合テストを実行して終了します。テストでは開発データのインポート・エクスポートを行いません。テスト内部で `demo-tasuku` の模擬データを初期化します。

- 本人プロフィールだけ読めること
- 正確な位置・サーバー内部のclaimが直接読めないこと
- 当事者だけマッチを読めること、クライアントから成立状態を書き換えられないこと
- 一覧取得で他人の依頼・マッチを収集できないこと
- Firebase匿名トークンの検証、偽トークンと模擬認証の拒否
- APIの保存アダプタを作り直してもFirestore内のプロフィールが残ること
- Firestore上で同時承諾が1件だけ成功し、支援完了まで状態が保存されること
- オファーの期限切れ、依頼者claim保持、別候補への再探索と取消

GitHub ActionsでもUbuntu・WindowsとJava 21を使って同じテストを実行します。Firestoreエミュレータはクラウド環境の全機能・制限を再現するものではないので、クラウドの結合確認は別途必要です。

## 設定を個別に使う場合

`backend/.env.emulator.example` と `apps/mobile/.env.emulator.example` に対応する設定例があります。通常は一括起動コマンドを使用してください。エミュレータだけ必要なときは `npm run firebase:start` で起動できます。

バックエンドは `FIREBASE_EMULATOR_MODE=true`、`demo-` で始まるプロジェクトID、ループバック接続先2つを検証してから匿名資格情報を使います。Cloud Runでエミュレータモードを起動しようとすると拒否します。フロントのエミュレータ接続も開発ビルド・ローカルホスト・demoプロジェクトに限定します。

`.firebaserc` の既定プロジェクトは架空の `demo-tasuku` です。チーム用 `team` エイリアスは `tasuku-77c63` です。クラウド用の作業では必ず実際の `--project <project-id>` を明示し、エミュレータ環境変数を外してください。

## 参照

- [Authentication emulator接続](https://firebase.google.com/docs/emulator-suite/connect_auth)
- [Firestore emulator接続](https://firebase.google.com/docs/emulator-suite/connect_firestore)
- [Security Rulesテスト](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
