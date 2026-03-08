var DateInfra = {
  nowIso: function () {
    return Utilities.formatDate(new Date(), APP_CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  },

  toDateOnlyString: function (value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return Utilities.formatDate(value, APP_CONFIG.timezone, "yyyy-MM-dd");
    }

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value.slice(0, 10);
    }

    return value ? String(value) : "";
  },

  toComparableString: function (value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return Utilities.formatDate(value, APP_CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
    }

    return value ? String(value) : "";
  },

  isDateString: function (value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  },

  compareIsoLike: function (left, right) {
    var leftValue = DateInfra.toComparableString(left);
    var rightValue = DateInfra.toComparableString(right);

    if (leftValue === rightValue) {
      return 0;
    }

    return leftValue > rightValue ? 1 : -1;
  },
};
