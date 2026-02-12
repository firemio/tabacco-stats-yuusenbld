# AI Agent向けプロジェクトガイドライン

このプロジェクトは **Bun** ランタイムを使用しています。
Node.js (npm) ではなく、必ず **Bun** コマンドを使用してください。

## ルール
1. **ランタイム**: Node.js ではなく `bun` を使用する。
2. **パッケージ管理**: `npm` ではなく `bun install`, `bun add`, `bun remove` を使用する。
3. **スクリプト実行**: `npm run` ではなく `bun run` を使用する。
4. **データベース**: `better-sqlite3` ではなく、Bun標準の `bun:sqlite` を使用する。

## コマンド例
- サーバー起動: `bun run dev`
- パッケージ追加: `bun add <package>`
- テスト実行: `bun test`
