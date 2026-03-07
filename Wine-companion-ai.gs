// ============================================================
// Wine Companion AI — Google Apps Script (Improved)
// GPTs / Claude / Shortcut から Google Sheets に保存するAPI
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: "", // 空ならバインドされたスプレッドシートを使う
  SHEET_NAME: "WineLog",
  MASTER_SHEET_NAME: "WineLog_JSON",
  API_KEY: "", // 任意。使う場合は body._api_key または query ?api_key=xxx
  VERSION: "2.0.0",
};

const COLUMNS = [
  "timestamp",
  "record_id",
  "session_key",
  "date",
  "opened_on",
  "open_day",
  "type",
  "name",
  "vintage",
  "producer",
  "country",
  "region",
  "sub_region",
  "location",
  "grape_varieties",
  "aroma",
  "overall_score_5",
  "overall_grade",
  "repurchase_intent",
  "tags",
  "paired_main",
  "paired_appetizer",
  "paired_side",
  "paired_dessert",
  "paired_drink_other",
  "ratings_color",
  "ratings_aroma",
  "ratings_tannin",
  "ratings_acidity",
  "ratings_fruit",
  "scene_people",
  "scene_style",
  "scene_mood",
  "overall_comment",
  "summary_jp",
  "inferred_fields",
  "notes",
  "record_json",
];

// ============================================================
// Entry points
// ============================================================

