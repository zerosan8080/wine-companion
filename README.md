# Wine Companion AI Phase 1

Wine Companion AI の Phase 1 実装です。Google Apps Script を Web App として公開し、GPTs から構造化されたワイン記録 JSON を受け取り、Google Spreadsheet の `WineLog` `WineSession` `UserProfile` に保存・集計します。

このリポジトリの役割は次の 3 つです。

- GPTs から呼べる安定した記録 API を提供する
- raw JSON を失わず保存しつつ、検索・集計しやすい列も維持する
- Laravel / NativePHP への後続移行に備えて、GAS 依存とドメインロジックを分離する

## What This System Does

Phase 1 の責務は次の通りです。

- 1回のテイスティング記録を `WineLog` に保存する
- 同じボトルの複数日の記録を `WineSession` に集約する
- 全記録からユーザー嗜好を `UserProfile` に集約する
- GPTs / 外部クライアントから `POST /exec` で操作できるようにする

対象外です。

- ネイティブアプリ UI
- Laravel バックエンド本体
- 高度な推薦エンジン
- 認証基盤の本格実装

## Architecture

```text
GPTs / External Client
        |
        v
Google Apps Script Web App
        |
        v
Google Spreadsheet
  ├── WineLog
  ├── WineSession
  └── UserProfile
```

### Data Layers

- `WineLog`
  - 1 行 = 1 完全な tasting record
  - `raw_json` が source of truth
  - JSON 系列はすべて文字列化して保存
- `WineSession`
  - 1 行 = 1 bottle session
  - 同じ `session_key` を持つ record 群を deterministic に集約
- `UserProfile`
  - 1 行 = 1 ユーザープロファイル
  - `WineLog` 全体から再構築

## Key Design Rules

- `record_id` は 1 保存スナップショットのキー
- `session_key` は同一ボトル体験の継続キー
- `upsertRecord` は部分更新ではなく、完全な record を受け取る
- `record_id` が既存なら `WineLog` 同一行を更新する
- `raw_json` は `_api_key` を除いて保存する
- inferred 情報は `meta.inferred_fields` に明示する
- シート utility に業務ルールを埋め込まない

## Repository Layout

```text
.
├── .clasp.json
├── .claspignore
├── appsscript.json
├── package.json
├── tsconfig.json
├── scripts/
│   └── build.mjs
├── src/
│   ├── Code.ts
│   ├── config.ts
│   ├── api/
│   │   ├── handlers.ts
│   │   └── router.ts
│   ├── domain/
│   │   ├── validation.ts
│   │   ├── wineLog.ts
│   │   ├── wineSession.ts
│   │   └── userProfile.ts
│   ├── infra/
│   │   ├── dates.ts
│   │   ├── ids.ts
│   │   ├── json.ts
│   │   ├── sheets.ts
│   │   └── slug.ts
│   └── tests/
│       └── fixtures.ts
└── dist/
    ├── Code.js
    └── appsscript.json
```

### Source Ownership

- `src/` を編集対象とする
- `dist/Code.js` は `npm run build` で生成する
- Apps Script エディタは Script Properties 設定、動作確認、deploy のみに使う

## Requirements

- Node.js 24 以上
- npm 11 以上
- `clasp` 3 系
- Google Apps Script プロジェクト
- Google Spreadsheet

参考コマンド:

```bash
node -v
npm -v
clasp -v
```

## Initial Setup

### 1. Install and Authenticate clasp

```bash
clasp login
```

### 2. Configure Script ID

[`/.clasp.json`](/Users/zero/WorkSpace/Wine-companion-ai/.clasp.json) の `scriptId` を対象 Apps Script の Script ID に設定します。

### 3. Create Script Properties

Apps Script の `Project Settings > Script properties` に次を設定します。

- `SPREADSHEET_ID`
  - 保存先 Spreadsheet の ID
- `API_KEY`
  - 任意の共有シークレット
  - GPTs を `Authentication: None` で使う場合も、body の `_api_key` に同じ値を送る

### 4. Build and Push

```bash
npm run build
clasp push
```

### 5. Initialize Sheets

Apps Script エディタで `setupSheets()` を 1 回実行します。次の 3 シートが作成されます。

- `WineLog`
- `WineSession`
- `UserProfile`

### 6. Deploy Web App

Apps Script の `Deploy > Manage deployments` から Web App を作成または更新します。

推奨設定:

- Execute as: `Me`
- Who has access: `Anyone`

GPTs から直接呼ぶため、`Anyone` が必要です。

## Development Workflow

通常の更新手順です。

```bash
npm run build
clasp push
```

Web App に変更を反映する場合は、push 後に deployment version を更新します。

推奨フロー:

1. `src/` を編集
2. `npm run build`
3. `clasp push`
4. Apps Script で Web App を redeploy
5. `curl` で `health` を確認
6. 必要なら GPTs 側で `health` / `upsertRecord` を確認

## API Overview

単一エンドポイントを action-dispatch で使います。

