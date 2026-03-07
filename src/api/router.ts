var ApiRouter = {
  handleRequest: function (method, payload, query) {
    var mergedPayload = ApiRouter.mergePayload(payload, query);
    var action = String(mergedPayload.action || "").trim();

    if (!action) {
      throw ValidationDomain.buildError("action is required", 400);
    }

    ApiRouter.authorize(mergedPayload, query);
    ApiRouter.logRequest(method, action, mergedPayload);

    switch (action) {
      case "health":
        return ApiHandlers.health(mergedPayload);
      case "upsertRecord":
        return ApiHandlers.upsertRecord(mergedPayload);
      case "getRecord":
        return ApiHandlers.getRecord(mergedPayload);
      case "getSession":
        return ApiHandlers.getSession(mergedPayload);
      case "findSession":
        return ApiHandlers.findSession(mergedPayload);
      case "listRecentRecords":
        return ApiHandlers.listRecentRecords(mergedPayload);
      case "rebuildSession":
        return ApiHandlers.rebuildSession(mergedPayload);
      case "rebuildUserProfile":
        return ApiHandlers.rebuildUserProfile(mergedPayload);
      default:
        throw ValidationDomain.buildError("Unknown action: " + action, 400);
    }
  },

  mergePayload: function (payload, query) {
    var output = {};
    var sourcePayload = payload || {};
    var sourceQuery = query || {};

    Object.keys(sourceQuery).forEach(function (key) {
      output[key] = sourceQuery[key];
    });

    Object.keys(sourcePayload).forEach(function (key) {
      output[key] = sourcePayload[key];
    });

    return output;
  },

  authorize: function (payload, query) {
    var scriptApiKey = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.apiKeyProperty);

    if (!scriptApiKey) {
      return;
    }

    var bodyKey = payload && payload._api_key ? payload._api_key : "";
    var queryKey = query && query.api_key ? query.api_key : "";

    if (bodyKey === scriptApiKey || queryKey === scriptApiKey) {
      return;
    }

    throw ValidationDomain.buildError("Invalid API key", 401);
  },

  parsePostPayload: function (e) {
    if (!e || !e.postData || !e.postData.contents) {
      return {};
    }

    return JSON.parse(e.postData.contents);
  },

  jsonResponse: function (body) {
    return ContentService.createTextOutput(JsonInfra.stringify(body)).setMimeType(
      ContentService.MimeType.JSON
    );
  },

  errorResponse: function (error) {
    var code = error && error.code ? error.code : 500;
    var body = {
      status: "error",
      code: code,
      message: String(error && error.message ? error.message : error),
    };

    console.log(JSON.stringify({ area: "ApiRouter", error: body }));
    Logger.log("[ApiRouter] error code=%s message=%s", code, body.message);
    return ApiRouter.jsonResponse(body);
  },

  logRequest: function (method, action, payload) {
    console.log(
      JSON.stringify({
        area: "ApiRouter",
        method: method,
        action: action,
        record_id: payload.record_id || "",
        session_key: payload.session_key || "",
      })
    );
  },
};
