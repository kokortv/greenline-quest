/**
 * Green Line Batumi — Hotel Quest Backend
 * Google Apps Script (вставить в Расширения → Apps Script таблицы)
 *
 * Листы таблицы:
 *   1. "config"     — A1:JSON  (весь конфиг одним JSON-объектом)
 *   2. "events"     — timestamp | type | participantId | data
 *   3. "players"    — id | name | room | score | found | solved | total | progress | status | lastActivity
 *
 * После вставки скрипта:
 *   1. Деплой → Новый деплой → Тип: Web App
 *   2. Выполнять как: Я
 *   3. Доступ: Любой
 *   4. Скопировать URL → вставить в config.js как sheetEndpoint
 */

/* ================================================================
   CONFIG SHEET — хранит один JSON в ячейке A1 листа "config"
   ================================================================ */

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config");
}

function ensureConfigSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("config");
  if (!sheet) {
    sheet = ss.insertSheet("config");
    sheet.getRange("A1").setValue(JSON.stringify(getDefaultConfig(), null, 2));
  }
  return sheet;
}

function readConfig() {
  var sheet = getConfigSheet();
  if (!sheet) return getDefaultConfig();
  var val = sheet.getRange("A1").getValue();
  if (!val) return getDefaultConfig();
  try {
    return JSON.parse(val);
  } catch (e) {
    return getDefaultConfig();
  }
}

function writeConfig(cfg) {
  var sheet = getConfigSheet();
  if (!sheet) sheet = ensureConfigSheet();
  sheet.getRange("A1").setValue(JSON.stringify(cfg, null, 2));
}

function getDefaultConfig() {
  return {
    sheetEndpoint: "",
    hotelName: "Green Line Batumi",
    settings: {
      currentWeather: "sun",
      maxAttempts: 3,
      finishTitle: "Все хранители найдены",
      finishSuccess: "Отличный результат! Вы собрали всех хранителей отеля.",
      finishSupport: "Квест завершен. Не все загадки покорились, но коллекция собрана.",
      nameBlockList: ["дурак", "идиот", "бред", "test", "asdf", "qwerty",
        "хуй", "хуила", "хуёк", "хуя", "пидор", "пидар", "пидр",
        "педик", "педрил", "ебан", "ебать", "ебла", "ебуч",
        "бля", "бляд", "бляди", "срать", "сран", "гандон", "гондон",
        "гавно", "говн", "мудак", "мудил", "залуп", "дроч",
        "пизда", "пизд", "сука", "сук", "уёб", "урод", "дерьм",
        "лох", "чмо", "жопа", "попа", "задница", "хрен",
        "fuck", "shit", "bitch", "ass", "dick", "cunt", "crap",
        "bastard", "damn", "whore", "slut", "fag", "moron", "retard"],
      prizeInfo: "",
      registrationWarning: "",
      primaryColor: "#29771e",
      logoUrl: "",
      roomDigits: 3,
      scanHint: ""
    },
    rooms: ["101", "102", "103", "104", "201", "202", "203", "204", "301", "302", "303", "304"],
    characters: [
      {
        id: "lobby", name: "Люмен", place: "Лобби", color: "#2364aa",
        x: 50, y: 20, enabled: true, active: true, weatherRule: "any",
        availableFrom: "", availableTo: "",
        foundPoints: 10, attemptPoints: [30, 20, 10],
        riddle: "Я встречаю гостей первым, храню ключи и улыбки. Где я?",
        answers: ["ресепшен", "reception", "стойка регистрации", "лобби"],
        image: "", imageSolved: "",
        hintType: "text", hintText: "Я в лобби, подойди ко мне!",
        hintFoundText: "Ты уже встретил меня!", hintAudio: ""
      },
      {
        id: "cafe", name: "Мира", place: "Кафе", color: "#d1663f",
        x: 26, y: 43, enabled: true, active: true, weatherRule: "any",
        availableFrom: "", availableTo: "",
        foundPoints: 10, attemptPoints: [30, 20, 10],
        riddle: "Здесь утро пахнет кофе, а разговоры становятся теплее за маленьким столиком.",
        answers: ["кафе", "coffee", "кофе", "кофейня"],
        image: "", imageSolved: "",
        hintType: "text", hintText: "Я в кафе, загляни туда!",
        hintFoundText: "Ты меня уже нашёл!", hintAudio: ""
      },
      {
        id: "pool", name: "Ори", place: "Бассейн", color: "#2a8c82",
        x: 74, y: 43, enabled: true, active: true, weatherRule: "sun",
        availableFrom: "", availableTo: "",
        foundPoints: 10, attemptPoints: [30, 20, 10],
        riddle: "Я отражаю потолок, шепчу водой и жду тех, кто хочет поплавать.",
        answers: ["бассейн", "pool", "вода"],
        image: "", imageSolved: "",
        hintType: "text", hintText: "Я у бассейна, приходи в солнечный день!",
        hintFoundText: "Ты меня уже нашёл!", hintAudio: ""
      },
      {
        id: "garden", name: "Флора", place: "Сад", color: "#6f8f3d",
        x: 28, y: 76, enabled: true, active: true, weatherRule: "rain",
        availableFrom: "", availableTo: "",
        foundPoints: 10, attemptPoints: [30, 20, 10],
        riddle: "Здесь слышны листья, пахнет землей, а дорожка ведет между зеленью.",
        answers: ["сад", "garden", "двор", "зелень"],
        image: "", imageSolved: "",
        hintType: "text", hintText: "Я в саду, иди под дождём!",
        hintFoundText: "Ты меня уже нашёл!", hintAudio: ""
      },
      {
        id: "stairs", name: "Степ", place: "Лестница", color: "#7a5cba",
        x: 72, y: 76, enabled: true, active: true, weatherRule: "any",
        availableFrom: "", availableTo: "",
        foundPoints: 10, attemptPoints: [30, 20, 10],
        riddle: "Я не лифт, но тоже поднимааю выше. Мои ступени знают путь между этажами.",
        answers: ["лестница", "stairs", "ступени"],
        image: "", imageSolved: "",
        hintType: "text", hintText: "Я на лестнице, поднимись!",
        hintFoundText: "Ты меня уже нашёл!", hintAudio: ""
      }
    ]
  };
}

