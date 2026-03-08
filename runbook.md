# Wine Companion AI Runbook

このドキュメントは本番運用・障害切り分け・変更反映の手順をまとめた運用用 runbook です。コード説明ではなく、実際に何を確認し、何を実行するかに絞っています。

## System Summary

- Runtime: Google Apps Script Web App
- Data store: Google Spreadsheet
- Main sheets:
  - `WineLog`
  - `WineSession`
  - `UserProfile`
- Main client: GPTs
- Authentication: `_api_key` in POST body

## Source of Truth

- canonical record: `WineLog.raw_json`
- latest source code: GitHub `main`
- deploy artifact: `dist/Code.js`
- web app config: Apps Script deployment
- runtime config: Script Properties

## Required Runtime Configuration

Apps Script `Script Properties` に次が必要です。

- `SPREADSHEET_ID`
- `API_KEY`

値が違うと次の問題が発生します。

- `SPREADSHEET_ID` 不正: `health` または保存処理が失敗
- `API_KEY` 不一致: 401 `Invalid API key`

## Standard Release Procedure

### 1. Pull latest code

```bash
git pull origin main
```

### 2. Build

```bash
npm run build
```

### 3. Push source to Apps Script

```bash
clasp push
```

### 4. Update Web App deployment

Apps Script:

1. `Deploy`
2. `Manage deployments`
3. 対象 deployment を編集
4. 新しい version で更新

### 5. Smoke check

```bash
curl -L -G "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --data-urlencode "action=health" \
  --data-urlencode "api_key=YOUR_API_KEY"
```

期待値:

- `status: ok`
- `sheet_status.WineLog = true`
- `sheet_status.WineSession = true`
- `sheet_status.UserProfile = true`

## Daily Operations

日常的に見るべきポイントです。

- GPTs から `health` が通るか
- 新規保存で `WineLog` に行が追加されるか
- 同一 `session_key` の複数保存で `WineSession` が更新されるか
- `rebuildUserProfile` 後に `source_record_count` が増えるか

## Historical Migration Procedure

過去チャットを JSON 化したデータを本番投入するときは、必ず 2 段階で実施します。

### Step 1: Normalize Only

```bash
npm run migrate:legacy -- --input ./path/to/legacy-records.json
```

確認対象:

- `migration-output/report.json`
- `migration-output/ready-records.json`
- `migration-output/needs-review.json`

### Step 2: Review Blocked Records

主な修正ポイント:

- 欠損 `date`
- 欠損 `opened_on`
- 誤った `type`
- 不正な `open_day`
- 空の `name`

### Step 3: Push Ready Records

```bash
npm run migrate:legacy -- \
  --input ./path/to/legacy-records.json \
  --push \
  --endpoint "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --api-key "YOUR_API_KEY"
```

既存投入済みデータの再反映で重複を避けたい場合:

```bash
npm run migrate:legacy -- \
  --input ./path/to/legacy-records.json \
  --output-dir ./migration-output/reimport \
  --existing-record-map ./migration-output/legacy-2026-03-08/import-results.json \
  --push \
  --endpoint "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --api-key "YOUR_API_KEY"
```

必要なら件数を絞る:

```bash
npm run migrate:legacy -- \
  --input ./path/to/legacy-records.json \
  --push \
  --endpoint "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --api-key "YOUR_API_KEY" \
  --limit 20
```

### Step 4: Verify

- `health`
- `listRecentRecords`
- `getRecord`
- `getSession`
- Spreadsheet 上の `WineLog` / `WineSession` / `UserProfile`

## Operational Checks

### Check 1: API health

```bash
curl -L -G "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --data-urlencode "action=health" \
  --data-urlencode "api_key=YOUR_API_KEY"
```

