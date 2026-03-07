var SheetsInfra = {
  getSpreadsheetId: function () {
    var props = PropertiesService.getScriptProperties();
    var spreadsheetId = props.getProperty(APP_CONFIG.spreadsheetIdProperty);

    if (!spreadsheetId) {
      throw new Error("Missing Script Property: " + APP_CONFIG.spreadsheetIdProperty);
    }

    return spreadsheetId;
  },

  getSpreadsheet: function () {
    return SpreadsheetApp.openById(SheetsInfra.getSpreadsheetId());
  },

  getSheetConfigList: function () {
    return [
      { name: APP_CONFIG.sheetNames.wineLog, columns: APP_CONFIG.wineLogColumns },
      { name: APP_CONFIG.sheetNames.wineSession, columns: APP_CONFIG.wineSessionColumns },
      { name: APP_CONFIG.sheetNames.userProfile, columns: APP_CONFIG.userProfileColumns },
    ];
  },

  ensureAllSheets: function () {
    var spreadsheet = SheetsInfra.getSpreadsheet();
    var configs = SheetsInfra.getSheetConfigList();

    configs.forEach(function (config) {
      SheetsInfra.ensureSheet(spreadsheet, config.name, config.columns);
    });
  },

  ensureSheet: function (spreadsheet, sheetName, columns) {
    var sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    var currentColumns = [];

    if (sheet.getLastRow() > 0) {
      currentColumns = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }

    if (currentColumns.join("|") !== columns.join("|")) {
      sheet.clearContents();
      sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    }

    var headerRange = sheet.getRange(1, 1, 1, columns.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1f2937");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);

    var widthMap = APP_CONFIG.columnWidths[sheetName] || {};
    Object.keys(widthMap).forEach(function (columnNumber) {
      sheet.setColumnWidth(Number(columnNumber), widthMap[columnNumber]);
    });

    return sheet;
  },

  getSheet: function (sheetName) {
    var spreadsheet = SheetsInfra.getSpreadsheet();
    var configs = SheetsInfra.getSheetConfigList();
    var matched = configs.filter(function (config) {
      return config.name === sheetName;
    })[0];

    if (!matched) {
      throw new Error("Unknown sheet: " + sheetName);
    }

    return SheetsInfra.ensureSheet(spreadsheet, sheetName, matched.columns);
  },

  readObjects: function (sheetName, columns) {
    var sheet = SheetsInfra.getSheet(sheetName);
    var lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return [];
    }

    var rows = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();

    return rows.map(function (row, index) {
      return SheetsInfra.rowToObject(columns, row, index + 2);
    });
  },

  rowToObject: function (columns, row, rowNumber) {
    var output = {};

    columns.forEach(function (column, index) {
      output[column] = row[index];
    });

    output.__rowNumber = rowNumber;
    return output;
  },

  appendObject: function (sheetName, columns, object) {
    var sheet = SheetsInfra.getSheet(sheetName);
    var row = SheetsInfra.objectToRow(columns, object);
    sheet.appendRow(row);
    return sheet.getLastRow();
  },

  updateObject: function (sheetName, columns, rowNumber, object) {
    var sheet = SheetsInfra.getSheet(sheetName);
    var row = SheetsInfra.objectToRow(columns, object);
    sheet.getRange(rowNumber, 1, 1, columns.length).setValues([row]);
  },

  objectToRow: function (columns, object) {
    return columns.map(function (column) {
      var value = object[column];
      return value === undefined || value === null ? "" : value;
    });
  },

  findObjectByColumn: function (sheetName, columns, columnName, expectedValue) {
    var rows = SheetsInfra.readObjects(sheetName, columns);

    for (var index = rows.length - 1; index >= 0; index -= 1) {
      if (String(rows[index][columnName]) === String(expectedValue)) {
        return rows[index];
      }
    }

    return null;
  },

  sortByUpdatedAtDesc: function (items) {
    return items.slice().sort(function (left, right) {
      return DateInfra.compareIsoLike(right.updated_at || "", left.updated_at || "");
    });
  },
};
