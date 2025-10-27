# 🚬 喫煙所混雑状況 統計システム

郵船ビルディングの喫煙所混雑状況をリアルタイムで監視し、**人数ベース**で日別・時間帯別の統計を記録・可視化するシステムです。

## 🎯 機能

- **リアルタイムAPI監視**: 10秒ごとにAPIから最新の人数を取得
- **人数記録**: 人数とステータスを自動的にデータベースに記録
- **自動ステータス判定**: 人数からステータスを自動判定（0人=空き、1-5人=やや混雑、6人以上=大変混雑）
- **日別統計**: 過去7日間の平均・最大人数を集計
- **時間帯別統計**: 指定した日の時間帯別の平均人数を分析
- **変更履歴**: 最近の人数変化を時系列で表示（最大50件）
- **SSEリアルタイム更新**: Server-Sent Eventsでダッシュボードを自動更新
- **美しいUI**: Chart.js + TailwindCSSによる見やすいダッシュボード

## 📊 統計データ

システムは以下の情報を記録します：

- **人数 (counter)**: 喫煙所内の人数（0〜6人）
- **ステータス**: 空き / やや混雑 / 大変混雑 / 不明
- **タイムスタンプ**: 記録時刻
- **カメラID**: 監視対象の識別子

### ステータス判定ルール

| 人数 | ステータス |
|------|------------|
| 0人 | 🟢 空き |
| 1〜5人 | 🟡 やや混雑 |
| 6人以上 | 🔴 大変混雑 |

## 🚀 セットアップ

### 必要な環境

- Node.js 18以上
- npm または yarn

### インストール手順

1. **依存パッケージのインストール**

```bash
npm install
```

2. **サーバーの起動**

```bash
npm start
```

または開発モード（自動再起動）：

```bash
npm run dev
```

3. **ダッシュボードにアクセス**

ブラウザで以下のURLを開きます：

```
http://localhost:3000
```

## 🔧 技術スタック

### バックエンド
- **Node.js + Express**: RESTful API
- **better-sqlite3**: データベース
- **Server-Sent Events (SSE)**: リアルタイム通知
- **Fetch API**: 外部API監視

### フロントエンド
- **Vanilla JavaScript**: ロジック
- **Chart.js**: グラフ描画
- **TailwindCSS**: スタイリング

## 📁 プロジェクト構造

```
tobacco-stats/
├── server/
│   ├── index.js        # メインサーバー（Express + API + SSE）
│   ├── database.js     # SQLiteデータベース管理
│   ├── api-scraper.js  # API監視ロジック（10秒ごとポーリング）
│   └── scraper.js      # (旧) Playwrightスクレイピング
├── public/
│   ├── index.html      # ダッシュボードUI
│   └── app.js          # フロントエンドロジック（SSEクライアント）
├── package.json
├── .gitignore
├── tobacco_stats.db    # SQLiteデータベースファイル
└── README.md
```

## 🔌 API エンドポイント

### 最新のステータス取得

```
GET /api/status/latest
```

レスポンス例：
```json
{
  "success": true,
  "data": {
    "status": "やや混雑",
    "count": 3,
    "timestamp": 1698400000000,
    "formatted_time": "2024-10-27 13:00:00"
  }
}
```

### 日別統計取得（人数ベース）

```
GET /api/stats/daily?days=7
```

パラメータ：
- `days`: 取得する日数（デフォルト: 7）

