const SECRET = "CHANGE_ME_TO_A_LONG_RANDOM_SECRET";
const SPREADSHEET_ID = "1Ypo-2ithFjMr8QylqQBJfqYbHNVM1sIzf3NCE0VWjaM";

/* =========================
   GET TEST
========================= */
function doGet() {
  return json({
    ok: true,
    status: "running",
    service: "GOPASS"
  });
}

/* =========================
   RECEIVE DATA
========================= */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: "no_post_data" });
    }

    const data = JSON.parse(e.postData.contents || "{}");

    if (SECRET && data.secret !== SECRET) {
      return json({ ok: false, error: "invalid_secret" });
    }

    if (!data.id) {
      return json({ ok: false, error: "missing_order_id" });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    saveMember(ss, data);
    upsertOrder(ss, data);
    upsertReceipt(ss, data);
    upsertRealtime(ss, data);

    SpreadsheetApp.flush();

    return json({
      ok: true,
      message: "saved",
      orderId: data.id
    });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

function saveMember(ss, data) {
  const sh = getSheet(ss, "Members", ["เวลา", "ชื่อผู้ซื้อ", "โทรศัพท์", "Email", "Discord", "Roblox"]);
  // Members are intentionally appended so every completed buyer submission is kept.
  sh.appendRow([
    new Date(),
    data.name || "",
    data.phone || "",
    data.email || "",
    data.discord || "",
    data.roblox || ""
  ]);
}

function upsertOrder(ss, data) {
  const sh = getSheet(ss, "Orders", [
    "เวลา", "OrderID", "คิว", "งาน", "บัตร", "จำนวน", "ราคา", "รวม"
  ]);
  upsertByOrderId(sh, data.id, [
    new Date(),
    data.id || "",
    data.queueCode || "",
    data.eventName || "",
    data.ticketName || "",
    data.qty || 0,
    data.unitPrice || 0,
    data.total || 0
  ], 2);
}

function upsertReceipt(ss, data) {
  const sh = getSheet(ss, "Receipts", ["เวลา", "OrderID", "Email", "ยอดรวม"]);
  upsertByOrderId(sh, data.id, [
    new Date(),
    data.id || "",
    data.email || "",
    data.total || 0
  ], 2);
}

function upsertRealtime(ss, data) {
  const sh = getSheet(ss, "Realtime", ["อัปเดตล่าสุด", "OrderID", "Email", "ยอดรวม"]);
  // Keep Realtime as a one-row snapshot.
  sh.clearContents();
  sh.appendRow(["อัปเดตล่าสุด", "OrderID", "Email", "ยอดรวม"]);
  sh.appendRow([
    new Date(),
    data.id || "",
    data.email || "",
    data.total || 0
  ]);
}

function upsertByOrderId(sh, orderId, rowValues, orderIdColumn) {
  if (!orderId) return;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    sh.appendRow(rowValues);
    return;
  }

  const values = sh.getRange(2, orderIdColumn, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(orderId)) {
      sh.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
      return;
    }
  }

  sh.appendRow(rowValues);
}

function getSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
