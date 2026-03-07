var UserProfileDomain = {
  getCurrentProfile: function () {
    var row = SheetsInfra.findObjectByColumn(
      APP_CONFIG.sheetNames.userProfile,
      APP_CONFIG.userProfileColumns,
      "profile_key",
      APP_CONFIG.defaultProfileKey
    );

    if (!row) {
      return null;
    }

    return UserProfileDomain.parseRow(row);
  },

  parseRow: function (row) {
    return {
      profile_key: row.profile_key,
      favorite_types_json: row.favorite_types_json || "[]",
      favorite_types: JsonInfra.parse(row.favorite_types_json, []),
      preferred_grapes_json: row.preferred_grapes_json || "[]",
      preferred_grapes: JsonInfra.parse(row.preferred_grapes_json, []),
      rating_pattern_json: row.rating_pattern_json || "{}",
      rating_pattern: JsonInfra.parse(row.rating_pattern_json, {}),
      best_pairings_json: row.best_pairings_json || "[]",
      best_pairings: JsonInfra.parse(row.best_pairings_json, []),
      avoid_patterns_json: row.avoid_patterns_json || "[]",
      avoid_patterns: JsonInfra.parse(row.avoid_patterns_json, []),
      top_regions_json: row.top_regions_json || "[]",
      top_regions: JsonInfra.parse(row.top_regions_json, []),
      top_producers_json: row.top_producers_json || "[]",
      top_producers: JsonInfra.parse(row.top_producers_json, []),
      summary: row.summary || "",
      source_record_count: WineLogDomain.toIntegerOrNull(row.source_record_count) || 0,
      updated_at: row.updated_at || "",
      __rowNumber: row.__rowNumber,
    };
  },

  rebuildProfile: function () {
    var records = WineLogDomain.getActiveRows();
    var existing = UserProfileDomain.getCurrentProfile();
    var aggregate = UserProfileDomain.buildAggregate(records, existing);
    var rowObject = UserProfileDomain.buildRow(aggregate);

    if (existing) {
      SheetsInfra.updateObject(
        APP_CONFIG.sheetNames.userProfile,
        APP_CONFIG.userProfileColumns,
        existing.__rowNumber,
        rowObject
      );
    } else {
      SheetsInfra.appendObject(APP_CONFIG.sheetNames.userProfile, APP_CONFIG.userProfileColumns, rowObject);
    }

    console.log(
      JSON.stringify({
        area: "UserProfile",
        action: "rebuild",
        source_record_count: aggregate.source_record_count,
      })
    );

    return aggregate;
  },

  buildAggregate: function (records) {
    var highlyRated = records.filter(function (record) {
      return record.overall_score_5 !== null && record.overall_score_5 >= 4.0;
    });
    var lowRated = records.filter(function (record) {
      return record.overall_score_5 !== null && record.overall_score_5 < 3.0;
    });
    var favoriteTypes = UserProfileDomain.aggregateSimpleField(highlyRated, "type");
    var preferredGrapes = UserProfileDomain.aggregateGrapes(highlyRated);
    var bestPairings = UserProfileDomain.aggregatePairings(highlyRated);
    var avoidPatterns = UserProfileDomain.aggregateAvoidPatterns(lowRated);
    var topRegions = UserProfileDomain.aggregateSimpleField(records, "region");
    var topProducers = UserProfileDomain.aggregateSimpleField(records, "producer");

    return {
      profile_key: APP_CONFIG.defaultProfileKey,
      favorite_types: favoriteTypes,
      preferred_grapes: preferredGrapes,
      rating_pattern: UserProfileDomain.aggregateRatings(records),
      best_pairings: bestPairings,
      avoid_patterns: avoidPatterns,
      top_regions: topRegions,
      top_producers: topProducers,
      summary: UserProfileDomain.buildSummary(favoriteTypes, preferredGrapes, bestPairings, avoidPatterns),
      source_record_count: records.length,
      updated_at: DateInfra.nowIso(),
    };
  },

  buildRow: function (aggregate) {
    return {
      profile_key: aggregate.profile_key,
      favorite_types_json: JsonInfra.stringify(aggregate.favorite_types),
      preferred_grapes_json: JsonInfra.stringify(aggregate.preferred_grapes),
      rating_pattern_json: JsonInfra.stringify(aggregate.rating_pattern),
      best_pairings_json: JsonInfra.stringify(aggregate.best_pairings),
      avoid_patterns_json: JsonInfra.stringify(aggregate.avoid_patterns),
      top_regions_json: JsonInfra.stringify(aggregate.top_regions),
      top_producers_json: JsonInfra.stringify(aggregate.top_producers),
      summary: aggregate.summary,
      source_record_count: aggregate.source_record_count,
      updated_at: aggregate.updated_at,
    };
  },

  aggregateSimpleField: function (records, fieldName) {
    var bucket = {};

    records.forEach(function (record) {
      var name = String(record[fieldName] || "").trim();

      if (!name) {
        return;
      }

      if (!bucket[name]) {
        bucket[name] = { name: name, count: 0, scoreTotal: 0, scoreCount: 0 };
      }

      bucket[name].count += 1;

      if (record.overall_score_5 !== null) {
        bucket[name].scoreTotal += record.overall_score_5;
        bucket[name].scoreCount += 1;
      }
    });

    return UserProfileDomain.bucketToRankedArray(bucket);
  },

  aggregateGrapes: function (records) {
    var bucket = {};

    records.forEach(function (record) {
      record.grape_varieties.forEach(function (grape) {
        var name = typeof grape === "string" ? grape : grape && grape.name;

        if (!name) {
          return;
        }

        if (!bucket[name]) {
          bucket[name] = { name: name, count: 0, scoreTotal: 0, scoreCount: 0 };
        }

        bucket[name].count += 1;

        if (record.overall_score_5 !== null) {
          bucket[name].scoreTotal += record.overall_score_5;
          bucket[name].scoreCount += 1;
        }
      });
    });

    return UserProfileDomain.bucketToRankedArray(bucket);
  },

  aggregatePairings: function (records) {
    var bucket = {};

    records.forEach(function (record) {
      UserProfileDomain.listPairings(record).forEach(function (pairing) {
        if (!bucket[pairing]) {
          bucket[pairing] = { name: pairing, count: 0, scoreTotal: 0, scoreCount: 0 };
        }

        bucket[pairing].count += 1;

        if (record.overall_score_5 !== null) {
          bucket[pairing].scoreTotal += record.overall_score_5;
          bucket[pairing].scoreCount += 1;
        }
      });
    });

    return UserProfileDomain.bucketToRankedArray(bucket);
  },

  aggregateAvoidPatterns: function (records) {
    var bucket = {};

    records.forEach(function (record) {
      UserProfileDomain.addBucketItem(bucket, "type:" + record.type, record.overall_score_5);
      record.grape_varieties.forEach(function (grape) {
        var name = typeof grape === "string" ? grape : grape && grape.name;
        if (name) {
          UserProfileDomain.addBucketItem(bucket, "grape:" + name, record.overall_score_5);
        }
      });
      UserProfileDomain.listPairings(record).forEach(function (pairing) {
        UserProfileDomain.addBucketItem(bucket, "pairing:" + pairing, record.overall_score_5);
      });

      if (record.region) {
        UserProfileDomain.addBucketItem(bucket, "region:" + record.region, record.overall_score_5);
      }

      if (record.producer) {
        UserProfileDomain.addBucketItem(bucket, "producer:" + record.producer, record.overall_score_5);
      }
    });

    return UserProfileDomain.bucketToRankedArray(bucket);
  },

  addBucketItem: function (bucket, name, score) {
    if (!name || name === "type:" || name === "region:" || name === "producer:") {
      return;
    }

    if (!bucket[name]) {
      bucket[name] = { name: name, count: 0, scoreTotal: 0, scoreCount: 0 };
    }

    bucket[name].count += 1;

    if (score !== null) {
      bucket[name].scoreTotal += score;
      bucket[name].scoreCount += 1;
    }
  },

  listPairings: function (record) {
    var paired = record.paired_dishes || {};
    var categories = ["main", "appetizer", "side", "dessert", "drink_other"];
    var values = [];

    categories.forEach(function (category) {
      var dishes = Array.isArray(paired[category]) ? paired[category] : [];
      dishes.forEach(function (dish) {
        if (dish) {
          values.push(dish);
        }
      });
    });

    return values;
  },

  aggregateRatings: function (records) {
    var fields = ["color", "aroma", "tannin", "acidity", "fruit"];
    var result = {
      color: null,
      aroma: null,
      tannin: null,
      acidity: null,
      fruit: null,
      overall_avg: null,
    };

    fields.forEach(function (fieldName) {
      result[fieldName] = UserProfileDomain.averageFromRecords(records, function (record) {
        return record.ratings[fieldName];
      });
    });

    result.overall_avg = UserProfileDomain.averageFromRecords(records, function (record) {
      return record.overall_score_5;
    });

    return result;
  },

  averageFromRecords: function (records, picker) {
    var total = 0;
    var count = 0;

    records.forEach(function (record) {
      var value = picker(record);

      if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
        total += Number(value);
        count += 1;
      }
    });

    if (count === 0) {
      return null;
    }

    return Math.round((total / count) * 100) / 100;
  },

  bucketToRankedArray: function (bucket) {
    return Object.keys(bucket)
      .map(function (key) {
        var entry = bucket[key];
        return {
          name: entry.name,
          count: entry.count,
          avg_score: entry.scoreCount > 0 ? Math.round((entry.scoreTotal / entry.scoreCount) * 100) / 100 : null,
        };
      })
      .sort(function (left, right) {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        var leftScore = left.avg_score === null ? -1 : left.avg_score;
        var rightScore = right.avg_score === null ? -1 : right.avg_score;

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, 10);
  },

  buildSummary: function (favoriteTypes, preferredGrapes, bestPairings, avoidPatterns) {
    var segments = [];

    segments.push(
      favoriteTypes.length > 0
        ? "好みのタイプは " + favoriteTypes.slice(0, 3).map(UserProfileDomain.nameOnly).join("、") + " です。"
        : "好みのタイプはまだ十分に集計できていません。"
    );
    segments.push(
      preferredGrapes.length > 0
        ? "好みのブドウは " + preferredGrapes.slice(0, 3).map(UserProfileDomain.nameOnly).join("、") + " です。"
        : "好みのブドウはまだ十分に集計できていません。"
    );
    segments.push(
      bestPairings.length > 0
        ? "相性が良い料理は " + bestPairings.slice(0, 3).map(UserProfileDomain.nameOnly).join("、") + " です。"
        : "相性の良い料理はまだ十分に集計できていません。"
    );
    segments.push(
      avoidPatterns.length > 0
        ? "低評価傾向として " + avoidPatterns.slice(0, 3).map(UserProfileDomain.nameOnly).join("、") + " が見られます。"
        : "明確な低評価傾向はまだ見つかっていません。"
    );

    return segments.join(" ");
  },

  nameOnly: function (entry) {
    return entry.name;
  },
};
