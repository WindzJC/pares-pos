// Google Apps Script for Pares POS sync.
// Bind this script to your Google Sheet (Extensions -> Apps Script).
// Deploy as a Web App and paste the URL into SYNC_CONFIG.endpoint in script.js.

const CONFIG = {
  salesSheet: "Sales",
  summarySheet: "Daily Summary",
  inventorySheet: "Inventory",
  expenseSheet: "Expense",
  secret: ""
};

const SALES_HEADERS = [
  "Date",
  "Time",
  "Sale ID",
  "Customer",
  "Payment",
  "Item",
  "Qty",
  "Price",
  "Line Total",
  "Sale Total",
  "Mode"
];

const SUMMARY_HEADERS = [
  "Date",
  "Sales Count",
  "Items Sold",
  "Gross Total",
  "Cash Total",
  "GCash Total",
  "Foodpanda Total",
  "Last Updated"
];

const INVENTORY_HEADERS = [
  "Date",
  "Category",
  "Item",
  "Price",
  "Stock",
  "Foodpanda Price",
  "Cash Qty",
  "Cash Sales",
  "GCash Qty",
  "GCash Sales",
  "Foodpanda Qty",
  "Foodpanda Sales",
  "Total Qty",
  "Total Sales"
];

const EXPENSE_HEADERS = [
  "Date",
  "Time",
  "Amount",
  "Category",
  "Notes",
  "Expense ID"
];

function doPost(e) {
  const payload = parsePayload(e);
  if (!payload) {
    return jsonResponse({ ok: false, error: "Invalid payload" });
  }
  if (CONFIG.secret && payload.secret !== CONFIG.secret) {
    return jsonResponse({ ok: false, error: "Unauthorized" });
  }

  try {
    switch (payload.type) {
      case "sale":
        handleSale(payload.data);
        break;
      case "inventory_snapshot":
        handleInventorySnapshot(payload.data);
        break;
      case "expense":
        handleExpense(payload.data);
        break;
      default:
        return jsonResponse({ ok: false, error: "Unknown type" });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }

  return jsonResponse({ ok: true });
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return null;
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return null;
  }
}

function handleSale(data) {
  if (!data || !data.sale) {
    return;
  }
  const sale = data.sale;
  const mode = String(data.mode || "sale").toLowerCase();
  const multiplier = mode === "void" ? -1 : 1;
  const date = sale.localDate || formatDate(new Date(sale.paidAt));
  const time = sale.localTime || formatTime(new Date(sale.paidAt));
  const payment = String(sale.paymentMethod || "cash").toUpperCase();
  const saleTotal = toNumber(sale.totalDue) * multiplier;
  const lines = Array.isArray(sale.lines) ? sale.lines : [];

  const sheet = getOrCreateSheet(CONFIG.salesSheet, SALES_HEADERS);
  const rows = [];

  if (lines.length === 0) {
    rows.push([
      date,
      time,
      sale.id || "",
      sale.customerNumber || "",
      payment,
      "",
      0,
      0,
      0,
      saleTotal,
      mode.toUpperCase()
    ]);
  } else {
    lines.forEach((line) => {
      const qty = toNumber(line.qty) * multiplier;
      const price = toNumber(line.price);
      const lineTotal = price * toNumber(line.qty) * multiplier;
      rows.push([
        date,
        time,
        sale.id || "",
        sale.customerNumber || "",
        payment,
        line.name || "",
        qty,
        price,
        lineTotal,
        saleTotal,
        mode.toUpperCase()
      ]);
    });
  }

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  updateDailySummary(date, payment, saleTotal, lines, multiplier);
}

function handleInventorySnapshot(data) {
  if (!data || !Array.isArray(data.rows)) {
    return;
  }
  const sheet = getOrCreateSheet(CONFIG.inventorySheet, INVENTORY_HEADERS);
  const values = data.rows.map((entry) => [
    entry.date || data.date || "",
    entry.category || "",
    entry.name || "",
    toNumber(entry.price),
    entry.stock === null || entry.stock === undefined ? "" : toNumber(entry.stock),
    entry.foodpandaPrice === null || entry.foodpandaPrice === undefined
      ? ""
      : toNumber(entry.foodpandaPrice),
    toNumber(entry.cashQty),
    toNumber(entry.cashSales),
    toNumber(entry.gcashQty),
    toNumber(entry.gcashSales),
    toNumber(entry.foodpandaQty),
    toNumber(entry.foodpandaSales),
    toNumber(entry.totalQty),
    toNumber(entry.totalSales)
  ]);

  if (values.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  }
}

function handleExpense(data) {
  if (!data) {
    return;
  }
  const sheet = getOrCreateSheet(CONFIG.expenseSheet, EXPENSE_HEADERS);
  const row = [
    data.date || "",
    data.localTime || formatTime(new Date(data.createdAt)),
    toNumber(data.amount),
    data.category || "",
    data.notes || "",
    data.id || ""
  ];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function updateDailySummary(date, payment, saleTotal, lines, multiplier) {
  const sheet = getOrCreateSheet(CONFIG.summarySheet, SUMMARY_HEADERS);
  const row = findOrCreateSummaryRow(sheet, date);
  const values = sheet.getRange(row, 1, 1, SUMMARY_HEADERS.length).getValues()[0];

  const salesCount = toNumber(values[1]) + multiplier;
  const itemsSold = toNumber(values[2]) + sumLineQty(lines) * multiplier;
  const grossTotal = toNumber(values[3]) + saleTotal;
  let cashTotal = toNumber(values[4]);
  let gcashTotal = toNumber(values[5]);
  let foodpandaTotal = toNumber(values[6]);

  if (payment === "GCASH") {
    gcashTotal += saleTotal;
  } else if (payment === "FOODPANDA") {
    foodpandaTotal += saleTotal;
  } else {
    cashTotal += saleTotal;
  }

  const updated = [
    date,
    salesCount,
    itemsSold,
    grossTotal,
    cashTotal,
    gcashTotal,
    foodpandaTotal,
    new Date()
  ];
  sheet.getRange(row, 1, 1, SUMMARY_HEADERS.length).setValues([updated]);
}

function findOrCreateSummaryRow(sheet, date) {
  const finder = sheet.createTextFinder(date).matchEntireCell(true).findNext();
  if (finder) {
    return finder.getRow();
  }
  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, SUMMARY_HEADERS.length).setValues([
    [date, 0, 0, 0, 0, 0, 0, ""]
  ]);
  return nextRow;
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const current = headerRange.getValues()[0];
  const isEmpty = current.every((cell) => cell === "");
  if (sheet.getLastRow() === 0 || isEmpty) {
    headerRange.setValues([headers]);
  }
  return sheet;
}

function sumLineQty(lines) {
  if (!Array.isArray(lines)) {
    return 0;
  }
  return lines.reduce((sum, line) => sum + toNumber(line.qty), 0);
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "HH:mm");
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
