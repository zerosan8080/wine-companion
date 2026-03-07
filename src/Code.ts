function doPost(e) {
  try {
    var payload = ApiRouter.parsePostPayload(e);
    var query = (e && e.parameter) || {};
    var result = ApiRouter.handleRequest("POST", payload, query);
    return ApiRouter.jsonResponse(result);
  } catch (error) {
    return ApiRouter.errorResponse(error);
  }
}

function doGet(e) {
  try {
    var query = (e && e.parameter) || {};
    var result = ApiRouter.handleRequest("GET", {}, query);
    return ApiRouter.jsonResponse(result);
  } catch (error) {
    return ApiRouter.errorResponse(error);
  }
}

function setupSheets() {
  SheetsInfra.ensureAllSheets();
  Logger.log("setupSheets completed");
  return {
    status: "ok",
    message: "Sheets initialized",
    spreadsheet_id: SheetsInfra.getSpreadsheetId(),
  };
}

function insertTestRecord() {
  SheetsInfra.ensureAllSheets();
  return ApiHandlers.upsertRecord(TestFixtures.sampleRecord());
}

function runSmokeTests() {
  SheetsInfra.ensureAllSheets();
  var first = ApiHandlers.upsertRecord(TestFixtures.sampleRecord());
  var secondPayload = TestFixtures.sampleRecord();
  secondPayload.record_id = first.record.record_id;
  secondPayload.open_day = 2;
  secondPayload.summary_jp = "二日目は香りがより開いた。";
  secondPayload.overall_score_5 = 4.9;
  var second = ApiHandlers.upsertRecord(secondPayload);
  var session = ApiHandlers.getSession({ action: "getSession", session_key: second.record.session_key });
  var profile = ApiHandlers.rebuildUserProfile();

  return {
    first: first,
    second: second,
    session: session,
    profile: profile,
  };
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Wine Companion")
      .addItem("Setup Sheets", "setupSheets")
      .addItem("Insert Test Record", "insertTestRecord")
      .addItem("Run Smoke Tests", "runSmokeTests")
      .addToUi();
  } catch (error) {
    Logger.log("onOpen skipped: %s", error.message || error);
  }
}
