# TASUKU — 開発仕様書 v2.0

**プロジェクト名：** TASUKU  
**コンセプト：** 知らない街でも、ひとりにしない。  
**フロントエンド：** Ionic + React + TypeScript  
**ネイティブ対応：** Capacitor  
**バックエンド：** Python + FastAPI  
**データベース：** Firebase Cloud Firestore  
**対象環境：** Web / iOS / Android  
**開発目標：** DevFest 2026向けMVP  
**更新日：** 2026年11月5日  
**仕様バージョン：** 2.0

---

# 1. プロジェクト概要

## 1.1 サービス概要

TASUKUは、災害発生時に観光客、外国人、高齢者、障害者などの避難を支援する、災害対応型ナビゲーション・相互支援プラットフォームである。

災害情報、地理情報、避難場所、道路の通行状況、個人の移動能力などを総合的に評価し、その人に適した避難行動や経路を提示する。

また、道案内や通訳などの支援を必要とする人と、安全に協力できる人をマッチングする。

本システムの独自性は、**避難経路の最適化と人的支援のマッチングを連携させること**にある。

## 1.2 解決する課題

- 観光客が土地勘のない場所で避難方法を判断できない。
- 外国人が避難情報を理解できない。
- 移動制約のある人が適切な経路を見つけにくい。
- 支援者と支援希望者が互いの存在を把握できない。
- 被災によって利用できない道路が発生する。
- 地域全体で支援の過不足が生じる。

## 1.3 MVPの位置づけ

初期開発は模擬災害データを使用したプロトタイプとする。

実際の災害時の安全を保証するアプリとしては公開しない。

公式情報の連携、安全性検証、自治体との実証実験などは将来の開発段階で実施する。

---

# 2. 技術スタック

## 2.1 採用技術

| 分類 | 技術 |
|---|---|
| UIフレームワーク | Ionic Framework |
| フロントエンド | React + TypeScript |
| ビルド | Vite |
| ネイティブ実行 | Capacitor |
| ルーティング | Ionic React Router |
| 状態管理 | Zustand |
| サーバー状態管理 | TanStack Query |
| API通信 | Axios |
| 地図 | Google Maps JavaScript API / Capacitor Google Maps |
| 位置情報 | Capacitor Geolocation |
| ユーザー認証 | Firebase Authentication |
| データベース | Cloud Firestore |
| 通知 | Firebase Cloud Messaging |
| バックエンド | Python + FastAPI |
| 最適化処理 | NetworkX / OR-Tools |
| AI | Gemini API |
| バックエンド実行環境 | Google Cloud Run |
| Webホスティング | Firebase Hosting |
| CI/CD | GitHub Actions |

初期段階では、Google Maps JavaScript APIをWeb版の地図表示に採用する。ネイティブ版の地図表示方式は動作検証後に決定する。

Google Mapsの描画と、独自の避難経路計算は別の機能として扱う。

## 2.2 開発方針

- Web版を先行開発する。
- CapacitorによってiOS・Androidに対応する。
- UIとビジネスロジックを分離する。
- 複雑な経路探索処理はバックエンドで実行する。
- APIの仕様はOpenAPIで管理する。
- 将来Flutterへ移行してもバックエンドを再利用できる設計にする。
- デモ環境と将来の本番環境を分離する。

---

# 3. ユーザー定義

## 3.1 ユーザー種別

### 一般利用者

災害情報、避難場所、避難経路を確認する。

### 支援希望者

道案内、通訳、徒歩同行などの支援を依頼する。

### 支援者

対応可能な支援を登録し、支援要請を確認・承諾する。

### 管理者

災害シナリオ、模擬道路規制、避難場所データを管理する。

同一ユーザーが一般利用者・支援希望者・支援者の状態を切り替えられる設計とする。

## 3.2 プロフィール

```typescript
export type MobilityType =
  | "normal"
  | "slow_walk"
  | "wheelchair"
  | "assistance_required";

export type SupportType =
  | "navigation"
  | "translation"
  | "information"
  | "walking_companion";

export interface UserProfile {
  uid: string;
  displayName?: string;
  preferredLanguage: string;
  mobilityType: MobilityType;
  avoidStairs: boolean;
  supportCapabilities: SupportType[];
  isAvailableToHelp: boolean;
  locationSharingEnabled: boolean;
}
```

