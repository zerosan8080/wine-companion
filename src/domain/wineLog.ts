var WineLogDomain = {
  getAllRows: function () {
    var rows = SheetsInfra.readObjects(APP_CONFIG.sheetNames.wineLog, APP_CONFIG.wineLogColumns);
    return rows.map(WineLogDomain.parseRow);
  },

  getActiveRows: function () {
    return WineLogDomain.getAllRows().filter(function (row) {
      return row.deleted_flag !== true;
    });
  },

  findByRecordId: function (recordId) {
    if (!recordId) {
      return null;
    }

    var found = SheetsInfra.findObjectByColumn(
      APP_CONFIG.sheetNames.wineLog,
      APP_CONFIG.wineLogColumns,
      "record_id",
      recordId
    );

    return found ? WineLogDomain.parseRow(found) : null;
  },

  upsertRecord: function (payload) {
    ValidationDomain.validateRecordPayload(payload);

    var existing = payload.record_id ? WineLogDomain.findByRecordId(payload.record_id) : null;
    var normalized = WineLogDomain.normalizeRecord(payload, existing);
    var rowObject = WineLogDomain.buildRow(normalized);
    var actionMode = existing ? "update" : "insert";

    if (existing) {
      SheetsInfra.updateObject(
        APP_CONFIG.sheetNames.wineLog,
        APP_CONFIG.wineLogColumns,
        existing.__rowNumber,
        rowObject
      );
    } else {
      var rowNumber = SheetsInfra.appendObject(
        APP_CONFIG.sheetNames.wineLog,
        APP_CONFIG.wineLogColumns,
        rowObject
      );
      normalized.__rowNumber = rowNumber;
    }

    Logger.log(
      "[WineLog] %s record_id=%s session_key=%s",
      actionMode,
      normalized.record_id,
      normalized.session_key
    );
    console.log(
      JSON.stringify({
        area: "WineLog",
        action: actionMode,
        record_id: normalized.record_id,
        session_key: normalized.session_key,
      })
    );

    return {
      mode: actionMode,
      record: normalized,
    };
  },

  normalizeRecord: function (payload, existing) {
    var rawRecord = JsonInfra.sanitizeRawPayload(payload);
    var now = DateInfra.nowIso();
    var recordId = payload.record_id || (existing && existing.record_id) || IdInfra.generateRecordId();
    var openedOn = payload.opened_on || payload.date;
    var sessionKey =
      payload.session_key ||
      (existing && existing.session_key) ||
      SlugInfra.buildSessionKey(openedOn, payload.name, payload.location);
    var pairedDishes = payload.paired_dishes || {};
    var ratings = payload.ratings || {};
    var scene = payload.scene || {};
    var meta = payload.meta || {};

    return {
      record_id: recordId,
      session_key: sessionKey,
      date: payload.date,
      opened_on: openedOn,
      open_day: Number(payload.open_day),
      type: payload.type,
      name: payload.name,
      vintage: WineLogDomain.toIntegerOrNull(payload.vintage),
      producer: payload.producer || "",
      country: payload.country || "",
      region: payload.region || "",
      sub_region: payload.sub_region || "",
      location: payload.location || "",
      grape_varieties: Array.isArray(payload.grape_varieties) ? payload.grape_varieties : [],
      aroma: Array.isArray(payload.aroma) ? payload.aroma : [],
      paired_dishes: {
        main: WineLogDomain.cloneArray(pairedDishes.main),
        appetizer: WineLogDomain.cloneArray(pairedDishes.appetizer),
        side: WineLogDomain.cloneArray(pairedDishes.side),
        dessert: WineLogDomain.cloneArray(pairedDishes.dessert),
        drink_other: WineLogDomain.cloneArray(pairedDishes.drink_other),
      },
      ratings: {
        color: WineLogDomain.toNumberOrNull(ratings.color),
        aroma: WineLogDomain.toNumberOrNull(ratings.aroma),
        tannin: WineLogDomain.toNumberOrNull(ratings.tannin),
        acidity: WineLogDomain.toNumberOrNull(ratings.acidity),
        fruit: WineLogDomain.toNumberOrNull(ratings.fruit),
      },
      overall_score_5: WineLogDomain.toNumberOrNull(payload.overall_score_5),
      overall_grade: payload.overall_grade || WineLogDomain.scoreToGrade(payload.overall_score_5),
      scene: {
        people: scene.people || "",
        style: scene.style || "",
        mood: scene.mood || "",
      },
      repurchase_intent: payload.repurchase_intent || "未定",
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      overall_comment: payload.overall_comment || "",
      meta: {
        inferred_fields: Array.isArray(meta.inferred_fields) ? meta.inferred_fields : [],
        notes: meta.notes || "",
      },
      summary_jp: payload.summary_jp || "",
      raw_json: JsonInfra.stringify(rawRecord),
      created_at: existing ? existing.created_at : now,
      updated_at: now,
      deleted_flag: false,
      __rowNumber: existing ? existing.__rowNumber : null,
    };
  },

  buildRow: function (record) {
    return {
      record_id: record.record_id,
      session_key: record.session_key,
      date: record.date,
      opened_on: record.opened_on,
      open_day: record.open_day,
      type: record.type,
      name: record.name,
      vintage: record.vintage,
      producer: record.producer,
      country: record.country,
      region: record.region,
      sub_region: record.sub_region,
      location: record.location,
      grape_varieties_json: JsonInfra.stringify(record.grape_varieties),
      aroma_json: JsonInfra.stringify(record.aroma),
      paired_dishes_json: JsonInfra.stringify(record.paired_dishes),
      ratings_color: record.ratings.color,
      ratings_aroma: record.ratings.aroma,
      ratings_tannin: record.ratings.tannin,
      ratings_acidity: record.ratings.acidity,
      ratings_fruit: record.ratings.fruit,
      overall_score_5: record.overall_score_5,
      overall_grade: record.overall_grade,
      scene_people: record.scene.people,
      scene_style: record.scene.style,
      scene_mood: record.scene.mood,
      repurchase_intent: record.repurchase_intent,
      tags_json: JsonInfra.stringify(record.tags),
      overall_comment: record.overall_comment,
      meta_inferred_fields_json: JsonInfra.stringify(record.meta.inferred_fields),
      meta_notes: record.meta.notes,
      summary_jp: record.summary_jp,
      raw_json: record.raw_json,
      created_at: record.created_at,
      updated_at: record.updated_at,
      deleted_flag: record.deleted_flag,
    };
  },

  parseRow: function (row) {
    return {
      record_id: row.record_id,
      session_key: row.session_key,
      date: row.date,
      opened_on: row.opened_on,
      open_day: WineLogDomain.toIntegerOrNull(row.open_day),
      type: row.type,
      name: row.name,
      vintage: WineLogDomain.toIntegerOrNull(row.vintage),
      producer: row.producer,
      country: row.country,
      region: row.region,
      sub_region: row.sub_region,
      location: row.location,
      grape_varieties: JsonInfra.parse(row.grape_varieties_json, []),
      aroma: JsonInfra.parse(row.aroma_json, []),
      paired_dishes: JsonInfra.parse(row.paired_dishes_json, {
        main: [],
        appetizer: [],
        side: [],
        dessert: [],
        drink_other: [],
      }),
      ratings: {
        color: WineLogDomain.toNumberOrNull(row.ratings_color),
        aroma: WineLogDomain.toNumberOrNull(row.ratings_aroma),
        tannin: WineLogDomain.toNumberOrNull(row.ratings_tannin),
        acidity: WineLogDomain.toNumberOrNull(row.ratings_acidity),
        fruit: WineLogDomain.toNumberOrNull(row.ratings_fruit),
      },
      overall_score_5: WineLogDomain.toNumberOrNull(row.overall_score_5),
      overall_grade: row.overall_grade || "",
      scene: {
        people: row.scene_people || "",
        style: row.scene_style || "",
        mood: row.scene_mood || "",
      },
      repurchase_intent: row.repurchase_intent || "",
      tags: JsonInfra.parse(row.tags_json, []),
      overall_comment: row.overall_comment || "",
      meta: {
        inferred_fields: JsonInfra.parse(row.meta_inferred_fields_json, []),
        notes: row.meta_notes || "",
      },
      summary_jp: row.summary_jp || "",
      raw_json: row.raw_json || "",
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      deleted_flag: WineLogDomain.toBoolean(row.deleted_flag),
      __rowNumber: row.__rowNumber,
    };
  },

  listRecentRecords: function (limit) {
    var parsed = WineLogDomain.getActiveRows();
    var sorted = parsed.sort(function (left, right) {
      return DateInfra.compareIsoLike(right.updated_at, left.updated_at);
    });

    return sorted.slice(0, limit);
  },

  cloneArray: function (value) {
    return Array.isArray(value) ? value.slice() : [];
  },

  toIntegerOrNull: function (value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    var numeric = Number(value);
    return Number.isInteger(numeric) ? numeric : null;
  },

  toNumberOrNull: function (value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  },

  toBoolean: function (value) {
    return value === true || value === "TRUE" || value === "true";
  },

  scoreToGrade: function (score) {
    var numericScore = WineLogDomain.toNumberOrNull(score);

    if (numericScore === null) {
      return "";
    }

    if (numericScore >= 4.5) {
      return "A";
    }

    if (numericScore >= 3.5) {
      return "B";
    }

    return "C";
  },

  toApiRecord: function (record) {
    return {
      record_id: record.record_id,
      session_key: record.session_key,
      date: record.date,
      opened_on: record.opened_on,
      open_day: record.open_day,
      type: record.type,
      name: record.name,
      vintage: record.vintage,
      producer: record.producer,
      country: record.country,
      region: record.region,
      sub_region: record.sub_region,
      location: record.location,
      grape_varieties: record.grape_varieties,
      aroma: record.aroma,
      paired_dishes: record.paired_dishes,
      ratings: record.ratings,
      overall_score_5: record.overall_score_5,
      overall_grade: record.overall_grade,
      scene: record.scene,
      repurchase_intent: record.repurchase_intent,
      tags: record.tags,
      overall_comment: record.overall_comment,
      meta: record.meta,
      summary_jp: record.summary_jp,
      raw_json: record.raw_json,
      created_at: record.created_at,
      updated_at: record.updated_at,
      deleted_flag: record.deleted_flag,
    };
  },
};
