import fs from "node:fs";
import path from "node:path";

const ALLOWED_WINE_TYPES = new Set([
  "Red",
  "White",
  "Rose",
  "Sparkling",
  "Orange",
  "Cider",
  "Sake",
  "Other",
]);

const PAIRING_KEYS = ["main", "appetizer", "side", "dessert", "drink_other"];
const RATING_KEYS = ["color", "aroma", "tannin", "acidity", "fruit"];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), options.input);
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  if (!Array.isArray(source)) {
    throw new Error("Input JSON must be an array of legacy records.");
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const normalizedEntries = source.map((record, index) => normalizeLegacyRecord(record, index));
  const readyEntries = normalizedEntries.filter((entry) => entry.status === "ready");
  const reviewEntries = normalizedEntries.filter((entry) => entry.status === "needs_review");
  const report = buildReport(normalizedEntries, options, inputPath);

  writeJson(path.join(outputDir, "normalized-records.json"), normalizedEntries);
  writeJson(
    path.join(outputDir, "ready-records.json"),
    readyEntries.map((entry) => entry.record)
  );
  writeJson(path.join(outputDir, "needs-review.json"), reviewEntries);
  writeJson(path.join(outputDir, "report.json"), report);

  console.log(`Processed ${normalizedEntries.length} legacy records.`);
  console.log(`Ready: ${readyEntries.length}`);
  console.log(`Needs review: ${reviewEntries.length}`);
  console.log(`Output: ${path.relative(process.cwd(), outputDir)}`);

  if (!options.push) {
    return;
  }

  const endpoint = options.endpoint;
  const apiKey = options.apiKey;

  if (!endpoint) {
    throw new Error("--endpoint is required when --push is used.");
  }

  if (!apiKey) {
    throw new Error("--api-key is required when --push is used.");
  }

  const importResults = [];
  const importTarget = readyEntries.slice(0, options.limit || readyEntries.length);

  for (const entry of importTarget) {
    const payload = {
      ...entry.record,
      _api_key: apiKey,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    let bodyJson = null;

    try {
      bodyJson = JSON.parse(bodyText);
    } catch (error) {
      bodyJson = {
        parse_error: true,
        raw_body: bodyText,
      };
    }

    const importResult = {
      source_index: entry.source_index,
      record_name: entry.record.name,
      session_key: entry.record.session_key,
      status: response.ok ? "ok" : "error",
      http_status: response.status,
      response: bodyJson,
    };

    importResults.push(importResult);
    console.log(
      `${importResult.status.toUpperCase()} [${entry.source_index}] ${entry.record.name} (${response.status})`
    );

    if (options.stopOnError && importResult.status === "error") {
      break;
    }
  }

  writeJson(path.join(outputDir, "import-results.json"), importResults);
}

function parseArgs(argv) {
  const options = {
    input: "",
    outputDir: "migration-output",
    push: false,
    endpoint: "",
    apiKey: "",
    limit: 0,
    stopOnError: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      options.input = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = argv[index + 1] || options.outputDir;
      index += 1;
      continue;
    }

    if (arg === "--endpoint") {
      options.endpoint = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--api-key") {
      options.apiKey = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || "0");
      index += 1;
      continue;
    }

    if (arg === "--push") {
      options.push = true;
      continue;
    }

    if (arg === "--stop-on-error") {
      options.stopOnError = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.input) {
    throw new Error("Usage: node scripts/import-legacy-records.mjs --input <file> [--output-dir <dir>] [--push --endpoint <url> --api-key <key>]");
  }

  return options;
}

