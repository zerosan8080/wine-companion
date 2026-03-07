var JsonInfra = {
  stringify: function (value) {
    return JSON.stringify(value === undefined ? null : value);
  },

  parse: function (value, fallback) {
    if (value === "" || value === null || value === undefined) {
      return fallback;
    }

    if (typeof value !== "string") {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  },

  deepClone: function (value) {
    return JsonInfra.parse(JsonInfra.stringify(value), null);
  },

  sanitizeRawPayload: function (payload) {
    var cloned = JsonInfra.deepClone(payload) || {};

    if (cloned && typeof cloned === "object" && Object.prototype.hasOwnProperty.call(cloned, "_api_key")) {
      delete cloned._api_key;
    }

    return cloned;
  },
};
