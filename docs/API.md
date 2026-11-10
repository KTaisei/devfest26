# API契約

実データ試験の追加APIは `POST /routes/walking-preview`（送信同意・本人プロフィール・Google Routes ADCが必要）、`GET /earthquakes/recent`（気象庁公開情報、EEW未接続）、`POST /matches/{match_id}/route`（参加者限定・模擬合流経路）です。詳細は [REAL_DATA.md](REAL_DATA.md) を参照してください。モデル変更に合わせてOpenAPIとTypeScriptを再生成しています。

正本は `backend/app/models/schemas.py` とルーターから生成する [openapi.json](openapi.json) です。稼働中の `/docs` でも確認できます。ベースパスは `/api/v1`。

## 認証

`Authorization: Bearer <Firebase ID Token>` を送ります。ローカルデモでは `POST /auth/demo` が発行したトークンを使います。任意のUIDをトークンとして受け付けません。デモ管理者発行は `DEMO_MODE=true` のときだけ利用できます。デモモードのまま外部公開しないでください。

## 主なAPI

| Method    | Path                          | 説明                                            |
| --------- | ----------------------------- | ----------------------------------------------- |
| GET       | /health                       | 動作モード・保存先                              |
| POST      | /auth/demo                    | ローカルデモセッション。adminクエリは模擬管理用 |
| GET / PUT | /profile                      | 本人のプロフィール                              |
| PUT       | /location                     | 同意済みの本人位置の更新                        |
| GET       | /disasters                    | 模擬災害情報                                    |
| GET       | /shelters                     | 架空の避難先                                    |
| GET       | /simulation/scenarios         | ノード・道路を含む模擬データ                    |
| PATCH     | /simulation/roads/{id}        | 管理者による道路状態変更                        |
| POST      | /routes/calculate             | 経路候補計算                                    |
| POST      | /support-requests             | 支援要請作成・依頼者の同意                      |
| GET       | /support-requests/me          | 自分の要請のみ                                  |
| POST      | /support-requests/{id}/cancel | 本人の要請取消                                  |
| POST      | /matches/recommend            | 本人の依頼に対する候補探索・1名へのオファー     |
| GET       | /matches/me                   | 本人が参加するマッチのみ                        |
| POST      | /matches/{id}/accept          | オファーを受けた支援者のみ承諾                  |
| POST      | /matches/{id}/reject          | オファーを受けた支援者のみ辞退                  |
| POST      | /matches/{id}/progress        | meeting / assistingへの遷移                     |
| POST      | /matches/{id}/complete        | assistingから完了                               |
| POST      | /matches/{id}/cancel          | 参加者による中止                                |
| POST      | /translations/generate        | 模擬災害情報のja / en翻訳                       |

## 経路計算例

```json
{
  "origin": { "latitude": 34.4884, "longitude": 133.3614 },
  "disasterType": "tsunami",
  "mobilityConstraints": {
    "avoidStairs": true,
    "wheelchair": true,
    "walkingSpeedMetersPerSecond": 0.7
  },
  "scenarioId": "demo_001"
}
```

返却は `candidate_found` または `no_route`。geometryはGeoJSONなので座標は **[経度, 緯度]**、Mapsへの変換では `{lat: 緯度, lng: 経度}` にします。`edgeIds` と `checkedAt` により経路の根拠と計算時刻を確認できます。`dataStatus` は常に `simulation`。

## オファーの期限切れと再探索

新しいマッチには `expiresAt`（ISO日時）が入り、作成から5分を承諾期限とします。旧レコードではnullですが、サーバーは `createdAt` から同じ期限を適用します。期限ちょうど以降の承諾は409です。

本人の `GET /matches/me`、`GET /support-requests/me`、候補探索・状態変更と定期保守で、未承諾オファーを `expired` に確定します。元の要請は `waiting` に戻り、依頼者claimは保持します。`POST /matches/recommend` に同じrequestIdを渡すと未試行の支援者へオファーし、期限切れの相手へ繰り返し送信しません。未試行の候補がなければ200・空配列です。候補探索は利用者の操作で実行し、自動再依頼は行いません。

承諾・取消と失効が重なった場合はトランザクション内の最新状態を使います。承諾済みマッチを期限切れにせず、取り消した依頼を待機中へ戻しません。

## 模擬合流地点

`MatchOutput.meetingPoint` は承諾前・旧データではnullです。承諾後は `nodeId`、任意の `name`、公開ノードの `latitude` / `longitude`、非負の `helperSeconds` / `requesterSeconds` を返します。当事者の正確な現在地は含みません。`GET /matches/me` と各状態変更の応答から同じ値を取得できます。第三者には返しません。

承諾時に道路・災害種別・双方の移動条件・合流後の避難経路を評価し、有効な地点がなければ409です。道路変更後の自動再計算は行わず、利用者は中止・再依頼します。旧レコードのnullは画面でも許容します。

## エラー

401：未認証・期限切れ。403：同意または管理権限なし。404：対象なし・第三者の非公開資源。409：状態競合、プロフィール変更不可、位置期限切れ、他の依頼で支援者が確定、道路変更。422：入力不正、ネットワーク範囲外、位置共有の未同意。候補なしは200で空配列です。救助機関への通報を代行するAPIはありません。

## 生成型の更新

```sh
npm run api:export
npm run api:types
npm run format
npm run typecheck
```

`types/domain.ts` は主要なモデルを生成型から参照し、UI専用のシナリオ・地図モデルを補います。生成結果とOpenAPIをセットでコミットします。
