# チーム開発ガイド

## 毎回、変更前に最新版を確認する

```sh
git status
git fetch origin
git log --oneline HEAD..origin/main
git diff HEAD..origin/main
# 変更がないことを確認してから取り込む。ローカル変更を上書きしない。
git pull --ff-only
git switch -c feat/short-description
```

ブランチ名は `feat/`、`fix/`、`docs/` を目安にします。共有ブランチへのforce pushは行いません。作業中の変更があれば、自分のブランチでコミットするか内容を確認して退避してから取り込みます。競合時は担当者と意図を確認し、単純に片側を採用しないでください。

## 分担の境界

- **フロント**：pages/components/theme。業務判断はAPIに任せ、通信をfeatures/servicesに置く。
- **API・アルゴリズム**：backendのモデルとservices。API変更は先に契約を共有する。
- **データ・Firebase**：模擬グラフ、保存アダプタ、認証・ルール。避難場所や道路の出典を必ず記録する。
- **検証・デモ**：tests、DEMO.md。モバイル・アクセシビリティ・実サービスの検証結果を明記する。

同じファイルを同時編集する前に担当を決めてください。ドメインモデルを変更したらOpenAPIとTS型を再生成し、UI・テスト・API説明も同じPRで更新します。

## コードの書き方

名前で処理の意図を表し、コメントは「なぜその制約が必要か」を書きます。UIに経路判断・権限判定・マッチ成立条件を実装しません。デモの架空データを実データとして表示しません。

TypeScriptはstrict、整形はPrettier。Pythonは型付き入力をPydanticで定義し、整形はRuffを使用します。生成ファイルは手編集しません。秘密情報や実在利用者の位置をログ・fixtureに含めないでください。

```sh
npm run format
backend/.venv/bin/ruff format backend/app backend/tests scripts
npm run build
backend/.venv/bin/python -m pytest -c backend/pytest.ini backend/tests -q
```

## PRとプッシュ

PRには「変えた動作」「理由」「確認方法」「未確認事項」を記載します。経路なし・権限拒否・道路変更・同時承諾など失敗時の動作も確認します。APIのレスポンスを増やすときは個人情報が必要か検討します。

```sh
git add <変更したファイル>
git commit -m "feat: describe the user-visible change"
git fetch origin
# 共有ブランチが更新されていれば内容を読んで取り込む
git push -u origin HEAD
```

CIが通ったことを確認してレビューを依頼します。GitHubのmainを最新に保ち、各自の作業前にも更新を確認してください。
