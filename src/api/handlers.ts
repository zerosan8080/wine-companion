var ApiHandlers = {
  health: function () {
    var spreadsheetId = "";
    var sheetStatus = {};

    try {
      spreadsheetId = SheetsInfra.getSpreadsheetId();
      sheetStatus = {
        WineLog: !!SheetsInfra.getSheet(APP_CONFIG.sheetNames.wineLog),
        WineSession: !!SheetsInfra.getSheet(APP_CONFIG.sheetNames.wineSession),
        UserProfile: !!SheetsInfra.getSheet(APP_CONFIG.sheetNames.userProfile),
      };
    } catch (error) {
      sheetStatus = {
        configured: false,
        message: String(error.message || error),
      };
    }

    return {
      status: "ok",
      action: "health",
      version: APP_CONFIG.version,
      spreadsheet_id: spreadsheetId,
      sheet_status: sheetStatus,
    };
  },

  upsertRecord: function (payload) {
    SheetsInfra.ensureAllSheets();

    var recordPayload = ApiHandlers.unwrapRecordPayload(payload);
    var result = WineLogDomain.upsertRecord(recordPayload);
    var sessionResult = WineSessionDomain.rebuildSession(result.record.session_key);
    var profileResult = payload.rebuild_profile === true ? UserProfileDomain.rebuildProfile() : null;

    return {
      status: "ok",
      action: "upsertRecord",
      mode: result.mode,
      record: WineLogDomain.toApiRecord(result.record),
      session: sessionResult.session,
      profile: profileResult,
    };
  },

  getRecord: function (payload) {
    var recordId = payload.record_id || payload.id;

    if (!recordId) {
      throw ValidationDomain.buildError("record_id is required", 400);
    }

    var record = WineLogDomain.findByRecordId(recordId);

    if (!record) {
      throw ValidationDomain.buildError("record not found: " + recordId, 404);
    }

    return {
      status: "ok",
      action: "getRecord",
      record: WineLogDomain.toApiRecord(record),
    };
  },

  getSession: function (payload) {
    var sessionKey = payload.session_key;

    if (!sessionKey) {
      throw ValidationDomain.buildError("session_key is required", 400);
    }

    var result = WineSessionDomain.getSession(sessionKey);

    if (!result) {
      throw ValidationDomain.buildError("session not found: " + sessionKey, 404);
    }

    return {
      status: "ok",
      action: "getSession",
      session: result.session,
      records: result.records.map(WineLogDomain.toApiRecord),
    };
  },

  findSession: function (payload) {
    var sessions = WineSessionDomain.findSession(payload);

    return {
      status: "ok",
      action: "findSession",
      count: sessions.length,
      sessions: sessions,
    };
  },

  listRecentRecords: function (payload) {
    var limit = Number(payload.limit || payload.n || 20);
    var safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
    var records = WineLogDomain.listRecentRecords(safeLimit).map(WineLogDomain.toApiRecord);

    return {
      status: "ok",
      action: "listRecentRecords",
      count: records.length,
      records: records,
    };
  },

  rebuildSession: function (payload) {
    var result = WineSessionDomain.rebuildSession(payload.session_key);

    return {
      status: "ok",
      action: "rebuildSession",
      session: result.session,
      records: result.records.map(WineLogDomain.toApiRecord),
    };
  },

  rebuildUserProfile: function () {
    SheetsInfra.ensureAllSheets();
    var profile = UserProfileDomain.rebuildProfile();

    return {
      status: "ok",
      action: "rebuildUserProfile",
      profile: profile,
    };
  },

  unwrapRecordPayload: function (payload) {
    if (payload.record && typeof payload.record === "object" && !Array.isArray(payload.record)) {
      return JsonInfra.sanitizeRawPayload(payload.record);
    }

    var cloned = JsonInfra.sanitizeRawPayload(payload);

    delete cloned.action;
    delete cloned.rebuild_profile;
    delete cloned.api_key;

    return cloned;
  },
};