function doPost(e) {
  try {
    const payload = _parsePayload_(e);
    _authorize_(payload, e);

    const action = String((payload.action || "upsert")).toLowerCase();

    if (action === "append") {
      const records = Array.isArray(payload.records)
        ? payload.records
        : Array.isArray(payload)
        ? payload
        : [payload.record || payload];

      const results = records.map((r) => _appendRecord_(r));
      return _jsonResponse_({ status: "ok", action, count: results.length, results });
    }

    if (action === "upsert") {
      const records = Array.isArray(payload.records)
        ? payload.records
        : [payload.record || payload];

      const results = records.map((r) => _upsertRecord_(r));
      return _jsonResponse_({ status: "ok", action, count: results.length, results });
    }

    if (action === "find") {
      const recordId = payload.record_id || "";
      const sessionKey = payload.session_key || "";
      const result = _findRecord_({ recordId, sessionKey });
      return _jsonResponse_({ status: "ok", action, result });
    }

    return _jsonResponse_({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return _jsonResponse_({ status: "error", message: String(err.message || err) });
  }
}

function doGet(e) {
  try {
    const action = String((e.parameter.action || "health")).toLowerCase();

    if (action === "health") {
      return _jsonResponse_({
        status: "ok",
        message: "Wine Companion API is running",
        version: CONFIG.VERSION,
        sheet: CONFIG.SHEET_NAME,
      });
    }

    if (action === "recent") {
      const n = Math.min(parseInt(e.parameter.n || "5", 10), 100);
      const records = _getRecentRecords_(n);
      return _jsonResponse_({ status: "ok", count: records.length, records });
    }

    if (action === "search") {
      const q = String(e.parameter.q || "").trim().toLowerCase();
      if (!q) return _jsonResponse_({ status: "error", message: "q parameter required" });
      const records = _searchRecords_(q);
      return _jsonResponse_({ status: "ok", count: records.length, query: q, records });
    }

    if (action === "find") {
      const recordId = e.parameter.record_id || "";
      const sessionKey = e.parameter.session_key || "";
      const result = _findRecord_({ recordId, sessionKey });
      return _jsonResponse_({ status: "ok", result });
    }

    return _jsonResponse_({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return _jsonResponse_({ status: "error", message: String(err.message || err) });
  }
}

// ============================================================
// Core
// ============================================================

function _appendRecord_(data) {
  const ss = _getSpreadsheet_();
  const sheet = _ensureMainSheet_(ss);
  const jsonSheet = _ensureJsonSheet_(ss);

  const normalized = _normalizeRecord_(data);
  const row = _buildRow_(normalized);

  sheet.appendRow(row);
  jsonSheet.appendRow(_buildJsonRow_(normalized));

  return {
    mode: "append",
    record_id: normalized.record_id,
    session_key: normalized.session_key,
    row_number: sheet.getLastRow(),
    name: normalized.name || "",
    date: normalized.date || "",
  };
}

function _upsertRecord_(data) {
  const ss = _getSpreadsheet_();
  const sheet = _ensureMainSheet_(ss);
  const jsonSheet = _ensureJsonSheet_(ss);

  const normalized = _normalizeRecord_(data);
  const found = _findRowByKeys_(sheet, normalized.record_id, normalized.session_key);

  if (found.rowNumber) {
    const row = _buildRow_(normalized);
    sheet.getRange(found.rowNumber, 1, 1, row.length).setValues([row]);

    _upsertJsonSheet_(jsonSheet, normalized);

    return {
      mode: "update",
      record_id: normalized.record_id,
      session_key: normalized.session_key,
      row_number: found.rowNumber,
      name: normalized.name || "",
      date: normalized.date || "",
    };
  }

  const row = _buildRow_(normalized);
  sheet.appendRow(row);
  jsonSheet.appendRow(_buildJsonRow_(normalized));

  return {
    mode: "insert",
    record_id: normalized.record_id,
    session_key: normalized.session_key,
    row_number: sheet.getLastRow(),
    name: normalized.name || "",
    date: normalized.date || "",
  };
}

function _findRecord_({ recordId, sessionKey }) {
  const ss = _getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;

  const found = _findRowByKeys_(sheet, recordId, sessionKey);
  if (!found.rowNumber) return null;

  const values = sheet.getRange(found.rowNumber, 1, 1, COLUMNS.length).getValues()[0];
  const obj = {};
  COLUMNS.forEach((col, i) => (obj[col] = values[i]));

  return obj;
}

// ============================================================
// Normalization
// ============================================================

function _normalizeRecord_(data) {
  const d = data || {};
  const safe = (v) => (v === undefined ? null : v);

  const recordId = safe(d.record_id) || _uuid_();
  const sessionKey =
    safe(d.session_key) ||
    _buildSessionKey_({
      date: d.opened_on || d.date,
      name: d.name,
      location: d.location,
    });

  const overallScore = _numOrNull_(d.overall_score_5);
  const overallGrade = d.overall_grade || _scoreToGrade_(overallScore);

  return {
    record_id: recordId,
    session_key: sessionKey,

    date: safe(d.date),
    opened_on: safe(d.opened_on) || safe(d.date),
    open_day: _numOrNull_(d.open_day),

    type: safe(d.type),
    name: safe(d.name),
    vintage: _numOrNull_(d.vintage),
    producer: safe(d.producer),
    country: safe(d.country),
    region: safe(d.region),
    sub_region: safe(d.sub_region),
    location: safe(d.location),

    grape_varieties: Array.isArray(d.grape_varieties) ? d.grape_varieties : [],
    aroma: Array.isArray(d.aroma) ? d.aroma : [],

    paired_dishes: {
      main: _arr_(d?.paired_dishes?.main),
      appetizer: _arr_(d?.paired_dishes?.appetizer),
      side: _arr_(d?.paired_dishes?.side),
      dessert: _arr_(d?.paired_dishes?.dessert),
      drink_other: _arr_(d?.paired_dishes?.drink_other),
    },

    ratings: {
      color: _numOrNull_(d?.ratings?.color),
      aroma: _numOrNull_(d?.ratings?.aroma),
      tannin: _numOrNull_(d?.ratings?.tannin),
      acidity: _numOrNull_(d?.ratings?.acidity),
      fruit: _numOrNull_(d?.ratings?.fruit),
    },

    overall_score_5: overallScore,
    overall_grade: overallGrade,

    scene: {
      people: safe(d?.scene?.people),
      style: safe(d?.scene?.style),
      mood: safe(d?.scene?.mood),
    },

    repurchase_intent: safe(d.repurchase_intent),
    tags: _arr_(d.tags),
    overall_comment: safe(d.overall_comment),
    summary_jp: safe(d.summary_jp),

    meta: {
      inferred_fields: _arr_(d?.meta?.inferred_fields),
      notes: safe(d?.meta?.notes),
    },
  };
}

// ============================================================
// Row builders
// ============================================================

function _buildRow_(data) {
  const safe = (v) => (v === null || v === undefined ? "" : v);
  const join = (arr) => (Array.isArray(arr) ? arr.join(", ") : safe(arr));
  const joinGrapes = (arr) =>
    Array.isArray(arr)
      ? arr
          .map((g) => {
            if (typeof g === "string") return g;
            const name = g?.name || "";
            const percent =
              g?.percent === null || g?.percent === undefined || g?.percent === ""
                ? ""
                : `(${g.percent}%)`;
            return `${name}${percent}`;
          })
          .filter(Boolean)
          .join(", ")
      : "";

  const dishes = data.paired_dishes || {};
  const ratings = data.ratings || {};
  const scene = data.scene || {};
  const meta = data.meta || {};

  return [
    new Date(),
    safe(data.record_id),
    safe(data.session_key),
    safe(data.date),
    safe(data.opened_on),
    safe(data.open_day),
    safe(data.type),
    safe(data.name),
    safe(data.vintage),
    safe(data.producer),
    safe(data.country),
    safe(data.region),
    safe(data.sub_region),
    safe(data.location),
    joinGrapes(data.grape_varieties),
    join(data.aroma),
    safe(data.overall_score_5),
    safe(data.overall_grade),
    safe(data.repurchase_intent),
    join(data.tags),
    join(dishes.main),
    join(dishes.appetizer),
    join(dishes.side),
    join(dishes.dessert),
    join(dishes.drink_other),
    safe(ratings.color),
    safe(ratings.aroma),
    safe(ratings.tannin),
    safe(ratings.acidity),
    safe(ratings.fruit),
    safe(scene.people),
    safe(scene.style),
    safe(scene.mood),
    safe(data.overall_comment),
    safe(data.summary_jp),
    join(meta.inferred_fields),
    safe(meta.notes),
    JSON.stringify(data),
  ];
}

function _buildJsonRow_(data) {
  return [
    new Date(),
    data.record_id || "",
    data.session_key || "",
    data.date || "",
    data.name || "",
    data.overall_score_5 || "",
    JSON.stringify(data),
  ];
}

// ============================================================
// Sheets
// ============================================================

function _getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function _ensureMainSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = _initializeSheet_(ss, CONFIG.SHEET_NAME);
  return sheet;
}

function _ensureJsonSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  if (!sheet) sheet = _initializeJsonSheet_(ss, CONFIG.MASTER_SHEET_NAME);
  return sheet;
}

function _initializeSheet_(ss, name) {
  const sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);

  const headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#1a1a2e");
  headerRange.setFontColor("#ffffff");

  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 160); // timestamp
  sheet.setColumnWidth(2, 180); // record_id
  sheet.setColumnWidth(3, 220); // session_key
  sheet.setColumnWidth(8, 260); // name
  sheet.setColumnWidth(10, 160); // producer
  sheet.setColumnWidth(38, 600); // record_json

  return sheet;
}

