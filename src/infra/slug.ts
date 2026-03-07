var SlugInfra = {
  slugify: function (value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  },

  buildSessionKey: function (openedOn, name, location) {
    var datePart = openedOn || "";
    var namePart = SlugInfra.slugify(name || "");
    var locationPart = SlugInfra.slugify(location || "");
    var parts = [datePart, namePart, locationPart].filter(function (part) {
      return part !== "";
    });
    var built = parts.join("_");

    return built || IdInfra.generateRecordId();
  },
};
