(function () {
  const draftKey = "hotelQuestAdminDraft";
  const participantKey = "hotelQuestParticipant";

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

  const fallbackConfig = window.HOTEL_QUEST_CONFIG;
  const draft = loadConfig();

  /* Merge: always preserve all fallback characters, overlay draft by id */
  if (draft.characters && draft.characters.length > 0) {
    const fallbackChars = fallbackConfig.characters || [];
    const draftMap = new Map(draft.characters.map(ch => [ch.id, ch]));
    const mergedCharacters = fallbackChars.map(fbChar => {
      const draftChar = draftMap.get(fbChar.id);
      return draftChar || fbChar;
    });
    const fallbackIds = new Set(fallbackChars.map(ch => ch.id));
    draft.characters.forEach(ch => {
      if (!fallbackIds.has(ch.id)) mergedCharacters.push(ch);
    });
    draft.characters = mergedCharacters;
  } else {
    draft.characters = fallbackConfig.characters || [];
  }
  const config = draft;

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

  function loadConfig() {
    try {
      const draft = localStorage.getItem(draftKey);
      return draft ? JSON.parse(draft) : structuredClone(window.HOTEL_QUEST_CONFIG);
    } catch (error) {
      return structuredClone(window.HOTEL_QUEST_CONFIG);
    }
  }

  function render() {
    byId("current-weather").value = config.settings.currentWeather;
    byId("max-attempts").value = config.settings.maxAttempts;
    byId("room-digits").value = config.settings.roomDigits || 3;
    byId("finish-title").value = config.settings.finishTitle;
    byId("finish-success").value = config.settings.finishSuccess;
    byId("finish-support").value = config.settings.finishSupport;
    byId("prize-info").value = config.settings.prizeInfo || "";
    byId("registration-warning").value = config.settings.registrationWarning || "";
    byId("scan-hint").value = config.settings.scanHint || "";

    /* Primary color */
    const primaryColor = config.settings.primaryColor || "#29771e";
    byId("primary-color").value = primaryColor;
    byId("primary-color-hex").value = primaryColor;

    /* Logo */
    const logoPreview = byId("logo-preview");
    if (logoPreview && config.settings.logoUrl) {
      logoPreview.src = config.settings.logoUrl;
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
      list.innerHTML = "<p style='color:var(--muted);'>Нет персонажей. Добавьте нового.</p>";
      return;
    }

    config.characters.forEach((character, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.index = index;

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

      const preview = node.querySelector('[data-preview="image"]');
      if (preview && character.image) {
        preview.src = character.image;
      }
      const previewSolved = node.querySelector('[data-preview="imageSolved"]');
      if (previewSolved && character.imageSolved) {
        previewSolved.src = character.imageSolved;
      }

      node.querySelectorAll('input[type="file"]').forEach((fileInput) => {
        const field = fileInput.dataset.field;
        fileInput.addEventListener("change", (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            /* Determine which field to update based on the file input name */
            const targetField = field === "imageSolvedFile" ? "imageSolved" : "image";
            character[targetField] = dataUrl;
            const preview = node.querySelector(`[data-preview="${targetField}"]`);
            if (preview) preview.src = dataUrl;
            const textInput = node.querySelector(`[data-field="${targetField}"]`);
            if (textInput) textInput.value = dataUrl;
          };
          reader.readAsDataURL(file);
        });
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

        /* Generate QR */
        try {
          QRCodeDraw.drawToCanvas(fullUrl, qrCanvas, 4);
        } catch (e) {
          /* Fallback: show text if QR fails */
          const ctx = qrCanvas.getContext("2d");
          ctx.fillStyle = "#eef2f3";
          ctx.fillRect(0, 0, 160, 160);
          ctx.fillStyle = "#65717b";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("QR error", 80, 85);
        }

        /* Copy URL */
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

        /* Generate high-res QR canvas (returns Promise) */
        const makeHiResQR = () => {
          return new Promise((resolve) => {
            const dlCanvas = document.createElement("canvas");
            try {
              QRCodeDraw.drawToCanvas(fullUrl, dlCanvas, 10);
              /* Check if canvas actually has content (not 0x0) */
              if (dlCanvas.width > 0 && dlCanvas.height > 0) {
                resolve(dlCanvas);
                return;
              }
            } catch (e) { /* fallback below */ }

            /* API fallback for long URLs */
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

        /* Download QR as PNG */
        qrDownloadBtn.addEventListener("click", async () => {
          const dlCanvas = await makeHiResQR();
          if (!dlCanvas) return;
          const link = document.createElement("a");
          link.download = `qr-${character.id}.png`;
          link.href = dlCanvas.toDataURL("image/png");
          link.click();
        });

        /* Open QR in new tab */
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

      list.appendChild(node);
    });
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
    config.settings.currentWeather = byId("current-weather").value;
    config.settings.maxAttempts = Number(byId("max-attempts").value || 3);
    config.settings.roomDigits = Math.max(1, Math.min(5, Number(byId("room-digits").value || 3)));
    config.settings.finishTitle = byId("finish-title").value.trim();
    config.settings.finishSuccess = byId("finish-success").value.trim();
    config.settings.finishSupport = byId("finish-support").value.trim();
    config.settings.prizeInfo = byId("prize-info").value.trim();
    config.settings.registrationWarning = byId("registration-warning").value.trim();
    config.settings.scanHint = byId("scan-hint").value.trim();

    /* Primary color: prefer hex input, fallback to color picker */
    const hexValue = byId("primary-color-hex").value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hexValue)) {
      config.settings.primaryColor = hexValue;
    } else {
      config.settings.primaryColor = byId("primary-color").value || "#29771e";
    }

    /* logoUrl is set via file upload handler, no need to collect from input */

    config.rooms = config.rooms || [];
  }

  async function save() {
    collectSettings();
    localStorage.setItem(draftKey, JSON.stringify(config));
    byId("admin-status").textContent = "Настройки сохранены для демо-версии.";

    if (!config.sheetEndpoint) return;
    try {
      await fetch(config.sheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "config_update", sentAt: new Date().toISOString(), payload: config })
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
    console.log(`[admin-availability] ${character.name}: from=${character.availableFrom}(${fromMinutes}) to=${character.availableTo}(${toMinutes}) now=${nowMinutes} inRange=${inRange}`);
    return inRange;
  }

  function timeToMinutes(value) {
    const [hours, minutes] = String(value).split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  function summarizeParticipant(participant) {
    const characters = getEnabledCharacters();
    const availableCharacters = characters.filter(isCharacterAvailable);
    console.log(`[admin-summarize] spots=`, JSON.stringify(participant.spots), `availableChars=`, availableCharacters.map(c => c.id));
    const found = availableCharacters.filter((ch) => participant.spots?.[ch.id]?.found).length;
    const solved = availableCharacters.filter((ch) => participant.spots?.[ch.id]?.solved).length;
    const completed = availableCharacters.filter((ch) => {
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
      total: availableCharacters.length,
      progress: availableCharacters.length ? Math.round((found / availableCharacters.length) * 100) : 100,
      status: participant.status === "completed" || completed === availableCharacters.length ? "completed" : "active",
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
      const available = isCharacterAvailable(character);
      if (character.enabled === false || !available) {
        participant.score -= Number(spot.score || character.foundPoints || 0);
        delete participant.spots[character.id];
        changed = true;
      }
    }
    if (changed) {
      participant.score = Math.max(0, participant.score);
      /* Save sanitized data back to localStorage so it persists */
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

    /* Also reset in Sheets if endpoint is configured */
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

    /* Also delete from Sheets if endpoint is configured */
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
      id: `new-${Date.now()}`,
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

    // Получаем текущие координаты пина в пикселях
    const pinLeftPx = (character.x / 100) * rect.width;
    const pinTopPx = (character.y / 100) * rect.height;

    // Смещение от центра пина (пин позиционирован через translate(-50%, -50%))
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

    // Вычисляем позицию центра пина
    const xPx = clientX - rect.left - offsetX;
    const yPx = clientY - rect.top - offsetY;

    // Переводим в проценты
    let x = (xPx / rect.width) * 100;
    let y = (yPx / rect.height) * 100;

    // Ограничиваем
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

  /* Logo upload */
  byId("logo-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      config.settings.logoUrl = ev.target.result;
      const preview = byId("logo-preview");
      if (preview) preview.src = config.settings.logoUrl;
    };
    reader.readAsDataURL(file);
  });

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.adminTab));
  });

  render();
})();