function _initializeJsonSheet_(ss, name) {
  const sheet = ss.insertSheet(name);
  const headers = [
    "timestamp",
    "record_id",
    "session_key",
    "date",
    "name",
    "score",
    "record_json",
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#2d1b3d");
  headerRange.setFontColor("#ffffff");

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(7, 700);

  return sheet;
}

// ============================================================
// Search / find helpers
// ============================================================

function _getRecentRecords_(n) {
  const sheet = _getSpreadsheet_().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const lastRow = sheet.getLastRow();
  const startRow = Math.max(2, lastRow - n + 1);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, COLUMNS.length).getValues();

  return data
    .map((row) => {
      const obj = {};
      COLUMNS.forEach((col, i) => (obj[col] = row[i]));
      return obj;
    })
    .reverse();
}

function _searchRecords_(query) {
  const sheet = _getSpreadsheet_().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS.length).getValues();
  const results = [];

  for (const row of data) {
    const rowStr = row.join(" ").toLowerCase();
    if (rowStr.includes(query)) {
      const obj = {};
      COLUMNS.forEach((col, i) => (obj[col] = row[i]));
      results.push(obj);
    }
  }

  return results.reverse().slice(0, 50);
}

function _findRowByKeys_(sheet, recordId, sessionKey) {
  const recordIdIndex = COLUMNS.indexOf("record_id");
  const sessionKeyIndex = COLUMNS.indexOf("session_key");
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return { rowNumber: null };

  const data = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();

  // 1. record_id 優先
  if (recordId) {
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][recordIdIndex]) === String(recordId)) {
        return { rowNumber: i + 2 };
      }
    }
  }

  // 2. session_key 次点
  if (sessionKey) {
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][sessionKeyIndex]) === String(sessionKey)) {
        return { rowNumber: i + 2 };
      }
    }
  }

  return { rowNumber: null };
}

