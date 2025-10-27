# 🚬 喫煙所混雑状況 統計システム

郵船ビルディングの喫煙所混雑状況をリアルタイムで監視し、日別・時間帯別の統計を記録・可視化するシステムです。

## 🎯 機能

- **リアルタイム監視**: WebSocket + DOM監視でステータス変更を即座に検知
- **ステータス記録**: 変化した瞬間に自動的にデータベースに記録
- **日別統計**: 過去7日間の混雑状況を日ごとに集計
- **時間帯別統計**: 指定した日の時間帯別の混雑パターンを分析
- **変更履歴**: 最近のステータス変更を時系列で表示
- **美しいUI**: Chart.js + TailwindCSSによる見やすいダッシュボード

## 📊 統計データ

システムは以下の情報を記録します：

- **ステータス**: 空き / やや混雑 / 混雑 / 不明
- **タイムスタンプ**: 記録時刻
- **カメラID**: 監視対象の識別子

## 🚀 セットアップ

### 必要な環境

- Node.js 18以上
- npm または yarn

### インストール手順

1. **依存パッケージのインストール**

```bash
npm install
```

2. **Playwrightブラウザのインストール**

```bash
npx playwright install chromium
```

3. **サーバーの起動**

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

## 📁 プロジェクト構造

```
tobacco-stats/
├── server/
│   ├── index.js        # メインサーバー（Express + API）
│   ├── database.js     # SQLiteデータベース管理
│   └── scraper.js      # Playwrightによるスクレイピング
├── public/
│   ├── index.html      # ダッシュボードUI
│   └── app.js          # フロントエンドロジック
├── package.json
├── .gitignore
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
    "status": "空き",
    "timestamp": 1698400000000,
    "formatted_time": "2024-10-27 13:00:00"
  }
}
```

### 日別統計取得

```
GET /api/stats/daily?days=7
```

パラメータ：
- `days`: 取得する日数（デフォルト: 7）

### 時間帯別統計取得

```
GET /api/stats/hourly?date=2024-10-27
```

パラメータ：
- `date`: 対象日（YYYY-MM-DD形式）

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

### ヘルスチェック

```
GET /api/health
```

## 🛠️ カスタマイズ

### 対象URLの変更

`server/scraper.js` の `TARGET_URL` と `CAMERA_ID` を変更します：

```javascript
const TARGET_URL = 'https://example.com/smoking-area/';
const CAMERA_ID = 'your-camera-id';
```

### ステータス判定ロジックの調整

`server/scraper.js` の以下の関数で、ページ構造に応じた判定ロジックをカスタマイズできます：

- `extractStatusFromMessage()`: WebSocketメッセージからステータスを抽出
- `startMonitoring()` 内のDOM監視ロジック: ページ変更からステータスを判定

## 📈 データベース

SQLiteを使用してデータを永続化します。データベースファイルは `tobacco_stats.db` として保存されます。

### テーブル構造

**status_records**

| カラム | 型 | 説明 |
|--------|---------|------|
| id | INTEGER | 主キー（自動採番） |
| camera_id | TEXT | カメラ識別子 |
| status | TEXT | ステータス |
| timestamp | INTEGER | タイムスタンプ（ミリ秒） |
| created_at | DATETIME | 作成日時 |

## 🎨 UI の特徴

- **レスポンシブデザイン**: モバイル・タブレット・デスクトップ対応
- **自動更新**: 30秒ごとにダッシュボードを自動更新
- **インタラクティブなグラフ**: Chart.jsによる美しい可視化
- **色分け表示**: ステータスごとに直感的な色分け
  - 🟢 空き: 緑色
  - 🟡 やや混雑: オレンジ色
  - 🔴 混雑: 赤色
  - ⚪ 不明: グレー

## 🐛 トラブルシューティング

### Playwrightがインストールできない

ブラウザのインストールに失敗した場合は、管理者権限で実行してみてください：

```bash
npx playwright install chromium --with-deps
```

### ポート3000が使用中

別のポートを使用する場合は `server/index.js` の `PORT` を変更してください。

### ステータスが正しく取得できない

対象サイトのHTML構造が変わった可能性があります。`server/scraper.js` の `fetchStatus()` 関数を調整してください。

## 📝 ライセンス

MIT License

## 👨‍💻 開発

貢献やフィードバックは大歓迎です！

---

**注意**: このシステムは対象サイトをスクレイピングします。過度なアクセスを避け、サイトの利用規約を遵守してください。
