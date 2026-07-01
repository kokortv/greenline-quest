(function () {
  const draftKey = "hotelQuestAdminDraft";
  const participantKey = "hotelQuestParticipant";

  /* === Auth: simple password protection === */
  const ADMIN_PASSWORD = "green2025"; /* change this to your password */
  const authKey = "hotelQuestAdminAuth";
  const authScreen = document.getElementById("auth-screen");
  const adminMain = document.getElementById("admin-main");

  function checkAuth() {
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get("key");
    const sessionAuth = sessionStorage.getItem(authKey);
    if (urlKey === ADMIN_PASSWORD || sessionAuth === "1") {
      sessionStorage.setItem(authKey, "1");
      authScreen.hidden = true;
      adminMain.hidden = false;
      return true;
    }
    authScreen.hidden = false;
    adminMain.hidden = true;
    return false;
  }

  document.getElementById("auth-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const password = document.getElementById("auth-password").value;
    const errorEl = document.getElementById("auth-error");
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(authKey, "1");
      authScreen.hidden = true;
      adminMain.hidden = false;
      errorEl.textContent = "";
      /* Now that we're authenticated, run init */
      initApp();
    } else {
      errorEl.textContent = "Неверный пароль";
    }
  });

  /* If already authenticated (session or URL key), run app immediately */
  if (checkAuth()) {
    initApp();
  }

  function initApp() {
  /* === URL reset: ?reset or ?reset=config or ?reset=progress === */
  const urlParams = new URLSearchParams(window.location.search);
  const resetParam = urlParams.get("reset");
  if (resetParam !== null) {
    if (resetParam === "" || resetParam === "all") {
      localStorage.removeItem(participantKey);
      localStorage.removeItem(draftKey);
      localStorage.removeItem("hotelQuestSyncQueue");
      localStorage.removeItem("hotelQuestDeviceId");
    } else if (resetParam === "progress") {
      localStorage.removeItem(participantKey);
      localStorage.removeItem("hotelQuestSyncQueue");
    } else if (resetParam === "config") {
      localStorage.removeItem(draftKey);
    }
    urlParams.delete("reset");
    const cleanUrl = urlParams.toString()
      ? window.location.pathname + "?" + urlParams.toString() + "&_t=" + Date.now()
      : window.location.pathname + "?_t=" + Date.now();
    window.location.replace(cleanUrl);
    return;
  }

  /* === Default config for first-time seeding === */
  function getDefaultSettings() {
    return {
      currentWeather: "sun",
      maxAttempts: 3,
      finishTitle: "Все хранители найдены",
      finishSuccess: "Отличный результат! Вы собрали всех хранителей отеля.",
      finishSupport: "Квест завершен. Не все загадки покорились, но коллекция собрана.",
      nameBlockList: [
        "дурак", "идиот", "бред", "test", "asdf", "qwerty",
        "хуй", "хуила", "хуёк", "хуя", "пидор", "пидар", "пидр",
        "педик", "педрил", "ебан", "ебать", "ебла", "ебуч",
        "бля", "бляд", "бляди", "срать", "сран", "гандон", "гондон",
        "гавно", "говн", "мудак", "мудил", "залуп", "дроч",
        "пизда", "пизд", "сука", "сук", "уёб", "урод", "дерьм",
        "лох", "чмо", "жопа", "попа", "задница", "хрен",
        "fuck", "shit", "bitch", "ass", "dick", "cunt", "crap",
        "bastard", "damn", "whore", "slut", "fag", "moron", "retard"
      ],
      prizeInfo: "",
      registrationWarning: "",
      primaryColor: "#29771e",
      logoUrl: "images/logo.png",
      roomDigits: 3,
      scanHint: "",
      rulesText: "",
      hotelName: "Green Line Batumi",
      questStatus: "active",
      closedMessage: ""
    };
  }

  function getDefaultCharacters() {
    return [
      {
        id: "example",
        name: "Пример персонажа",
        color: "#2364aa",
        x: 50,
        y: 50,
        enabled: true,
        active: true,
        weatherRule: "any",
        availableFrom: "",
        availableTo: "",
        foundPoints: 10,
        attemptPoints: [30, 20, 10],
        riddle: "Загадка для примера — замените на свою",
        answers: ["ответ"],
        image: "",
        imageSolved: "",
        hintType: "text",
        hintText: "Подсказка для примера",
        hintFoundText: "Ты меня нашёл!",
        hintAudio: "",
        unavailableHint: ""
      }
    ];
  }

  function getDefaultConfig() {
    return {
      sheetEndpoint: window.HOTEL_QUEST_CONFIG ? window.HOTEL_QUEST_CONFIG.sheetEndpoint : "",
      settings: getDefaultSettings(),
      rooms: ["101", "102", "103", "104", "201", "202", "203", "204", "301", "302", "303", "304"],
      characters: getDefaultCharacters()
    };
  }

  /* === Load config: localStorage draft → Sheets → default seed === */
  let config;

  function loadConfig() {
    try {
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        const parsed = JSON.parse(draft);
        /* Ensure it has the expected structure */
        if (!parsed.settings) parsed.settings = getDefaultSettings();
        if (!parsed.characters) parsed.characters = [];
        return parsed;
      }
    } catch (error) {
      /* ignore parse errors */
    }
    return null;
  }

  const savedConfig = loadConfig();
  if (savedConfig && savedConfig.characters && savedConfig.characters.length > 0) {
    config = savedConfig;
  } else {
    /* First load: seed default config */
    config = getDefaultConfig();
    localStorage.setItem(draftKey, JSON.stringify(config));
  }

  /* Ensure sheetEndpoint from config.js is always available */
  if (window.HOTEL_QUEST_CONFIG && window.HOTEL_QUEST_CONFIG.sheetEndpoint) {
    config.sheetEndpoint = window.HOTEL_QUEST_CONFIG.sheetEndpoint;
  }

  /* Fix old pixel-based coordinates (x>100 or y>100) by clamping to percentages */
  if (config.characters) {
    config.characters.forEach((ch) => {
      if (ch.x > 100) ch.x = Math.min(ch.x / 3.6, 100);
      if (ch.y > 100) ch.y = Math.min(ch.y / 4, 100);
    });
  }

  const byId = (id) => document.getElementById(id);

  let mapContainer = null;
  let dragData = null;

  /* Try to load config from Sheets on startup */
  async function loadRemoteConfig() {
    if (!config.sheetEndpoint) return;
    try {
      const response = await fetch(`${config.sheetEndpoint}?action=config`);
      const remoteSettings = await response.json();
      if (remoteSettings && remoteSettings.settings) {
        config.settings = { ...config.settings, ...remoteSettings.settings };
      }

      /* Also load characters from separate endpoint */
      const charsResponse = await fetch(`${config.sheetEndpoint}?action=characters`);
      const charsData = await charsResponse.json();
      if (charsData && Array.isArray(charsData.characters) && charsData.characters.length > 0) {
        config.characters = charsData.characters;
      }

      localStorage.setItem(draftKey, JSON.stringify(config));
      render();
    } catch (error) {
      /* Silently fail — use local config */
    }
  }

  function render() {
    byId("hotel-name").value = config.settings.hotelName || "";
    byId("current-weather").value = config.settings.currentWeather;
    byId("max-attempts").value = config.settings.maxAttempts;
    byId("room-digits").value = config.settings.roomDigits || 3;
    byId("finish-title").value = config.settings.finishTitle;
    byId("finish-success").value = config.settings.finishSuccess;
    byId("finish-support").value = config.settings.finishSupport;
    byId("prize-info").value = config.settings.prizeInfo || "";
    byId("registration-warning").value = config.settings.registrationWarning || "";
    byId("scan-hint").value = config.settings.scanHint || "";
    byId("rules-text").value = config.settings.rulesText || "";
    byId("quest-status").value = config.settings.questStatus === "closed" ? "closed" : "active";
    byId("closed-message").value = config.settings.closedMessage || "";

    /* Primary color */
    const primaryColor = config.settings.primaryColor || "#29771e";
    byId("primary-color").value = primaryColor;
    byId("primary-color-hex").value = primaryColor;

    /* Logo */
    const logoUrl = byId("logo-url");
    if (logoUrl) {
      logoUrl.value = config.settings.logoUrl || "";
    }

    renderCharacters();
    renderPlayers();
    renderAdminMap();
  }

  function setTab(name) {
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.adminTab === name);
    });
    byId("settings-panel").hidden = name !== "settings";
    byId("characters-panel").hidden = name !== "characters";
    byId("players-panel").hidden = name !== "players";
    byId("map-panel").hidden = name !== "map";
    if (name === "players") renderPlayers();
    if (name === "map") renderAdminMap();
  }

  function renderCharacters() {
    const list = byId("characters-editor");
    const template = byId("character-template");
    list.innerHTML = "";

    if (!config.characters || !config.characters.length) {
      list.innerHTML = "<p style='color:var(--muted);'>Нет персонажей. Нажмите «Добавить персонажа».</p>";
      return;
    }

    config.characters.forEach((character, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.index = index;

      /* Set header: character name and color dot */
      const titleEl = node.querySelector(".character-title");
      if (titleEl) titleEl.textContent = character.name || character.id || "Персонаж";
      const dotEl = node.querySelector(".character-color-dot");
      if (dotEl && character.color) dotEl.style.background = character.color;

      /* Toggle collapse/expand */
      const toggleBtn = node.querySelector(".character-toggle");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          node.classList.toggle("is-open");
        });
      }

      /* Update title when name changes */
      const nameInput = node.querySelector('[data-field="name"]');
      if (nameInput) {
        nameInput.addEventListener("input", () => {
          if (titleEl) titleEl.textContent = nameInput.value || character.id || "Персонаж";
        });
      }

      /* Update color dot when color changes */
      const colorInput = node.querySelector('[data-field="color"]');
      if (colorInput) {
        colorInput.addEventListener("input", () => {
          if (dotEl) dotEl.style.background = colorInput.value;
        });
      }

      node.querySelectorAll("[data-field]").forEach((input) => {
        const field = input.dataset.field;
        if (input.type === "file") return;
        const value = character[field];
        if (field === "enabled" || field === "active") {
          input.value = String(Boolean(value));
        } else if (Array.isArray(value)) {
          input.value = value.join(", ");
        } else {
          input.value = value ?? "";
        }
        input.addEventListener("input", () => updateCharacter(index, field, input.value));
        input.addEventListener("change", () => updateCharacter(index, field, input.value));
      });

      /* QR code section */
      const qrUrl = node.querySelector(".qr-url");
      const qrCanvas = node.querySelector(".qr-canvas");
      const qrCopyBtn = node.querySelector(".qr-copy-btn");
      const qrDownloadBtn = node.querySelector(".qr-download-btn");
      const qrOpenBtn = node.querySelector(".qr-open-btn");

      if (qrUrl && qrCanvas) {
        const baseUrl = window.location.href.replace(/admin\.html.*$/, "");
        const href = `${baseUrl}index.html?spot=${encodeURIComponent(character.id)}`;
        const fullUrl = href;

        qrUrl.textContent = fullUrl;
        qrUrl.title = fullUrl;

        try {
          QRCodeDraw.drawToCanvas(fullUrl, qrCanvas, 4);
        } catch (e) {
          const ctx = qrCanvas.getContext("2d");
          ctx.fillStyle = "#eef2f3";
          ctx.fillRect(0, 0, 160, 160);
          ctx.fillStyle = "#65717b";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("QR error", 80, 85);
        }

        const copyUrl = () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(fullUrl).then(() => {
              qrCopyBtn.textContent = "Скопировано!";
              setTimeout(() => { qrCopyBtn.textContent = "Копировать"; }, 1500);
            });
          } else {
            const ta = document.createElement("textarea");
            ta.value = fullUrl;
            ta.style.cssText = "position:fixed;left:-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            qrCopyBtn.textContent = "Скопировано!";
            setTimeout(() => { qrCopyBtn.textContent = "Копировать"; }, 1500);
          }
        };
        qrUrl.addEventListener("click", copyUrl);
        qrCopyBtn.addEventListener("click", copyUrl);

        const makeHiResQR = () => {
          return new Promise((resolve) => {
            const dlCanvas = document.createElement("canvas");
            try {
              QRCodeDraw.drawToCanvas(fullUrl, dlCanvas, 10);
              if (dlCanvas.width > 0 && dlCanvas.height > 0) {
                resolve(dlCanvas);
                return;
              }
            } catch (e) { /* fallback below */ }

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              dlCanvas.width = img.naturalWidth;
              dlCanvas.height = img.naturalHeight;
              dlCanvas.getContext("2d").drawImage(img, 0, 0);
              resolve(dlCanvas);
            };
            img.onerror = () => resolve(null);
            img.src = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + encodeURIComponent(fullUrl);
          });
        };

        qrDownloadBtn.addEventListener("click", async () => {
          const dlCanvas = await makeHiResQR();
          if (!dlCanvas) return;
          const link = document.createElement("a");
          link.download = `qr-${character.id}.png`;
          link.href = dlCanvas.toDataURL("image/png");
          link.click();
        });

        qrOpenBtn.addEventListener("click", async () => {
          const dlCanvas = await makeHiResQR();
          if (!dlCanvas) return;
          const w = window.open("", "_blank");
          if (w) {
            w.document.write(`<!DOCTYPE html><html><head><title>QR: ${character.name}</title><style>body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f1e8;font-family:system-ui;}img{max-width:80vw;max-height:80vh;border:1px solid #d9d0c0;border-radius:8px;background:#fff;}h2{color:#192027;}</style></head><body><div style="text-align:center"><h2>${character.name}</h2><img src="${dlCanvas.toDataURL("image/png")}" /><p style="color:#65717b;font-size:0.85rem;word-break:break-all;">${fullUrl}</p></div></body></html>`);
            w.document.close();
          }
        });
      }

      /* Delete button */
      const deleteBtn = node.querySelector('[data-action="delete-character"]');
      if (deleteBtn) {
        deleteBtn.addEventListener("click", () => deleteCharacter(index));
      }

      list.appendChild(node);
    });
  }

  function deleteCharacter(index) {
    const character = config.characters[index];
    if (!character) return;
    if (!confirm(`Удалить персонажа «${character.name || character.id}»? Это действие нельзя отменить.`)) return;
    config.characters.splice(index, 1);
    renderCharacters();
    renderAdminMap();
  }

  function updateCharacter(index, field, value) {
    const character = config.characters[index];
    if (!character) return;
    if (field === "enabled" || field === "active") {
      character[field] = value === "true";
    } else if (["x", "y", "foundPoints"].includes(field)) {
      character[field] = Number(value || 0);
    } else if (field === "attemptPoints") {
      character[field] = value.split(",").map((item) => Number(item.trim() || 0));
    } else if (field === "answers") {
      character[field] = value.split(",").map((item) => item.trim()).filter(Boolean);
    } else {
      character[field] = value;
    }
  }

  function collectSettings() {
    config.settings.hotelName = byId("hotel-name").value.trim();
    config.settings.currentWeather = byId("current-weather").value;
    config.settings.maxAttempts = Number(byId("max-attempts").value || 3);
    config.settings.roomDigits = Math.max(1, Math.min(5, Number(byId("room-digits").value || 3)));
    config.settings.finishTitle = byId("finish-title").value.trim();
    config.settings.finishSuccess = byId("finish-success").value.trim();
    config.settings.finishSupport = byId("finish-support").value.trim();
    config.settings.prizeInfo = byId("prize-info").value.trim();
    config.settings.registrationWarning = byId("registration-warning").value.trim();
    config.settings.scanHint = byId("scan-hint").value.trim();
    config.settings.rulesText = byId("rules-text").value.trim();
    config.settings.questStatus = byId("quest-status").value;
    config.settings.closedMessage = byId("closed-message").value.trim();

    /* Primary color: prefer hex input, fallback to color picker */
    const hexValue = byId("primary-color-hex").value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hexValue)) {
      config.settings.primaryColor = hexValue;
    } else {
      config.settings.primaryColor = byId("primary-color").value || "#29771e";
    }

    config.settings.logoUrl = byId("logo-url")?.value?.trim() || config.settings.logoUrl;

    config.rooms = config.rooms || [];
  }

  async function save() {
    collectSettings();
    localStorage.setItem(draftKey, JSON.stringify(config));
    byId("admin-status").textContent = "Настройки сохранены для демо-версии.";

    if (!config.sheetEndpoint) return;
    try {
      /* Save settings to config sheet */
      await fetch(config.sheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "config_update",
          sentAt: new Date().toISOString(),
          payload: { settings: config.settings, rooms: config.rooms }
        })
      });

      /* Save characters to characters sheet */
      await fetch(config.sheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "characters_update",
          sentAt: new Date().toISOString(),
          payload: { characters: config.characters }
        })
      });

      byId("admin-status").textContent = "Настройки сохранены и отправлены в Sheets.";
    } catch (error) {
      byId("admin-status").textContent = "Демо сохранено, но отправка в Sheets не удалась.";
    }
  }

  function getEnabledCharacters() {
    return config.characters.filter((ch) => ch.enabled !== false);
  }

  function isCharacterAvailable(character) {
    if (!character) return false;
    if (character.enabled === false) return false;
    if (character.active === false) return false;

    const weather = config.settings.currentWeather || "sun";
    if (character.weatherRule && character.weatherRule !== "any" && character.weatherRule !== weather) {
      return false;
    }

    if (!character.availableFrom && !character.availableTo) return true;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const fromMinutes = timeToMinutes(character.availableFrom || "00:00");
    const toMinutes = timeToMinutes(character.availableTo || "23:59");
    const inRange = fromMinutes <= toMinutes
      ? nowMinutes >= fromMinutes && nowMinutes <= toMinutes
      : nowMinutes >= fromMinutes || nowMinutes <= toMinutes;
    return inRange;
  }

  function timeToMinutes(value) {
    const [hours, minutes] = String(value).split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  function summarizeParticipant(participant) {
    const characters = getEnabledCharacters();
    const found = characters.filter((ch) => participant.spots?.[ch.id]?.found).length;
    const solved = characters.filter((ch) => participant.spots?.[ch.id]?.solved).length;
    const completed = characters.filter((ch) => {
      const spot = participant.spots?.[ch.id];
      return spot?.found && (spot.solved || spot.attempts >= config.settings.maxAttempts);
    }).length;
    return {
      id: participant.id,
      name: participant.name,
      room: participant.room,
      score: participant.score || 0,
      found,
      solved,
      total: characters.length,
      progress: characters.length ? Math.round((found / characters.length) * 100) : 100,
      status: participant.status === "completed" || completed === characters.length ? "completed" : "active",
      startedAt: participant.startedAt || "",
      completedAt: participant.completedAt || ""
    };
  }

  function sanitizeParticipantData(participant) {
    if (!participant || !participant.spots) return participant;
    let changed = false;
    for (const character of config.characters) {
      const spot = participant.spots[character.id];
      if (!spot || !spot.found) continue;
      /* Only remove found status if admin disabled the character.
         Weather/time changes should NOT remove found status. */
      if (character.enabled === false) {
        participant.score -= Number(spot.score || character.foundPoints || 0);
        delete participant.spots[character.id];
        changed = true;
      }
    }
    if (changed) {
      participant.score = Math.max(0, participant.score);
      try {
        localStorage.setItem(participantKey, JSON.stringify(participant));
      } catch (e) { /* ignore */ }
    }
    return participant;
  }

  function readLocalParticipant() {
    try {
      const stored = localStorage.getItem(participantKey);
      if (!stored) return null;
      const participant = JSON.parse(stored);
      return sanitizeParticipantData(participant);
    } catch (error) {
      return null;
    }
  }

  function resetPlayerProgress(playerId) {
    const participant = readLocalParticipant();
    const isLocal = participant && participant.id === playerId;

    if (!confirm(`Сбросить прогресс игрока? Все найденные персонажи и баллы будут обнулены.`)) return;

    if (isLocal) {
      participant.spots = {};
      participant.score = 0;
      participant.status = "active";
      participant.completedAt = "";
      localStorage.setItem(participantKey, JSON.stringify(participant));
    }

    if (config.sheetEndpoint) {
      fetch(config.sheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "player_reset",
          sentAt: new Date().toISOString(),
          payload: { playerId: playerId }
        })
      }).catch(() => {});
    }

    byId("admin-status").textContent = isLocal
      ? `Прогресс игрока сброшен локально и в таблице.`
      : `Запрос на сброс отправлен в таблицу.`;
    setTimeout(() => renderPlayers(), 500);
  }

  function deletePlayer(playerId) {
    const participant = readLocalParticipant();
    const isLocal = participant && participant.id === playerId;

    if (!confirm(`Удалить игрока? Это действие нельзя отменить.`)) return;

    if (isLocal) {
      localStorage.removeItem(participantKey);
    }

    if (config.sheetEndpoint) {
      fetch(config.sheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "player_delete",
          sentAt: new Date().toISOString(),
          payload: { playerId: playerId }
        })
      }).catch(() => {});
    }

    byId("admin-status").textContent = isLocal
      ? `Игрок удалён локально и из таблицы.`
      : `Запрос на удаление отправлен в таблицу.`;
    setTimeout(() => renderPlayers(), 500);
  }

  function resetAllPlayers() {
    if (!confirm("Сбросить прогресс всех игроков (включая локального)? Это действие нельзя отменить.")) return;
    localStorage.removeItem(participantKey);
    byId("admin-status").textContent = "Все игроки сброшены (локальное хранилище очищено).";
    renderPlayers();
  }

  async function renderPlayers() {
    const content = byId("players-content");
    const local = readLocalParticipant();
    let players = local ? [summarizeParticipant(local)] : [];

    if (config.sheetEndpoint) {
      try {
        const response = await fetch(`${config.sheetEndpoint}?action=players`);
        const remote = await response.json();
        if (Array.isArray(remote.players)) {
          const remoteMap = new Map(remote.players.map(p => [p.id, p]));
          if (local) remoteMap.set(local.id, summarizeParticipant(local));
          players = Array.from(remoteMap.values());
        }
      } catch (error) {
        byId("admin-status").textContent = "Не удалось загрузить игроков из Sheets.";
      }
    }

    if (!players.length) {
      content.innerHTML = `<p class="players-empty">Пока нет игроков.</p>`;
      return;
    }

    const localId = local ? local.id : null;

    content.innerHTML = `
      <table class="players-table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Комната</th>
            <th>Баллы</th>
            <th>Найдено</th>
            <th>Решено</th>
            <th>Прогресс</th>
            <th>Статус</th>
            <th>Регистрация</th>
            <th>Завершение</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player) => {
            const isLocal = player.id === localId;
            return `
            <tr>
              <td>${escapeHtml(player.name || "")} ${isLocal ? '⭐' : ''}</td>
              <td>${escapeHtml(player.room || "")}</td>
              <td>${player.score || 0}</td>
              <td>${player.found || 0}/${player.total || 0}</td>
              <td>${player.solved || 0}/${player.total || 0}</td>
              <td>${player.progress || 0}%</td>
              <td>${player.status === "completed" ? "Завершен" : "В игре"}</td>
              <td>${formatDate(player.startedAt)}</td>
              <td>${formatDate(player.completedAt)}</td>
              <td>
                <div class="actions-cell">
                  <button class="reset-btn" data-action="reset" data-id="${player.id}">Сбросить</button>
                  <button class="delete-btn" data-action="delete" data-id="${player.id}">Удалить</button>
                </div>
              </td>
            </tr>
          `}).join("")}
        </tbody>
      </table>
    `;

    content.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === "reset") resetPlayerProgress(id);
        else if (action === "delete") deletePlayer(id);
      });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function formatDate(isoString) {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "—";
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (e) {
      return "—";
    }
  }

  function addCharacter() {
    config.characters.push({
      id: `char-${Date.now()}`,
      name: "Новый персонаж",
      color: "#2364aa",
      x: 50,
      y: 50,
      enabled: true,
      active: true,
      weatherRule: "any",
      availableFrom: "",
      availableTo: "",
      foundPoints: 10,
      attemptPoints: [30, 20, 10],
      riddle: "",
      answers: [],
      image: "",
      imageSolved: "",
      hintType: "text",
      hintText: "Нажми на меня, я подскажу!",
      hintFoundText: "Ты уже нашёл меня!",
      hintAudio: "",
      unavailableHint: ""
    });
    renderCharacters();
    renderAdminMap();
  }

  // === Редактор карты ===
  function renderAdminMap() {
    const container = byId("admin-pins");
    if (!container) return;
    container.innerHTML = "";

    mapContainer = document.querySelector(".admin-map");
    if (!mapContainer) return;

    const enabled = getEnabledCharacters();
    enabled.forEach((character) => {
      const pin = document.createElement("div");
      pin.className = "admin-pin";
      pin.dataset.characterId = character.id;

      pin.style.left = character.x + "%";
      pin.style.top = character.y + "%";

      // Изображение
      const img = document.createElement("img");
      if (character.image) {
        img.src = character.image;
        img.alt = character.name;
      } else {
        img.style.display = "none";
        const fallback = document.createElement("div");
        fallback.className = "pin-fallback";
        fallback.textContent = character.name.charAt(0).toUpperCase() || "?";
        pin.appendChild(fallback);
      }
      pin.appendChild(img);

      // Координаты
      const coords = document.createElement("div");
      coords.className = "pin-coords";
      coords.textContent = `${Math.round(character.x)}%, ${Math.round(character.y)}%`;
      pin.appendChild(coords);

      // Перетаскивание
      pin.addEventListener("mousedown", (e) => startDrag(e, pin, character, container));
      pin.addEventListener("touchstart", (e) => startDrag(e, pin, character, container), { passive: false });

      container.appendChild(pin);
    });
  }

  // === Перетаскивание с правильным смещением ===
  function startDrag(e, pin, character, container) {
    e.preventDefault();
    const isTouch = e.type === "touchstart";
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const rect = mapContainer.getBoundingClientRect();

    const pinLeftPx = (character.x / 100) * rect.width;
    const pinTopPx = (character.y / 100) * rect.height;

    const pinCenterX = rect.left + pinLeftPx;
    const pinCenterY = rect.top + pinTopPx;

    const offsetX = clientX - pinCenterX;
    const offsetY = clientY - pinCenterY;

    dragData = {
      pin,
      character,
      container,
      offsetX,
      offsetY,
      rect
    };

    pin.classList.add("dragging");

    const onMove = (ev) => {
      ev.preventDefault();
      const cx = isTouch ? ev.touches[0].clientX : ev.clientX;
      const cy = isTouch ? ev.touches[0].clientY : ev.clientY;
      movePin(cx, cy);
    };

    const onEnd = () => {
      pin.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      dragData = null;
      updatePinCoords(pin, character);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }

  function movePin(clientX, clientY) {
    if (!dragData) return;
    const { pin, character, offsetX, offsetY } = dragData;
    const rect = mapContainer.getBoundingClientRect();

    const xPx = clientX - rect.left - offsetX;
    const yPx = clientY - rect.top - offsetY;

    let x = (xPx / rect.width) * 100;
    let y = (yPx / rect.height) * 100;

    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    pin.style.left = x + "%";
    pin.style.top = y + "%";
    character.x = x;
    character.y = y;
  }

  function updatePinCoords(pin, character) {
    const coords = pin.querySelector(".pin-coords");
    if (coords) {
      coords.textContent = `${Math.round(character.x)}%, ${Math.round(character.y)}%`;
    }
  }

  function resetPositions() {
    if (!confirm("Сбросить позиции всех персонажей на 50%, 50%?")) return;
    const enabled = getEnabledCharacters();
    enabled.forEach((ch) => {
      ch.x = 50;
      ch.y = 50;
    });
    renderAdminMap();
    byId("admin-status").textContent = "Позиции сброшены. Не забудьте сохранить.";
  }

  // === Обработчики ===
  byId("save-admin").addEventListener("click", save);
  byId("add-character").addEventListener("click", addCharacter);
  byId("refresh-players").addEventListener("click", renderPlayers);
  byId("reset-all-players").addEventListener("click", resetAllPlayers);
  byId("reset-positions").addEventListener("click", resetPositions);

  /* Primary color: sync picker ↔ hex input */
  byId("primary-color").addEventListener("input", () => {
    byId("primary-color-hex").value = byId("primary-color").value;
  });
  byId("primary-color-hex").addEventListener("input", () => {
    const val = byId("primary-color-hex").value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      byId("primary-color").value = val;
    }
  });

  /* Logo URL input */
  byId("logo-url").addEventListener("input", (e) => {
    config.settings.logoUrl = e.target.value.trim();
  });

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.adminTab));
  });

  render();
  loadRemoteConfig();
  } /* end of initApp */
})();
