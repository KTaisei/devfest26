# Windowsでのチーム開発

Windows 10/11のPowerShellで、Macと同じリポジトリ・同じnpmコマンドを使います。WSLやDocker、仮想環境のActivate.ps1、実行ポリシーの変更は不要です。

## 初回だけの準備

次をインストールし、ターミナルを開き直します。

- Git for Windows
- Node.js 22（npmを含む）
- Python 3.14（Pythonの公式インストーラ／Install Manager）
- Java JDK 21以上（Firebaseエミュレータを使う場合。JAVA_HOMEも設定）

PowerShellで確認します。

```powershell
git --version
node --version
npm.cmd --version
py -3.14 --version
java -version
```

`py` がない場合は `python --version` が3.14であれば使えます。`npm.ps1`の実行が拒否される端末では、以下の `npm` を `npm.cmd` に置き換えてください。システム全体の実行ポリシーを緩める必要はありません。

```powershell
git clone https://github.com/KTaisei/devfest26.git
cd devfest26
npm ci
npm run setup:backend
```

セットアップはPython 3.14を探して `backend/.venv` を作り、OS別の依存関係を導入します。Windowsではuvloopを導入せず、Uvicorn標準のイベントループを使います。設定例から `.env` を作りますが、すでにある設定は上書きしません。仮想環境をMacからコピーしないでください。

## 起動と確認

Firebaseを使わないデモは、ルートでターミナルを2つ開きます。

```powershell
# ターミナル1
npm run dev:api
```

```powershell
# ターミナル2
npm run dev
```

[アプリ](http://127.0.0.1:5173) と [API](http://127.0.0.1:8000/docs) が開ければ準備完了です。

Firebaseの認証・保存をローカルで試す場合は、代わりに次を使います。開発用クラウドアカウントがなくても利用できます。

```powershell
npm run dev:firebase
# 停止はCtrl+C。開発環境を停止してから以下のテストを実行
npm run test:firebase
```

起動先・データの保存場所は [FIREBASE_LOCAL.md](FIREBASE_LOCAL.md) を参照してください。強制終了でポートが残った場合は、その開発ターミナルで起動したNode/Python/Javaのプロセスをタスクマネージャーで確認して終了します。他の作業のプロセスは終了しないでください。

共通の確認コマンドです。

```powershell
npm run test:backend
npm run lint:backend
npm run typecheck
npm run build
npm run format:check
# APIを変更した場合
npm run api:export
npm run api:types
```

GitHub ActionsでUbuntuとWindowsの両方に対し、Webビルド・Pythonテスト・Firebase結合テストを実行します。Windowsの実機操作とAndroid実機は別途確認します。iOSのビルドにはMac/Xcodeが必要です。

## 毎回の共同作業

変更前に `git status`、`git fetch origin`、差分確認、`git pull --ff-only` の順で更新します。詳しくは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。改行は `.gitattributes` でLFに統一します。`.env`、`.venv`、匿名利用者データは各自の端末で管理し、共有しません。

チームのFirebaseは `tasuku-77c63` です。実接続の設定は [SETUP.md](SETUP.md) を参照してください。ローカルエミュレータは別の `demo-tasuku` を使います。

参考：[Python venv公式資料](https://docs.python.org/3.14/library/venv.html)。共通コマンドがWindowsの `Scripts/python.exe` とMacの `bin/python` を選びます。
