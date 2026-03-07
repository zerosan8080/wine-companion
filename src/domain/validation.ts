var ValidationDomain = {
  assertActionPresent: function (payload) {
    if (!payload || typeof payload.action !== "string" || payload.action.trim() === "") {
      throw ValidationDomain.buildError("action is required", 400);
    }
  },

  validateRecordPayload: function (payload) {
    var errors = [];
    var requiredFields = ["date", "opened_on", "type", "name"];

    requiredFields.forEach(function (fieldName) {
      if (!payload || payload[fieldName] === undefined || payload[fieldName] === null || payload[fieldName] === "") {
        errors.push(fieldName + " is required");
      }
    });

    if (!DateInfra.isDateString(payload.date)) {
      errors.push("date must be YYYY-MM-DD");
    }

    if (!DateInfra.isDateString(payload.opened_on)) {
      errors.push("opened_on must be YYYY-MM-DD");
    }

    if (!Number.isInteger(Number(payload.open_day)) || Number(payload.open_day) < 1) {
      errors.push("open_day must be an integer >= 1");
    }

    if (APP_CONFIG.allowedWineTypes.indexOf(payload.type) === -1) {
      errors.push("type must be one of: " + APP_CONFIG.allowedWineTypes.join(", "));
    }

    ValidationDomain.assertOptionalInteger(payload.vintage, "vintage", errors);
    ValidationDomain.assertOptionalNumber(payload.overall_score_5, "overall_score_5", errors);
    ValidationDomain.assertArray(payload.aroma, "aroma", errors);
    ValidationDomain.assertArray(payload.tags, "tags", errors);
    ValidationDomain.assertArray(payload.meta && payload.meta.inferred_fields, "meta.inferred_fields", errors);
    ValidationDomain.assertArray(payload.grape_varieties, "grape_varieties", errors);
    ValidationDomain.assertRatings(payload.ratings, errors);
    ValidationDomain.assertPairedDishes(payload.paired_dishes, errors);
    ValidationDomain.assertScene(payload.scene, errors);

    if (errors.length > 0) {
      throw ValidationDomain.buildError(errors.join("; "), 400);
    }
  },

  assertOptionalInteger: function (value, label, errors) {
    if (value === null || value === undefined || value === "") {
      return;
    }

    if (!Number.isInteger(Number(value))) {
      errors.push(label + " must be an integer or null");
    }
  },

  assertOptionalNumber: function (value, label, errors) {
    if (value === null || value === undefined || value === "") {
      return;
    }

    if (!Number.isFinite(Number(value))) {
      errors.push(label + " must be a number or null");
    }
  },

  assertArray: function (value, label, errors) {
    if (value === null || value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      errors.push(label + " must be an array");
    }
  },

  assertRatings: function (ratings, errors) {
    if (ratings === null || ratings === undefined) {
      return;
    }

    if (typeof ratings !== "object" || Array.isArray(ratings)) {
      errors.push("ratings must be an object");
      return;
    }

    ["color", "aroma", "tannin", "acidity", "fruit"].forEach(function (key) {
      ValidationDomain.assertOptionalNumber(ratings[key], "ratings." + key, errors);
    });
  },

  assertPairedDishes: function (pairedDishes, errors) {
    if (pairedDishes === null || pairedDishes === undefined) {
      return;
    }

    if (typeof pairedDishes !== "object" || Array.isArray(pairedDishes)) {
      errors.push("paired_dishes must be an object");
      return;
    }

    ["main", "appetizer", "side", "dessert", "drink_other"].forEach(function (key) {
      ValidationDomain.assertArray(pairedDishes[key], "paired_dishes." + key, errors);
    });
  },

  assertScene: function (scene, errors) {
    if (scene === null || scene === undefined) {
      return;
    }

    if (typeof scene !== "object" || Array.isArray(scene)) {
      errors.push("scene must be an object");
    }
  },

  buildError: function (message, code) {
    var error = new Error(message);
    error.code = code;
    return error;
  },
};
