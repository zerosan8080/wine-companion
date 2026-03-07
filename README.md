# Wine Companion AI Phase 1

Google Apps Script + Google Spreadsheet で動く、ワイン記録 API の Phase 1 実装です。ローカル編集は `clasp` 前提、配布物は `dist/Code.js` です。

## Project Structure

```text
.
├── .clasp.json
├── .claspignore
├── appsscript.json
├── package.json
├── tsconfig.json
├── src
│   ├── Code.ts
│   ├── config.ts
│   ├── api
│   ├── domain
│   ├── infra
│   └── tests
├── scripts
│   └── build.mjs
└── dist
    └── Code.js
```

## Setup

1. `clasp login`
2. GAS プロジェクトを作成済みなら Script ID を取得
3. `.clasp.json` の `scriptId` を置き換える
4. Apps Script の Script Properties に次を設定
   - `SPREADSHEET_ID`: 書き込み先 Spreadsheet ID
   - `API_KEY`: 任意。未設定なら認証なし
5. `npm run build`
6. `clasp push`

## Local Development Policy

- ソース編集は `src/` のみ
- `dist/Code.js` は `npm run build` で生成
- Apps Script エディタでは deploy と Script Properties 確認のみ行う
- シート構造変更は `src/config.ts` の列定義を先に更新する

## Sheets

- `WineLog`: 1行 = 1 complete tasting record
- `WineSession`: 1行 = 1 bottle session
- `UserProfile`: 1行 = aggregate profile

`setupSheets()` を Apps Script から一度実行すると 3 シートが初期化されます。

## API Actions

- `health`
- `upsertRecord`
- `getRecord`
- `getSession`
- `findSession`
- `listRecentRecords`
- `rebuildSession`
- `rebuildUserProfile`

## Sample Requests

### health

```bash
curl -G "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  --data-urlencode "action=health" \
  --data-urlencode "api_key=YOUR_API_KEY"
```

### upsertRecord

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "upsertRecord",
    "_api_key": "YOUR_API_KEY",
    "date": "2026-03-07",
    "opened_on": "2026-03-07",
    "open_day": 1,
    "type": "Red",
    "name": "Chateau Margaux 2015",
    "vintage": 2015,
    "producer": "Chateau Margaux",
    "country": "France",
    "region": "Bordeaux",
    "sub_region": "Margaux",
    "location": "Home",
    "grape_varieties": [{"name": "Cabernet Sauvignon", "percent": 87}],
    "aroma": ["blackcurrant", "cedar"],
    "paired_dishes": {
      "main": ["beef tenderloin"],
      "appetizer": [],
      "side": [],
      "dessert": [],
      "drink_other": []
    },
    "ratings": {
      "color": 5,
      "aroma": 5,
      "tannin": 4,
      "acidity": 4,
      "fruit": 5
    },
    "overall_score_5": 4.8,
    "overall_grade": "A",
    "scene": {
      "people": "partner",
      "style": "anniversary dinner",
      "mood": "celebratory"
    },
    "repurchase_intent": "ぜひ",
    "tags": ["special", "bordeaux"],
    "overall_comment": "Structured and persistent.",
    "meta": {
      "inferred_fields": [],
      "notes": "sample request"
    },
    "summary_jp": "力強くエレガントな一本。",
    "rebuild_profile": true
  }'
```

### getRecord

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getRecord",
    "_api_key": "YOUR_API_KEY",
    "record_id": "YOUR_RECORD_ID"
  }'
```

### getSession

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getSession",
    "_api_key": "YOUR_API_KEY",
    "session_key": "2026-03-07_chateau-margaux-2015_home"
  }'
```

### findSession

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "findSession",
    "_api_key": "YOUR_API_KEY",
    "name": "Chateau Margaux 2015",
    "opened_on": "2026-03-07",
    "location": "Home"
  }'
```

### listRecentRecords

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "listRecentRecords",
    "_api_key": "YOUR_API_KEY",
    "limit": 10
  }'
```

### rebuildSession

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rebuildSession",
    "_api_key": "YOUR_API_KEY",
    "session_key": "2026-03-07_chateau-margaux-2015_home"
  }'
```

### rebuildUserProfile

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rebuildUserProfile",
    "_api_key": "YOUR_API_KEY"
  }'
```

## Deploy Safely

1. Script Properties に `SPREADSHEET_ID` と `API_KEY` を設定する
2. `npm run build`
3. `clasp push`
4. Apps Script で Web App を deploy する
5. 実行ユーザーは Spreadsheet にアクセス可能なアカウントを使う
6. 公開範囲は最小化し、公開 URL は API_KEY 付きでのみ使う
7. 変更ごとに新しい deployment version を切る

## Troubleshooting

- `Missing Script Property: SPREADSHEET_ID`: Script Properties を設定してください
- `Invalid API key`: body の `_api_key` か query の `api_key` を見直してください
- `action is required`: `POST /exec` body に action を含めてください
- `Unknown action`: 実装済み action 名と完全一致しているか確認してください