/* ================================================================
   EVENTS SHEET — лог всех событий игры
   ================================================================ */

function getEventsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("events");
}

function ensureEventsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("events");
  if (!sheet) {
    sheet = ss.insertSheet("events");
    sheet.appendRow(["timestamp", "type", "participantId", "participantName", "room", "data"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  return sheet;
}

function logEvent(type, participantId, participantName, room, data) {
  var sheet = ensureEventsSheet();
  sheet.appendRow([
    new Date().toISOString(),
    type,
    participantId || "",
    participantName || "",
    room || "",
    typeof data === "string" ? data : JSON.stringify(data)
  ]);
}

/* ================================================================
   PLAYERS SHEET — агрегированный прогресс игроков
   ================================================================ */

function getPlayersSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("players");
}

function ensurePlayersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("players");
  if (!sheet) {
    sheet = ss.insertSheet("players");
    sheet.appendRow(["id", "name", "room", "score", "found", "solved", "total", "progress", "status", "lastActivity", "startedAt", "completedAt"]);
    sheet.getRange(1, 1, 1, 12).setFontWeight("bold");
  } else {
    // Migrate: add startedAt and completedAt columns if missing
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (header.length < 12) {
      var needed = 12 - header.length;
      for (var c = 0; c < needed; c++) {
        sheet.getRange(1, header.length + c + 1).setValue(["startedAt", "completedAt"][c] || "");
      }
      sheet.getRange(1, 1, 1, 12).setFontWeight("bold");
    }
  }
  return sheet;
}