障害名や詳細な医療情報など、MVPに不要な情報は収集しない。

---

# 4. 機能要件

## 4.1 優先度

- P0：ハッカソンで必須
- P1：時間があれば追加
- P2：将来実装

| ID | 機能 | 優先度 |
|---|---|---|
| F-001 | Firebase認証 | P0 |
| F-002 | プロフィール登録 | P0 |
| F-003 | 地図表示 | P0 |
| F-004 | 現在地取得 | P0 |
| F-005 | 避難先表示 | P0 |
| F-006 | 模擬災害情報表示 | P0 |
| F-007 | 避難経路計算 | P0 |
| F-008 | 移動制約を考慮した経路探索 | P0 |
| F-009 | 道路閉塞を考慮した再計算 | P0 |
| F-010 | 支援要請の作成 | P0 |
| F-011 | 支援者の登録 | P0 |
| F-012 | 支援マッチング | P0 |
| F-013 | マッチング状態同期 | P0 |
| F-014 | Geminiによる多言語案内 | P0 |
| F-015 | 安全な合流地点の探索 | P1 |
| F-016 | 複数人の同時最適化 | P1 |
| F-017 | プッシュ通知 | P1 |
| F-018 | 公式災害情報の自動取得 | P1 |
| F-019 | 避難状況ダッシュボード | P1 |
| F-020 | オフライン地図 | P2 |
| F-021 | バックグラウンド位置共有 | P2 |
| F-022 | 自治体との連携 | P2 |

---

# 5. 画面仕様

## 5.1 画面構成

```text
App
│
├── OnboardingPage
│
├── ProfileSetupPage
│
├── HomePage
│   │
│   ├── MapPage
│   │   ├── ShelterDetailPage
│   │   ├── RouteDetailPage
│   │   └── DisasterInfoPage
│   │
│   ├── SupportRequestPage
│   │   └── MatchingPage
│   │       └── MatchDetailPage
│   │
│   ├── HelperPage
│   │   └── MatchDetailPage
│   │
│   └── SettingsPage
│
└── DemoAdminPage
```

## 5.2 HomePage

メイン画面は地図を中心としたレイアウトにする。

### 表示内容

- 現在地
- 災害情報バナー
- 周辺の避難先
- 避難経路
- ルートの確認時刻
- 支援を求めるボタン
- 支援に協力するボタン

### Ionicコンポーネント

- `IonPage`
- `IonHeader`
- `IonContent`
- `IonButton`
- `IonCard`
- `IonModal`
- `IonAlert`
- `IonToast`
- `IonIcon`

### デザイン方針

地図は画面の主要部分を占める。

災害情報は画面上部、主要アクションは画面下部に配置する。

緊急情報は文字・アイコン・色を併用して表示する。

## 5.3 ProfileSetupPage

### 入力内容

- ニックネーム
- 使用言語
- 移動能力
- 階段の利用可否
- 支援可能な内容

入力項目には `IonInput`、`IonSelect`、`IonCheckbox`、`IonToggle` を使用する。

プロフィールはFirestoreに保存する。

## 5.4 MapPage

### 表示要件

- Google Maps
- 現在地マーカー
- 避難場所マーカー
- 避難経路ポリライン
- 通行禁止区域
- 道路規制情報

### 操作

避難場所マーカーをタップすると詳細を表示する。

「経路を見る」をタップするとFastAPIへ経路計算を要求する。

取得した経路はポリラインで描画する。

## 5.5 SupportRequestPage

### 入力内容

- 必要な支援
- 現在の移動状況
- 言語
- 位置情報共有の同意
- 補足メッセージ

### 動作

1. 支援内容を選択する。
2. 入力内容を確認する。
3. 支援要請を作成する。
4. マッチング候補を探索する。
5. マッチング画面へ遷移する。

緊急救助に該当する場合は、一般支援者のマッチングではなく119番等の緊急通報を優先するよう案内する。

## 5.6 HelperPage

### 表示内容

