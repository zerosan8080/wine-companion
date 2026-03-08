var WineSessionDomain = {
  getAllRows: function () {
    var rows = SheetsInfra.readObjects(APP_CONFIG.sheetNames.wineSession, APP_CONFIG.wineSessionColumns);
    return rows.map(WineSessionDomain.parseRow);
  },

  parseRow: function (row) {
    return {
      session_key: row.session_key,
      wine_name: row.wine_name || "",
      opened_on: DateInfra.toDateOnlyString(row.opened_on),
      location: row.location || "",
      type: row.type || "",
      producer: row.producer || "",
      country: row.country || "",
      region: row.region || "",
      sub_region: row.sub_region || "",
      vintage: WineLogDomain.toIntegerOrNull(row.vintage),
      record_ids_json: row.record_ids_json || "[]",
      record_ids: JsonInfra.parse(row.record_ids_json, []),
      latest_record_id: row.latest_record_id || "",
      latest_open_day: WineLogDomain.toIntegerOrNull(row.latest_open_day),
      days_logged: WineLogDomain.toIntegerOrNull(row.days_logged),
      best_overall_score_5: WineLogDomain.toNumberOrNull(row.best_overall_score_5),
      latest_overall_score_5: WineLogDomain.toNumberOrNull(row.latest_overall_score_5),
      best_pairing: row.best_pairing || "",
      final_impression: row.final_impression || "",
      repurchase_intent: row.repurchase_intent || "",
      created_at: DateInfra.toComparableString(row.created_at),
      updated_at: DateInfra.toComparableString(row.updated_at),
      __rowNumber: row.__rowNumber,
    };
  },

  rebuildSession: function (sessionKey) {
    if (!sessionKey) {
      throw ValidationDomain.buildError("session_key is required", 400);
    }

    var records = WineLogDomain.getActiveRows()
      .filter(function (row) {
        return row.session_key === sessionKey;
      })
      .sort(WineSessionDomain.sortRecordsForSession);

    if (records.length === 0) {
      throw ValidationDomain.buildError("session not found for session_key: " + sessionKey, 404);
    }

    var existing = SheetsInfra.findObjectByColumn(
      APP_CONFIG.sheetNames.wineSession,
      APP_CONFIG.wineSessionColumns,
      "session_key",
      sessionKey
    );
    var existingParsed = existing ? WineSessionDomain.parseRow(existing) : null;
    var aggregate = WineSessionDomain.buildAggregate(records, existingParsed);
    var rowObject = WineSessionDomain.buildRow(aggregate);

    if (existingParsed) {
      SheetsInfra.updateObject(
        APP_CONFIG.sheetNames.wineSession,
        APP_CONFIG.wineSessionColumns,
        existingParsed.__rowNumber,
        rowObject
      );
    } else {
      SheetsInfra.appendObject(APP_CONFIG.sheetNames.wineSession, APP_CONFIG.wineSessionColumns, rowObject);
    }

    console.log(
      JSON.stringify({
        area: "WineSession",
        action: "rebuild",
        session_key: sessionKey,
        record_count: records.length,
      })
    );

    return {
      session: aggregate,
      records: records,
    };
  },

  buildAggregate: function (records, existing) {
    var latestRecord = records.slice().sort(WineSessionDomain.sortRecordsForLatest).pop();
    var bestRecord = records
      .filter(function (record) {
        return record.overall_score_5 !== null;
      })
      .sort(WineSessionDomain.sortRecordsForBest)
      .pop();
    var uniqueDays = {};

    records.forEach(function (record) {
      if (record.open_day !== null) {
        uniqueDays[String(record.open_day)] = true;
      }
    });

    return {
      session_key: latestRecord.session_key,
      wine_name: latestRecord.name,
      opened_on: records[0].opened_on,
      location: latestRecord.location,
      type: latestRecord.type,
      producer: latestRecord.producer,
      country: latestRecord.country,
      region: latestRecord.region,
      sub_region: latestRecord.sub_region,
      vintage: latestRecord.vintage,
      record_ids: records.map(function (record) {
        return record.record_id;
      }),
      latest_record_id: latestRecord.record_id,
      latest_open_day: latestRecord.open_day,
      days_logged: Object.keys(uniqueDays).length,
      best_overall_score_5: bestRecord ? bestRecord.overall_score_5 : null,
      latest_overall_score_5: latestRecord.overall_score_5,
      best_pairing: WineSessionDomain.pickBestPairing(bestRecord || latestRecord),
      final_impression: latestRecord.summary_jp || latestRecord.overall_comment || "",
      repurchase_intent: latestRecord.repurchase_intent || "",
      created_at: existing ? existing.created_at : DateInfra.nowIso(),
      updated_at: DateInfra.nowIso(),
    };
  },

  buildRow: function (aggregate) {
    return {
      session_key: aggregate.session_key,
      wine_name: aggregate.wine_name,
      opened_on: aggregate.opened_on,
      location: aggregate.location,
      type: aggregate.type,
      producer: aggregate.producer,
      country: aggregate.country,
      region: aggregate.region,
      sub_region: aggregate.sub_region,
      vintage: aggregate.vintage,
      record_ids_json: JsonInfra.stringify(aggregate.record_ids),
      latest_record_id: aggregate.latest_record_id,
      latest_open_day: aggregate.latest_open_day,
      days_logged: aggregate.days_logged,
      best_overall_score_5: aggregate.best_overall_score_5,
      latest_overall_score_5: aggregate.latest_overall_score_5,
      best_pairing: aggregate.best_pairing,
      final_impression: aggregate.final_impression,
      repurchase_intent: aggregate.repurchase_intent,
      created_at: aggregate.created_at,
      updated_at: aggregate.updated_at,
    };
  },

  getSession: function (sessionKey) {
    var sessionRow = SheetsInfra.findObjectByColumn(
      APP_CONFIG.sheetNames.wineSession,
      APP_CONFIG.wineSessionColumns,
      "session_key",
      sessionKey
    );

    if (!sessionRow) {
      return null;
    }

    var parsedSession = WineSessionDomain.parseRow(sessionRow);
    var records = WineLogDomain.getActiveRows()
      .filter(function (record) {
        return record.session_key === sessionKey;
      })
      .sort(WineSessionDomain.sortRecordsForSession);

    return {
      session: parsedSession,
      records: records,
    };
  },

  findSession: function (criteria) {
    var targetName = String(criteria.name || "").trim();
    var targetOpenedOn = String(criteria.opened_on || "").trim();
    var targetLocation = String(criteria.location || "").trim();

    if (!targetName) {
      throw ValidationDomain.buildError("name is required", 400);
    }

    var matches = WineSessionDomain.getAllRows().filter(function (session) {
      if (session.wine_name !== targetName) {
        return false;
      }

      if (targetOpenedOn && session.opened_on !== targetOpenedOn) {
        return false;
      }

      if (targetLocation && session.location !== targetLocation) {
        return false;
      }

      return true;
    });

    return SheetsInfra.sortByUpdatedAtDesc(matches);
  },

  sortRecordsForSession: function (left, right) {
    var openedOnCompare = DateInfra.compareIsoLike(left.opened_on, right.opened_on);

    if (openedOnCompare !== 0) {
      return openedOnCompare;
    }

    var openDayLeft = left.open_day === null ? 0 : left.open_day;
    var openDayRight = right.open_day === null ? 0 : right.open_day;

    if (openDayLeft !== openDayRight) {
      return openDayLeft - openDayRight;
    }

    return DateInfra.compareIsoLike(left.updated_at, right.updated_at);
  },

  sortRecordsForLatest: function (left, right) {
    var openDayLeft = left.open_day === null ? 0 : left.open_day;
    var openDayRight = right.open_day === null ? 0 : right.open_day;

    if (openDayLeft !== openDayRight) {
      return openDayLeft - openDayRight;
    }

    return DateInfra.compareIsoLike(left.updated_at, right.updated_at);
  },

  sortRecordsForBest: function (left, right) {
    var scoreLeft = left.overall_score_5 === null ? -1 : left.overall_score_5;
    var scoreRight = right.overall_score_5 === null ? -1 : right.overall_score_5;

    if (scoreLeft !== scoreRight) {
      return scoreLeft - scoreRight;
    }

    return WineSessionDomain.sortRecordsForLatest(left, right);
  },

  pickBestPairing: function (record) {
    if (!record || !record.paired_dishes) {
      return "";
    }

    var categories = ["main", "appetizer", "side", "dessert", "drink_other"];
    var picked = "";

    categories.some(function (category) {
      var dishes = Array.isArray(record.paired_dishes[category]) ? record.paired_dishes[category] : [];

      if (dishes.length > 0) {
        picked = dishes[0];
        return true;
      }

      return false;
    });

    return picked;
  },
};