function updatePlayer(participant) {
  if (!participant || !participant.id) return;
  var sheet = ensurePlayersSheet();
  var data = sheet.getDataRange().getValues();

  var cfg = readConfig();
  var characters = (cfg.characters || []).filter(function(ch) { return ch.enabled !== false; });
  var found = 0, solved = 0;
  characters.forEach(function(ch) {
    var spot = participant.spots && participant.spots[ch.id];
    if (spot && spot.found) found++;
    if (spot && spot.solved) solved++;
  });
  var total = characters.length;
  var progress = total ? Math.round((found / total) * 100) : 100;
  var status = participant.status === "completed" || (found === total) ? "completed" : "active";

  var rowData = [
    participant.id,
    participant.name || "",
    participant.room || "",
    participant.score || 0,
    found,
    solved,
    total,
    progress + "%",
    status,
    new Date().toISOString(),
    participant.startedAt || "",
    participant.completedAt || ""
  ];

  // Ищем существующую строку
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === participant.id) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, 12).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function getPlayersList() {
  var sheet = getPlayersSheet();
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var players = [];
  for (var i = 1; i < data.length; i++) {
    players.push({
      id: data[i][0],
      name: data[i][1],
      room: data[i][2],
      score: data[i][3],
      found: data[i][4],
      solved: data[i][5],
      total: data[i][6],
      progress: parseInt(String(data[i][7]).replace("%", "")) || 0,
      status: data[i][8],
      startedAt: data[i][10] || "",
      completedAt: data[i][11] || ""
    });
  }
  return players;
}

function deletePlayerRow(playerId) {
  if (!playerId) return;
  var sheet = getPlayersSheet();
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === playerId) {
      sheet.deleteRow(i + 1);
    }
  }
}

function resetPlayerRow(playerId) {
  if (!playerId) return;
  var sheet = getPlayersSheet();
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === playerId) {
      var rowData = [
        data[i][0],   // id
        data[i][1],   // name
        data[i][2],   // room
        0,            // score
        0,            // found
        0,            // solved
        data[i][6],   // total
        "0%",         // progress
        "active",     // status
        new Date().toISOString(),  // lastActivity
        data[i][10] || "",  // startedAt — keep original
        ""            // completedAt — clear
      ];
      sheet.getRange(i + 1, 1, 1, 12).setValues([rowData]);
    }
  }
}

/* ================================================================
   WEB APP — обработка GET и POST запросов
   ================================================================ */

function doGet(e) {
  var action = (e.parameter && e.parameter.action) || "";

  if (action === "config") {
    var cfg = readConfig();
    // Не отдаём sheetEndpoint наружу
    delete cfg.sheetEndpoint;
    return ContentService.createTextOutput(JSON.stringify(cfg))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "players") {
    var players = getPlayersList();
    return ContentService.createTextOutput(JSON.stringify({ players: players }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default: инструкция
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    endpoints: {
      "GET ?action=config": "Получить конфигурацию",
      "GET ?action=players": "Получить список игроков",
      "POST { type, sentAt, payload }": "Отправить событие (registered/found/answer/completed/config_update)"
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = {};
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      // Попробуем как form data
      body = { type: "unknown", payload: e.postData.contents };
    }

    var type = body.type || "unknown";
    var payload = body.payload || {};
    var participant = payload.participant || payload;

    // Логируем ВСЕ события
    logEvent(
      type,
      participant.id || "",
      participant.name || "",
      participant.room || "",
      body
    );

    // Обновляем игрока при ключевых событиях
    if (type === "registered" || type === "found" || type === "answer" || type === "completed") {
      updatePlayer(participant);
    }

    // Обновляем конфигурацию из админки
    if (type === "config_update" && payload.characters) {
      writeConfig(payload);
    }

    // Удаление игрока из таблицы
    if (type === "player_delete") {
      deletePlayerRow(payload.playerId || "");
    }

    // Сброс прогресса игрока в таблице
    if (type === "player_reset") {
      resetPlayerRow(payload.playerId || "");
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "ok", type: type }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    logEvent("error", "", "", "", error.message);
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ================================================================
   ИНИЦИАЛИЗАЦИЯ — запускается один раз при установке
   ================================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Квест")
    .addItem("Инициализировать таблицу", "initializeSheets")
    .addItem("Сбросить всех игроков", "resetAllPlayers")
    .addToUi();
}

function initializeSheets() {
  ensureConfigSheet();
  ensureEventsSheet();
  ensurePlayersSheet();
  SpreadsheetApp.getUi().alert("Таблица инициализирована!\n\nЛисты: config, events, players\n\nТеперь задеплойте Web App и вставьте URL в config.js");
}

function resetAllPlayers() {
  var sheet = getPlayersSheet();
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
  }
  SpreadsheetApp.getUi().alert("Все игроки удалены.");
}
