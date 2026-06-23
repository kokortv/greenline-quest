const EVENTS_SHEET = "Events";
const CONFIG_SHEET = "Config";

function doGet(e) {
  if (e.parameter.action === "config") {
    return jsonResponse(loadConfig());
  }
  return jsonResponse({ ok: true });
}

function doPost(e) {
  const event = JSON.parse(e.postData.contents);
  if (event.type === "config_update") {
    saveConfig(event.payload);
    return jsonResponse({ ok: true, type: "config_update" });
  }

  appendEvent(event);
  return jsonResponse({ ok: true });
}

function appendEvent(event) {
  const sheet = getEventsSheet();
  const participant = event.payload.participant || event.payload;
  const base = [
    new Date(),
    event.type,
    participant.id || "",
    participant.deviceId || "",
    participant.name || "",
    participant.room || "",
    participant.score || 0,
    participant.startedAt || "",
    participant.completedAt || "",
    participant.status || ""
  ];

  if (event.type === "answer") {
    sheet.appendRow([
      ...base,
      event.payload.characterId,
      event.payload.correct,
      JSON.stringify((participant.spots || {})[event.payload.characterId] || {})
    ]);
  } else {
    sheet.appendRow([...base, event.payload.characterId || "", "", JSON.stringify(participant.spots || {})]);
  }
}

function loadConfig() {
  const sheet = getConfigSheet();
  const json = sheet.getRange("A2").getValue();
  return json ? JSON.parse(json) : {};
}

function saveConfig(config) {
  const sheet = getConfigSheet();
  sheet.getRange("A1").setValue("configJson");
  sheet.getRange("A2").setValue(JSON.stringify(config));
  sheet.getRange("B1").setValue("updatedAt");
  sheet.getRange("B2").setValue(new Date());
}

function getEventsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EVENTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(EVENTS_SHEET);
    sheet.appendRow([
      "timestamp",
      "eventType",
      "participantId",
      "deviceId",
      "guestName",
      "room",
      "score",
      "startedAt",
      "completedAt",
      "status",
      "characterId",
      "correct",
      "details"
    ]);
  }
  return sheet;
}

function getConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET);
    sheet.getRange("A1").setValue("configJson");
    sheet.getRange("A2").setValue("{}");
    sheet.getRange("B1").setValue("updatedAt");
  }
  return sheet;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
