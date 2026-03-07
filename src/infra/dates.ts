var DateInfra = {
  nowIso: function () {
    return Utilities.formatDate(new Date(), APP_CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  },

  isDateString: function (value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  },

  compareIsoLike: function (left, right) {
    var leftValue = left || "";
    var rightValue = right || "";

    if (leftValue === rightValue) {
      return 0;
    }

    return leftValue > rightValue ? 1 : -1;
  },
};