レスポンス例：
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-10-27",
      "avg_count": 2.5,
      "max_count": 6,
      "min_count": 0,
      "record_count": 120
    }
  ]
}
```

### 時間帯別統計取得（人数ベース）

```
GET /api/stats/hourly?date=2024-10-27
```

パラメータ：
- `date`: 対象日（YYYY-MM-DD形式）

レスポンス例：
```json
{
  "success": true,
  "date": "2024-10-27",
  "data": [
    {
      "hour": "09",
      "avg_count": 1.2,
      "max_count": 3,
      "min_count": 0,
      "record_count": 36
    }
  ]
}
```

### ステータス変更履歴取得

```
GET /api/status/history?limit=50
```

パラメータ：
- `limit`: 取得する件数（デフォルト: 100）

### レコード数取得

```
GET /api/stats/count
```

### SSE（Server-Sent Events）接続

```
GET /api/events
```

ステータスが変更されたときにリアルタイムで通知を受信します。

イベントフォーマット：
```
data: {"type":"status_change","status":"やや混雑","timestamp":1698400000000}
```

### ヘルスチェック

```
GET /api/health
```

## 🛠️ カスタマイズ

### 監視APIの変更

`server/api-scraper.js` の定数を変更します：

```javascript
const API_URL = 'https://api.example.com/cameras/getLatestData';
const CAMERA_ID = 'your-camera-id';
const POLL_INTERVAL = 10000; // ミリ秒（10秒）
```

### ステータス判定ロジックの調整

`server/api-scraper.js` の `getStatusFromCount()` 関数で、人数からステータスへの変換ルールをカスタマイズできます：

```javascript
function getStatusFromCount(count) {
  if (count === 0) {
    return '空き';
  } else if (count >= 1 && count <= 5) {
    return 'やや混雑';
  } else if (count >= 6) {
    return '大変混雑';
  }
  return '不明';
}
```

### 監視間隔の変更

`server/api-scraper.js` の `POLL_INTERVAL` を変更します（ミリ秒単位）：

```javascript
const POLL_INTERVAL = 30000; // 30秒ごとに変更
```

## 📈 データベース

SQLiteを使用してデータを永続化します。データベースファイルは `tobacco_stats.db` として保存されます。

### テーブル構造

**status_records**

| カラム | 型 | 説明 |
|--------|---------|------|
| id | INTEGER | 主キー（自動採番） |
| camera_id | TEXT | カメラ識別子 |
| status | TEXT | ステータス（空き/やや混雑/大変混雑） |
| count | INTEGER | 人数（0〜6人） |
| timestamp | INTEGER | タイムスタンプ（ミリ秒） |
| created_at | DATETIME | 作成日時 |

## 🎨 UI の特徴

- **レスポンシブデザイン**: モバイル・タブレット・デスクトップ対応
- **リアルタイム更新**: SSEでステータス変更時に自動更新
- **人数を大きく表示**: 現在の人数を目立つように表示
- **インタラクティブなグラフ**: Chart.jsによる美しい可視化
  - 日別グラフ: 平均人数（線）+ 最大人数（棒）
  - 時間帯別グラフ: 平均人数の推移（線）
- **色分け表示**: ステータスごとに直感的な色分け
  - 🟢 空き: 緑色
  - 🟡 やや混雑: オレンジ色
  - 🔴 大変混雑: 濃い赤色
  - ⚪ 不明: グレー

## 🐛 トラブルシューティング

### APIから人数が取得できない

APIレスポンスの構造を確認してください。`server/api-scraper.js` の `extractCounter()` 関数でフィールド名を調整する必要があるかもしれません。

ログを確認：
```bash
npm run dev
```

以下のようなログが出力されます：
```
📦 APIレスポンス: {...}
🔍 人数抽出中: {...}
📊 現在の人数: 3人 → ステータス: やや混雑
```

### ポート3000が使用中

別のポートを使用する場合は `server/index.js` の `PORT` を変更してください。

### データベースのリセット

データベースをリセットしたい場合は、`tobacco_stats.db` を削除して再起動してください：

```bash
rm tobacco_stats.db
npm start
```

## 📝 ライセンス

MIT License

## 👨‍💻 開発

貢献やフィードバックは大歓迎です！

---

## 🔍 データソース

このシステムは以下のAPIから人数データを取得しています：

```
https://api.mebaru.blue/api/cameras/getLatestDataForGroup?id=77adc011-b0d6-4421-989e-625560ffd53a
```

**注意**: 
- 10秒ごとにAPIにアクセスします。過度なアクセスを避け、適切な間隔を設定してください。
- APIの利用規約を遵守してください。
- 本番環境では適切なエラーハンドリングとレート制限を実装してください。