function normalizeLegacyRecord(record, index) {
  const warnings = [];
  const blockers = [];
  const raw = isPlainObject(record) ? record : {};
  const dateFromInput = normalizeDate(raw.date);
  const openedOnFromInput = normalizeDate(raw.opened_on);
  const date = dateFromInput || openedOnFromInput;
  const openedOn = openedOnFromInput || dateFromInput;
  const rawName = cleanString(raw.name);
  const rawLocation = cleanString(raw.location);
  const recordId = cleanString(raw.record_id) || null;
  const openDay = normalizePositiveInteger(raw.open_day);
  const type = cleanString(raw.type);
  const grapeVarieties = normalizeGrapeVarieties(raw.grape_varieties, warnings);
  const aroma = normalizeStringArray(raw.aroma);
  const tags = normalizeStringArray(raw.tags);
  const pairedDishes = normalizePairedDishes(raw.paired_dishes);
  const ratings = normalizeRatings(raw.ratings, blockers);
  const summary = cleanString(raw.summary_jp);
  const overallComment = cleanString(raw.overall_comment);
  const sessionKey =
    cleanString(raw.session_key) || buildSessionKey(openedOn || date, rawName, rawLocation);

  if (cleanString(raw.action) && cleanString(raw.action) !== "upsertRecord") {
    warnings.push(buildIssue("legacy_action_rewritten", `action '${raw.action}' was rewritten to 'upsertRecord'.`));
  }

  if (!date) {
    blockers.push(buildIssue("missing_date", "date is required for migration into the current API."));
  } else if (!dateFromInput && openedOnFromInput) {
    warnings.push(buildIssue("date_filled_from_opened_on", "date was blank and has been filled from opened_on."));
  }

  if (!openedOn) {
    blockers.push(buildIssue("missing_opened_on", "opened_on is required for migration into the current API."));
  } else if (!openedOnFromInput && dateFromInput) {
    warnings.push(buildIssue("opened_on_filled_from_date", "opened_on was blank and has been filled from date."));
  }

  if (!rawName) {
    blockers.push(buildIssue("missing_name", "name is required."));
  }

  if (openDay === null) {
    blockers.push(buildIssue("invalid_open_day", "open_day must be an integer greater than or equal to 1."));
  }

  if (!ALLOWED_WINE_TYPES.has(type)) {
    blockers.push(
      buildIssue(
        "invalid_type",
        `type must be one of ${Array.from(ALLOWED_WINE_TYPES).join(", ")}.`
      )
    );
  }

  const vintage = normalizeNullableInteger(raw.vintage, "vintage", blockers);
  const overallScore = normalizeNullableNumber(raw.overall_score_5, "overall_score_5", blockers);
  const scene = normalizeScene(raw.scene);
  const meta = normalizeMeta(raw.meta);
  const cleanedRecord = {
    action: "upsertRecord",
    record_id: recordId,
    session_key: sessionKey,
    date: date || "",
    opened_on: openedOn || "",
    open_day: openDay,
    type,
    name: rawName,
    vintage,
    producer: cleanString(raw.producer),
    country: cleanString(raw.country),
    region: cleanString(raw.region),
    sub_region: cleanString(raw.sub_region),
    location: rawLocation,
    grape_varieties: grapeVarieties,
    aroma,
    paired_dishes: pairedDishes,
    ratings,
    overall_score_5: overallScore,
    overall_grade: cleanString(raw.overall_grade) || null,
    scene,
    repurchase_intent: cleanString(raw.repurchase_intent) || "未定",
    tags,
    overall_comment: overallComment,
    meta,
    summary_jp: summary,
  };

  if (raw.record_id === null || raw.record_id === undefined || cleanString(raw.record_id) === "") {
    warnings.push(buildIssue("missing_record_id", "record_id is blank and will be generated by the API."));
  }

  if (cleanString(raw.session_key).startsWith("unknown_")) {
    warnings.push(buildIssue("unknown_session_key", "session_key uses an unknown placeholder. Review if a better session grouping is available."));
  }

  if (grapeVarieties.length === 0 && Array.isArray(raw.grape_varieties) && raw.grape_varieties.length > 0) {
    warnings.push(buildIssue("empty_grape_varieties_removed", "Blank grape variety entries were removed."));
  }

  return {
    source_index: index,
    source_action: cleanString(raw.action) || null,
    status: blockers.length > 0 ? "needs_review" : "ready",
    blockers,
    warnings,
    record: cleanedRecord,
  };
}

function normalizeGrapeVarieties(value, warnings) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const nameFromString = cleanString(item);
        return nameFromString ? { name: nameFromString, percent: null } : null;
      }

      if (!isPlainObject(item)) {
        warnings.push(buildIssue("invalid_grape_variety_entry", "Non-object grape variety entry was removed."));
        return null;
      }

      const name = cleanString(item.name);
      if (!name) {
        return null;
      }

      return {
        name,
        percent: normalizeNullableNumber(item.percent, "grape_variety.percent", []),
      };
    })
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanString(item))
    .filter((item) => item !== "");
}

function normalizePairedDishes(value) {
  const source = isPlainObject(value) ? value : {};
  const output = {};

  PAIRING_KEYS.forEach((key) => {
    output[key] = normalizeStringArray(source[key]);
  });

  return output;
}

function normalizeRatings(value, blockers) {
  const source = isPlainObject(value) ? value : {};
  const output = {};

  RATING_KEYS.forEach((key) => {
    output[key] = normalizeNullableNumber(source[key], `ratings.${key}`, blockers);
  });

  return output;
}

function normalizeScene(value) {
  const source = isPlainObject(value) ? value : {};

  return {
    people: cleanString(source.people),
    style: cleanString(source.style),
    mood: cleanString(source.mood),
  };
}

function normalizeMeta(value) {
  const source = isPlainObject(value) ? value : {};

  return {
    inferred_fields: normalizeStringArray(source.inferred_fields),
    notes: cleanString(source.notes),
  };
}

function normalizeDate(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function normalizePositiveInteger(value) {
  if (value === null || value === undefined || cleanString(value) === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function normalizeNullableInteger(value, label, blockers) {
  if (value === null || value === undefined || cleanString(value) === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    blockers.push(buildIssue(`invalid_${label}`, `${label} must be an integer or null.`));
    return null;
  }

  return parsed;
}

function normalizeNullableNumber(value, label, blockers) {
  if (value === null || value === undefined || cleanString(value) === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    blockers.push(buildIssue(`invalid_${label}`, `${label} must be a number or null.`));
    return null;
  }

  return parsed;
}

function buildSessionKey(date, name, location) {
  const normalizedDate = date || "unknown";
  const normalizedName = slugify(name || "unknown-wine");
  const normalizedLocation = slugify(location || "unknown-location");
  return `${normalizedDate}_${normalizedName}_${normalizedLocation}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value) || typeof value === "object") {
    return "";
  }

  return String(value).trim();
}

function buildIssue(code, message) {
  return { code, message };
}

function buildReport(entries, options, inputPath) {
  const issueCounts = {};

  entries.forEach((entry) => {
    [...entry.blockers, ...entry.warnings].forEach((issue) => {
      issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
    });
  });

  return {
    generated_at: new Date().toISOString(),
    source_file: path.relative(process.cwd(), inputPath),
    output_mode: options.push ? "prepare_and_push" : "prepare_only",
    total_records: entries.length,
    ready_records: entries.filter((entry) => entry.status === "ready").length,
    review_records: entries.filter((entry) => entry.status === "needs_review").length,
    issue_counts: issueCounts,
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