- 支援可能状態
- 提供可能な支援
- 支援要請
- 自身の避難状況
- マッチング状態

### 操作

支援要請を承諾・拒否できる。

安全上の理由や自身の避難のため、いつでも支援を中止できる。

---

# 6. 経路探索エンジン

## 6.1 実行場所

経路探索はFastAPI側で実行する。

Ionicは経路の入力情報を送信し、計算結果を表示する。

## 6.2 使用アルゴリズム

MVPではDijkstra法またはA*を採用する。

道路ネットワークをグラフとして管理する。

```text
Node
 ├── nodeId
 ├── latitude
 └── longitude

Edge
 ├── edgeId
 ├── fromNode
 ├── toNode
 ├── distance
 ├── travelTime
 ├── slope
 ├── hasStairs
 ├── wheelchairAccessible
 ├── riskLevel
 ├── roadStatus
 ├── source
 └── updatedAt
```

道路の状態は `open`、`restricted`、`closed`、`unknown` とする。

状況が不明な道路を安全な道路と同一視しない。

## 6.3 経路探索処理

```text
現在地取得
    ↓
災害種別の確認
    ↓
避難先候補取得
    ↓
移動能力に基づく制約適用
    ↓
道路規制・災害情報適用
    ↓
経路探索
    ↓
候補の検証
    ↓
Ionicへ返却
    ↓
地図表示
```

災害種別に適合しない避難先は候補から除外する。

経路が見つからない場合も、架空の安全経路を生成しない。

---

# 7. マッチングエンジン

## 7.1 概要

支援希望者と支援者の間で、必要な支援と提供可能な能力を照合する。

単純な直線距離だけではなく、実際の道路上の移動可能性を考慮する。

## 7.2 マッチング条件

- 支援者が支援可能状態である。
- 必要な支援を提供できる。
- 双方の位置情報が利用可能である。
- 通行不可の道路を通らない。
- 支援者自身の避難を著しく妨げない。
- 双方がマッチングに同意する。

必要な情報が不足する場合、マッチング不可または要確認として扱う。

## 7.3 マッチングアルゴリズム

MVPでは候補者を評価し、適切な候補から順にマッチング依頼を送信する。

評価項目：

- 到着までの移動時間
- 支援内容の適合度
- 使用言語の適合度
- 合流可能性
- 支援後の避難可能性

危険な経路や不適合な支援はスコアを下げるだけでなく、候補から除外する。

将来的にはOR-Toolsを用いた同時最適化を実装する。

## 7.4 マッチング状態

```typescript
export type MatchStatus =
  | "waiting"
  | "offered"
  | "accepted"
  | "meeting"
  | "assisting"
  | "completed"
  | "rejected"
  | "cancelled"
  | "expired";
```

承諾処理はバックエンドで行う。

Firestoreのトランザクションなどを利用し、複数の依頼が同一支援者に同時確定することを防ぐ。

---

# 8. Gemini API

## 8.1 利用目的

Geminiは以下の処理に限定して利用する。

1. 災害情報の多言語化
2. やさしい日本語への変換
3. 支援要請文から必要な支援内容を抽出
4. 確定した避難情報の分かりやすい説明

## 8.2 API構成

```text
Ionic
  |
  | HTTPS
  v
FastAPI
  |
  | Gemini API
  v
JSON Response
  |
  v
Ionic画面表示
```

Gemini APIキーはCloud Run側で安全に管理する。

APIキーをブラウザやCapacitorアプリに埋め込まない。

## 8.3 AIの安全要件

Gemini単独で道路の安全性を判断しない。

災害情報の原文や避難指示の意味を変更しない。

不確かな情報が含まれる場合は、推測せず情報不足として扱う。

---

# 9. Firebase設計

## 9.1 使用サービス

### Firebase Authentication

MVPでは匿名認証を基本とする。

将来的にGoogleログインなどを追加可能とする。

匿名認証を使う場合でも、表示名だけで本人確認済みの支援者として扱わない。

### Cloud Firestore

ユーザー、避難先、災害情報、支援要請、マッチング状態を保持する。

### Firebase Cloud Messaging

