# API契約

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

## エラー

401：未認証・期限切れ。403：同意または管理権限なし。404：対象なし・第三者の非公開資源。409：状態競合、プロフィール変更不可、位置期限切れ、他の依頼で支援者が確定、道路変更。422：入力不正、ネットワーク範囲外、位置共有の未同意。候補なしは200で空配列です。救助機関への通報を代行するAPIはありません。

## 生成型の更新

```sh
backend/.venv/bin/python scripts/export_openapi.py
npm run api:types
npm run format
npm run typecheck
```

`types/domain.ts` は主要なモデルを生成型から参照し、UI専用のシナリオ・地図モデルを補います。生成結果とOpenAPIをセットでコミットします。