- Method: `GET` or `POST`
- Path: `/exec`
- Main usage: `POST`

実装済み action:

- `health`
- `upsertRecord`
- `getRecord`
- `getSession`
- `findSession`
- `listRecentRecords`
- `rebuildSession`
- `rebuildUserProfile`

### Authentication

現在の運用では、GPTs との相性を優先して `Authentication: None` + body `_api_key` を推奨します。

- `POST` body の `_api_key`
- または query `api_key`

Apps Script の `API_KEY` が未設定なら認証は無効です。

## Data Model Summary

### WineLog

主な列:

- `record_id`
- `session_key`
- `date`
- `opened_on`
- `open_day`
- `type`
- `name`
- `grape_varieties_json`
- `aroma_json`
- `paired_dishes_json`
- `tags_json`
- `meta_inferred_fields_json`
- `raw_json`
- `created_at`
- `updated_at`
- `deleted_flag`

### WineSession

主な列:

- `session_key`
- `record_ids_json`
- `latest_record_id`
- `latest_open_day`
- `days_logged`
- `best_overall_score_5`
- `latest_overall_score_5`
- `best_pairing`
- `final_impression`

### UserProfile

主な列:

- `favorite_types_json`
- `preferred_grapes_json`
- `rating_pattern_json`
- `best_pairings_json`
- `avoid_patterns_json`
- `top_regions_json`
- `top_producers_json`
- `summary`
- `source_record_count`

## Session Aggregation Rules

- `session_key` は `{opened_on}_{slug(name)}_{slug(location)}`
- 同じ `session_key` の `WineLog` を対象に `WineSession` を再構築する
- `opened_on` 昇順、同順位では `open_day`、さらに `updated_at` の順で処理する
- `latest_*` は最大 `open_day` かつ最新 `updated_at` の record から取る
- `best_pairing` は最高評価 record の料理候補から決める
- `final_impression` は最新 record の `summary_jp`、なければ `overall_comment`

## Profile Aggregation Rules

- 対象は `deleted_flag != true` の `WineLog`
- 高評価の閾値は `overall_score_5 >= 4.0`
- 低評価傾向は `overall_score_5 < 3.0`
- タイプ、品種、料理、地域、生産者ごとに件数と平均点を集計
- `UserProfile` は 1 行運用

## API Examples

### health

```bash
curl -L -G "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --data-urlencode "action=health" \
  --data-urlencode "api_key=YOUR_API_KEY"
```

### upsertRecord

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "upsertRecord",
    "_api_key": "YOUR_API_KEY",
    "date": "2026-03-08",
    "opened_on": "2026-03-08",
    "open_day": 1,
    "type": "Red",
    "name": "Test Cabernet",
    "vintage": 2021,
    "producer": "Test Winery",
    "country": "France",
    "region": "Bordeaux",
    "sub_region": "Medoc",
    "location": "Home",
    "grape_varieties": [
      { "name": "Cabernet Sauvignon", "percent": 100 }
    ],
    "aroma": ["blackcurrant", "cedar"],
    "paired_dishes": {
      "main": ["steak"],
      "appetizer": [],
      "side": [],
      "dessert": [],
      "drink_other": []
    },
    "ratings": {
      "color": 4,
      "aroma": 4,
      "tannin": 4,
      "acidity": 3,
      "fruit": 4
    },
    "overall_score_5": 4.2,
    "overall_grade": "A",
    "scene": {
      "people": "solo",
      "style": "dinner",
      "mood": "calm"
    },
    "repurchase_intent": "ぜひ",
    "tags": ["test"],
    "overall_comment": "API test record",
    "meta": {
      "inferred_fields": [],
      "notes": "sample request"
    },
    "summary_jp": "接続確認用のテスト記録です。",
    "rebuild_profile": true
  }'
```

### getRecord

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getRecord",
    "_api_key": "YOUR_API_KEY",
    "record_id": "YOUR_RECORD_ID"
  }'
```

### getSession

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getSession",
    "_api_key": "YOUR_API_KEY",
    "session_key": "2026-03-08_test-cabernet_home"
  }'
```

### findSession

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "findSession",
    "_api_key": "YOUR_API_KEY",
    "name": "Test Cabernet",
    "opened_on": "2026-03-08",
    "location": "Home"
  }'
```

### listRecentRecords

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "listRecentRecords",
    "_api_key": "YOUR_API_KEY",
    "limit": 10
  }'
```

### rebuildSession

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rebuildSession",
    "_api_key": "YOUR_API_KEY",
    "session_key": "2026-03-08_test-cabernet_home"
  }'
```

### rebuildUserProfile

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rebuildUserProfile",
    "_api_key": "YOUR_API_KEY"
  }'