### Check 2: Save test record

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
    "name": "Runbook Test Wine",
    "vintage": 2022,
    "producer": "Runbook Winery",
    "country": "France",
    "region": "Bordeaux",
    "sub_region": "Medoc",
    "location": "Home",
    "grape_varieties": [{"name": "Cabernet Sauvignon", "percent": 100}],
    "aroma": ["cassis"],
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
    "overall_score_5": 4.0,
    "overall_grade": "A",
    "scene": {
      "people": "solo",
      "style": "dinner",
      "mood": "calm"
    },
    "repurchase_intent": "ぜひ",
    "tags": ["runbook-test"],
    "overall_comment": "Runbook smoke test",
    "meta": {
      "inferred_fields": [],
      "notes": "runbook"
    },
    "summary_jp": "運用確認用のテスト記録です。",
    "rebuild_profile": true
  }'
```

### Check 3: Verify saved record

上のレスポンスで返った `record_id` を使います。

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getRecord",
    "_api_key": "YOUR_API_KEY",
    "record_id": "YOUR_RECORD_ID"
  }'
```

### Check 4: Verify session

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getSession",
    "_api_key": "YOUR_API_KEY",
    "session_key": "YOUR_SESSION_KEY"
  }'
```

## Incident Playbooks

### Incident: GPTs returns 401 Invalid API key

確認順:

1. `curl -L` で `health` が通るか確認
2. Apps Script の `API_KEY` を確認
3. GPTs body の `_api_key` を確認
4. GPTs Action が `Authentication: None` になっているか確認

切り分け:

- `curl` は通る / GPTs は失敗
  - GPTs 側設定ミス
- `curl` も失敗
  - Script Properties または deploy が問題

### Incident: `Moved Temporarily` HTML is returned

原因:

- `curl` が redirect を追っていない

対応:

- `curl -L` を使う

### Incident: `The caller does not have permission` on `clasp push`

原因:

- `clasp` ログインアカウントと Apps Script 所有者が違う

対応:

```bash
clasp logout
clasp login
```

必要なら正しい Google アカウントで再ログインする。

### Incident: `Missing Script Property: SPREADSHEET_ID`

対応:

1. Apps Script `Project Settings`
2. `Script properties`
3. `SPREADSHEET_ID` を設定

### Incident: save succeeded but session/profile not updated as expected

確認順:

1. `WineLog` に対象 record があるか
2. `session_key` が想定通りか
3. `open_day` が正しいか
4. `rebuildSession` を手動実行
5. `rebuildUserProfile` を手動実行

手動コマンド:

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rebuildSession",
    "_api_key": "YOUR_API_KEY",
    "session_key": "YOUR_SESSION_KEY"
  }'
```

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rebuildUserProfile",
    "_api_key": "YOUR_API_KEY"
  }'
```

## Change Management

変更時の基本ルールです。

- `src/` を編集し、`dist/` を直接編集しない
- シート列追加・変更時は `src/config.ts` を先に更新する
- API の action や payload を変える場合は GPTs schema も同時に更新する
- Web App deploy を更新しない限り、本番 URL には反映されない

## Rollback Procedure

Apps Script の旧 deployment version に戻します。

1. `Deploy`
2. `Manage deployments`
3. 旧 version を選ぶ
4. Web App を更新

Git 側で戻す場合:

```bash
git log --oneline
git checkout <known-good-commit> -- src dist README.md runbook.md
npm run build
clasp push
```

必要なら新しい commit と deployment version を切る。

## Security Notes

- `API_KEY` は Git に保存しない
- README や runbook に実値を書かない
- GPTs 内部利用でのみ `_api_key` を直接持たせる
- 外部公開を広げる場合は将来的に認証方式を見直す

## Useful Files

- [`README.md`](/Users/zero/WorkSpace/Wine-companion-ai/README.md)
- [`src/config.ts`](/Users/zero/WorkSpace/Wine-companion-ai/src/config.ts)
- [`src/api/router.ts`](/Users/zero/WorkSpace/Wine-companion-ai/src/api/router.ts)
- [`src/domain/wineLog.ts`](/Users/zero/WorkSpace/Wine-companion-ai/src/domain/wineLog.ts)
- [`src/domain/wineSession.ts`](/Users/zero/WorkSpace/Wine-companion-ai/src/domain/wineSession.ts)
- [`src/domain/userProfile.ts`](/Users/zero/WorkSpace/Wine-companion-ai/src/domain/userProfile.ts)