将来的に支援依頼、マッチング成立、状態更新を通知する。

Web版とネイティブ版では通知権限や設定方法が異なるため、個別に動作検証する。

## 9.2 コレクション構成

```text
users/
  {userId}

private_locations/
  {userId}

disaster_events/
  {eventId}

shelters/
  {shelterId}

road_status/
  {roadId}

support_requests/
  {requestId}

matches/
  {matchId}

simulation_scenarios/
  {scenarioId}
```

### users

ユーザーの基本プロフィール。

### private_locations

本人の位置情報。

一般利用者が他人の正確な位置情報を直接取得できないようにする。

### disaster_events

災害種別、警報、対象地域、出典、発表時刻など。

### shelters

避難場所の位置、対応災害種別、施設区分、開設確認状態など。

### support_requests

必要な支援、要請時刻、要請状態など。

### matches

支援者、支援希望者、マッチング状態、合流地点など。

## 9.3 セキュリティルール

- 自分のプロフィール以外を更新できない。
- 他人の位置情報を無条件に読み取れない。
- マッチング成立処理はサーバー経由とする。
- 一般利用者が公式災害情報を書き換えられない。
- 管理操作には管理者権限を必要とする。
- Firebase ID Tokenをバックエンドで検証する。
- 模擬データと実データを分離する。

位置情報の保持期間は最小限にし、必要がなくなったら削除する。

---

# 10. バックエンドAPI仕様

FastAPIでREST APIを実装する。

ベースパス：

`/api/v1`

| Method | Endpoint | 用途 |
|---|---|---|
| GET | `/health` | ヘルスチェック |
| GET | `/disasters` | 災害情報取得 |
| GET | `/shelters` | 避難先取得 |
| POST | `/routes/calculate` | 避難経路計算 |
| POST | `/support-requests` | 支援要請作成 |
| GET | `/support-requests/me` | 自分の要請取得 |
| POST | `/support-requests/{id}/cancel` | 支援要請取消 |
| POST | `/matches/recommend` | マッチング候補取得 |
| POST | `/matches/{id}/accept` | 支援承諾 |
| POST | `/matches/{id}/reject` | 支援拒否 |
| POST | `/matches/{id}/complete` | 支援完了 |
| POST | `/translations/generate` | 多言語案内生成 |
| GET | `/simulation/scenarios` | デモシナリオ取得 |

## 10.1 経路探索API

### Request

```json
{
  "origin": {
    "latitude": 34.5,
    "longitude": 133.5
  },
  "disasterType": "tsunami",
  "mobilityConstraints": {
    "avoidStairs": true,
    "wheelchair": false,
    "walkingSpeedMetersPerSecond": 0.8
  },
  "scenarioId": "demo_001"
}
```

### Response

```json
{
  "status": "candidate_found",
  "routes": [
    {
      "routeId": "route_001",
      "shelterId": "shelter_001",
      "distanceMeters": 650,
      "estimatedSeconds": 850,
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [133.5, 34.5],
          [133.501, 34.501]
        ]
      },
      "warnings": [
        "一部道路の状況が未確認です"
      ],
      "dataStatus": "simulation"
    }
  ]
}
```

地図表示に使用する座標の順序は、GeoJSONの経度・緯度とGoogle Mapsの緯度・経度の違いに注意して変換する。

---

# 11. フロントエンド構成

## 11.1 ディレクトリ構成