function _upsertJsonSheet_(jsonSheet, data) {
  const lastRow = jsonSheet.getLastRow();
  if (lastRow < 2) {
    jsonSheet.appendRow(_buildJsonRow_(data));
    return;
  }

  const values = jsonSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const rowRecordId = values[i][1];
    if (String(rowRecordId) === String(data.record_id)) {
      jsonSheet
        .getRange(i + 2, 1, 1, 7)
        .setValues([_buildJsonRow_(data)]);
      return;
    }
  }

  jsonSheet.appendRow(_buildJsonRow_(data));
}

// ============================================================
// Helpers
// ============================================================

function _parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function _authorize_(payload, e) {
  if (!CONFIG.API_KEY) return true;

  const bodyKey = payload?._api_key || "";
  const queryKey = e?.parameter?.api_key || "";

  if (bodyKey === CONFIG.API_KEY || queryKey === CONFIG.API_KEY) return true;

  throw new Error("Invalid API key");
}

function _arr_(v) {
  return Array.isArray(v) ? v : [];
}

function _numOrNull_(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _scoreToGrade_(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 4.5) return "A";
  if (score >= 3.5) return "B";
  return "C";
}

function _buildSessionKey_({ date, name, location }) {
  const slug = _slug_([date || "", name || "", location || ""].join("_"));
  return slug || _uuid_();
}

function _slug_(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u3400-\u9fff\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function _uuid_() {
  return Utilities.getUuid();
}

function _jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj, null, 2)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ============================================================
// Setup / menu / test
// ============================================================

function setupSheets() {
  const ss = _getSpreadsheet_();
  _ensureMainSheet_(ss);
  _ensureJsonSheet_(ss);

  SpreadsheetApp.getUi()
    .createMenu("🍷 Wine Companion")
    .addItem("シートを初期化", "setupSheets")
    .addItem("テストデータ挿入", "insertTestRecord")
    .addToUi();

  Logger.log("✅ setup complete");
}

function insertTestRecord() {
  const testData = {
    action: "upsert",
    date: "2026-03-07",
    opened_on: "2026-03-07",
    open_day: 1,
    type: "Red",
    name: "Château Margaux 2015",
    vintage: 2015,
    producer: "Château Margaux",
    country: "France",
    region: "Bordeaux",
    sub_region: "Margaux",
    location: "自宅",
    grape_varieties: [
      { name: "Cabernet Sauvignon", percent: 87 },
      { name: "Merlot", percent: 8 },
      { name: "Petit Verdot", percent: 3 },
      { name: "Cabernet Franc", percent: 2 },
    ],
    aroma: ["カシス", "杉", "ダークチョコレート", "スミレ"],
    paired_dishes: {
      main: ["牛フィレのロースト"],
      appetizer: ["フォアグラのテリーヌ"],
      side: ["トリュフのリゾット"],
      dessert: [],
      drink_other: [],
    },
    ratings: {
      color: 5,
      aroma: 5,
      tannin: 4,
      acidity: 4,
      fruit: 5,
    },
    overall_score_5: 5,
    scene: {
      people: "パートナーと",
      style: "特別なディナー",
      mood: "華やか",
    },
    repurchase_intent: "ぜひ",
    tags: ["ボルドー", "グランヴァン", "特別な日"],
    overall_comment: "完璧なバランス。長い余韻に圧倒される。",
    meta: {
      inferred_fields: [],
      notes: "テストデータ",
    },
    summary_jp: "カシスと杉の香りが華やかに広がる、完璧なバランスのグランヴァン。",
  };

  const result = _upsertRecord_(testData);
  SpreadsheetApp.getUi().alert("テストデータを保存しました\n" + JSON.stringify(result, null, 2));
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🍷 Wine Companion")
    .addItem("シートを初期化", "setupSheets")
    .addItem("テストデータ挿入", "insertTestRecord")
    .addToUi();
}