```

## GPTs Integration Notes

現状の安定運用は次です。

- Authentication: `None`
- `POST` の body に `_api_key` を含める
- `action` は `upsertRecord` など実装済み action 名に固定する
- schema テンプレートは [`openapi/gpts-action.schema.json`](/Users/zero/WorkSpace/Wine-companion-ai/openapi/gpts-action.schema.json) を使う

GPTs に貼る前に次の 2 箇所を置換してください。

- `YOUR_DEPLOYMENT_ID`
- `YOUR_API_KEY`

推奨 instruction 例:

```text
このActionを使うときは、必ずPOSTで実行し、bodyに `_api_key` を含めること。
`health`、`upsertRecord`、`getRecord`、`getSession`、`findSession`、`listRecentRecords`、`rebuildSession`、`rebuildUserProfile` 以外の action は使わないこと。
`upsertRecord` では action に加えて、date, opened_on, open_day, type, name を必ず含めること。
```

## Legacy Chat Migration

過去の ChatGPT 会話から作った legacy JSON 配列を、現行 API 用に正規化するスクリプトを用意しています。

- スクリプト: [`scripts/import-legacy-records.mjs`](/Users/zero/WorkSpace/Wine-companion-ai/scripts/import-legacy-records.mjs)
- 実行コマンド: `npm run migrate:legacy -- --input <file>`

### What The Migration Script Does

- `action: "upsert"` を `action: "upsertRecord"` に変換する
- 空の `record_id` は `null` のまま通し、API 側採番に任せる
- `date` と `opened_on` の片方だけがある場合は補完する
- 空の品種名、空文字 aroma、空文字 tags などを除去する
- `ready` と `needs_review` に振り分ける
- 必要なら `--push` で GAS API に順次投入する

### Typical Workflow

1. legacy JSON 配列をファイルに保存する
2. 正規化だけ行う

```bash
npm run migrate:legacy -- --input ./path/to/legacy-records.json
```

3. 生成された `migration-output/` を確認する
   - `normalized-records.json`
   - `ready-records.json`
   - `needs-review.json`
   - `report.json`
4. `needs-review.json` の不完全データを補正する
5. 問題なければ `--push` で ready データを投入する

```bash
npm run migrate:legacy -- \
  --input ./path/to/legacy-records.json \
  --push \
  --endpoint "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --api-key "YOUR_API_KEY"
```

既存投入済みデータを更新したい場合は、前回の `import-results.json` を渡して `record_id` を再利用できます。

```bash
npm run migrate:legacy -- \
  --input ./path/to/legacy-records.json \
  --output-dir ./migration-output/reimport \
  --existing-record-map ./migration-output/legacy-2026-03-08/import-results.json \
  --push \
  --endpoint "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --api-key "YOUR_API_KEY"
```

### Output Files

- `normalized-records.json`
  - 正規化後の全件
- `ready-records.json`
  - そのまま API に入れられる record 配列
- `needs-review.json`
  - 必須項目不足や型不整合があり、手直しが必要な record 一覧
- `report.json`
  - 件数と issue 集計
- `import-results.json`
  - `--push` 実行時のみ生成

### What Becomes Needs Review

- `date` と `opened_on` が両方空
- `name` が空
- `open_day` が 1 以上の整数でない
- `type` が許容値に含まれない
- `vintage` や評価値が数値として解釈できない

### Notes

- `unknown_...` な `session_key` はそのまま保持しますが、warning を出します
- 片方だけ存在する `date` / `opened_on` は自動補完します
- `grape_varieties` の空要素は削除します
- まず `prepare_only` で生成物を確認してから `--push` する運用を推奨します

## Validation Rules

- `date`, `opened_on`, `type`, `name` は必須
- `open_day` は整数かつ 1 以上
- `type` は `Red|White|Rose|Sparkling|Orange|Cider|Sake|Other`
- 数値列は number または null
- 配列列に object や scalar を入れない
- `upsertRecord` は完全なレコードを送る

## Troubleshooting

### `Missing Script Property: SPREADSHEET_ID`

Apps Script の Script Properties に `SPREADSHEET_ID` を設定してください。

### `Invalid API key`

次を確認してください。

- Apps Script 側の `API_KEY`
- GPTs / `curl` が送る `_api_key` または `api_key`
- 先頭末尾の空白や改行

### `Moved Temporarily` が返る

`script.google.com` はリダイレクトします。`curl` では `-L` を付けてください。

### `The caller does not have permission`

`clasp` にログインしている Google アカウントと、Apps Script プロジェクト所有アカウントが一致しているか確認してください。

### GPTs だけ 401 になる

GAS 側が正常でも、GPTs built-in API key auth が query に期待通り付かないことがあります。現行運用では `Authentication: None` + body `_api_key` を使ってください。

## Verification Checklist

- `npm run build` が成功する
- `clasp push` が成功する
- `health` が `status: ok` を返す
- `upsertRecord` で `WineLog` に 1 行作成される
- `getRecord` が `raw_json` を含めて返す
- `getSession` が member records を返す
- `rebuildUserProfile` が `source_record_count` を更新する

## Operations

日常運用と障害対応は [`runbook.md`](/Users/zero/WorkSpace/Wine-companion-ai/runbook.md) を参照してください。