```text
tasuku/
├── apps/
│   └── mobile/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   │
│       │   ├── components/
│       │   │   ├── common/
│       │   │   └── layout/
│       │   │
│       │   ├── pages/
│       │   │   ├── HomePage.tsx
│       │   │   ├── MapPage.tsx
│       │   │   ├── OnboardingPage.tsx
│       │   │   ├── ProfilePage.tsx
│       │   │   ├── RoutePage.tsx
│       │   │   ├── SupportRequestPage.tsx
│       │   │   ├── HelperPage.tsx
│       │   │   ├── MatchingPage.tsx
│       │   │   └── SettingsPage.tsx
│       │   │
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── disaster/
│       │   │   ├── evacuation/
│       │   │   ├── matching/
│       │   │   └── translation/
│       │   │
│       │   ├── services/
│       │   │   ├── api/
│       │   │   ├── firebase/
│       │   │   ├── location/
│       │   │   └── maps/
│       │   │
│       │   ├── stores/
│       │   ├── hooks/
│       │   ├── types/
│       │   ├── theme/
│       │   └── i18n/
│       │
│       ├── public/
│       ├── capacitor.config.ts
│       ├── ionic.config.json
│       └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   │   ├── route_optimizer.py
│   │   │   ├── matching_engine.py
│   │   │   ├── safety_validator.py
│   │   │   └── gemini_service.py
│   │   └── core/
│   ├── tests/
│   └── requirements.txt
│
├── data/
│   └── simulation/
│
├── docs/
│   ├── SPECIFICATION.md
│   ├── API.md
│   └── ARCHITECTURE.md
│
└── README.md
```

## 11.2 責務分離

### pages

画面全体のUIを担当する。

### components

再利用できるUIコンポーネントを管理する。

### features

各機能の状態管理・カスタムフック・操作ロジックを管理する。

### services

Firebase、FastAPI、位置情報、地図SDKとの接続を管理する。

### stores

Zustandによるクライアント状態を管理する。

### types

APIのレスポンスやアプリ内モデルの型を管理する。

API関連の型は可能な限りOpenAPIから生成する。

---

# 12. Ionic固有の実装要件

## 12.1 画面遷移

`IonReactRouter` と `IonRouterOutlet` を使用する。

Ionicのナビゲーション管理に沿ったルーティングを実装する。

## 12.2 GPS取得

Capacitor Geolocationを使用する。

```typescript
import { Geolocation } from "@capacitor/geolocation";

export async function getCurrentLocation() {
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}
```

位置情報の利用目的を事前に説明する。

ユーザーが位置情報を拒否した場合は手動位置指定を提供する。

MVPではアプリが前面にある間の位置取得を基本とする。

## 12.3 Web版対応

Ionicを利用してPWAとしても提供する。

Web版では次の機能を利用できるようにする。

- 地図表示
- 災害情報表示
- 避難場所検索
- 避難経路探索
- 支援要請
- マッチング
- 多言語対応

Web版固有の権限・HTTPS・ブラウザ互換性について検証する。

## 12.4 ネイティブ対応

CapacitorでiOS・Android向けにビルドする。

GPS、通知、地図などのプラグインについて、各OSに必要な設定を行う。

Webで動作しただけではネイティブ版での動作保証とはしない。

---

# 13. UI・UX仕様

## 13.1 デザインコンセプト

**安心感・直感性・視認性**

災害時にも理解しやすく、少ない操作で必要な情報へアクセスできることを優先する。

## 13.2 カラーデザイン

| 用途 | 色 |
|---|---|
| ブランドカラー | `#2563EB` |
| 安全確認済みの状態 | `#16A34A` |
| 注意情報 | `#F59E0B` |
| 危険・通行不可 | `#DC2626` |
| 背景 | `#F8FAFC` |
| テキスト | `#0F172A` |

色だけで危険度を表現しない。

未確認情報を緑色で安全と表示しない。

## 13.3 操作性

- 重要なボタンは大きく配置する。
- 主要操作は原則3タップ以内を目標とする。
- 文字サイズ変更に対応する。
- スクリーンリーダー対応を考慮する。
- 日本語と英語をMVPで対応する。
- 操作ミスを防ぐ確認画面を用意する。

---

# 14. デモモード

MVPでは実際の災害情報ではなく、明示的な模擬データを使用する。

デモの対象地域は1つに絞る。

## シナリオA：観光客の避難

外国人観光客が地震発生後に避難情報を受け取る。

アプリが対応言語で避難先と経路を案内する。

## シナリオB：移動制約

階段を使用できない利用者が避難先を検索する。

移動制約を考慮し、経路候補を提示する。

## シナリオC：支援マッチング

支援希望者が道案内を依頼する。

支援能力・移動時間・安全制約を評価し、条件に適した支援者を推薦する。

## シナリオD：道路閉塞

管理画面から道路を通行不可に変更する。

影響を受ける経路を再計算し、新しい候補を表示する。

すべての画面で、訓練・シミュレーション中であることを明示する。

---

# 15. セキュリティ・安全設計

## 15.1 データ保護

- Firebase Authenticationで認証する。
- Firestore Security Rulesを設定する。
- FastAPIではFirebase ID Tokenを検証する。
- APIキー・秘密情報をフロントエンドへ埋め込まない。
- 位置情報を必要以上に保存しない。
- 支援者と支援希望者に必要な情報だけを開示する。
- 管理者APIを一般利用者へ公開しない。

## 15.2 災害時の安全性

- 公式の災害情報を優先する。
- 対象災害に適した避難先を選ぶ。
- 情報の鮮度・出典を表示する。
- 道路が安全であるとAIに推測させない。
- 支援者自身の避難を優先する。
- 支援が見つかるまで避難を待つよう促さない。
- 本人の同意なくマッチングしない。
- 安全な経路が確認できなければ、不明と表示する。
- 緊急救助が必要な場合は消防・救急などへの通報を優先する。

---

# 16. 開発スケジュール

## Day 1：初期環境・地図

- Ionicプロジェクト作成
- React・TypeScript設定
- Firebase設定
- 画面遷移
- Google Maps表示
- 現在地取得

## Day 2：避難経路

- 避難場所データ
- FastAPI構築
- 道路グラフ作成
- 経路探索API
- 地図への経路表示

## Day 3：支援要請

- ユーザープロフィール
- 支援要請画面
- 支援者画面
- Firestore連携
- リアルタイム状態同期

## Day 4：マッチング

- 候補者抽出
- 安全制約の適用
- マッチング承諾・拒否
- 道路閉塞による経路再計算

## Day 5：Gemini・UI

- Gemini API連携
- 支援内容の解析
- 多言語表示
- UI改善
- モバイル対応確認

## Day 6：デモ・テスト

- シナリオテスト
- セキュリティルール確認
- 不具合修正
- 動作デモ
- 発表資料作成

---

# 17. MVP完成条件

- [ ] IonicアプリがWebブラウザで動作する。
- [ ] Google Mapsが表示できる。
- [ ] 位置情報を取得できる。
- [ ] 避難場所を表示できる。
- [ ] 避難経路を計算できる。
- [ ] 移動制約を考慮できる。
- [ ] 道路閉塞に応じて経路が変化する。
- [ ] 支援要請を登録できる。
- [ ] 支援者を登録できる。
- [ ] 安全制約付きマッチングが動作する。
- [ ] マッチング状態が同期される。
- [ ] Geminiで日本語・英語の案内を表示できる。
- [ ] エラー時に適切なメッセージが表示される。
- [ ] デモ環境であることが明示される。
- [ ] 基本的な操作をスマートフォン画面でも実行できる。

---

# 18. Flutterへの将来移行

本プロジェクトでは、将来Flutterへ移行する可能性を考慮する。

## 再利用する部分

- Firebaseプロジェクト
- Firestoreデータ構造
- FastAPI
- 経路探索アルゴリズム
- マッチングアルゴリズム
- Gemini API連携
- OpenAPI仕様
- デモデータ

## 再実装する部分

- Ionic UI
- Reactコンポーネント
- Zustand状態管理
- Capacitorプラグインの呼び出し
- TypeScript固有の処理

APIファーストの設計により、Flutterへ移行する場合もバックエンドの大部分を維持する。

ただし、Ionicで要件を満たせる場合、Flutterへの移行は必須ではない。

---

# 19. 最終開発方針

TASUKUの中心技術は次の3つである。

1. 災害情報と移動制約を考慮した経路探索
2. 安全条件を考慮した避難支援マッチング
3. Geminiによる言語・情報理解の支援

**Ionicはユーザーとの接点となるフロントエンド、FastAPIは避難判断に必要なデータ処理と最適化を担うバックエンド**として構成する。

ハッカソンでは、すべての機能を同時に実装するよりも、避難経路とマッチングが連携して動く一連のユーザー体験を完成させることを優先する。

将来的には、自治体や防災関係者との検証を経て、実際の避難支援に活用できるシステムを目指す。
