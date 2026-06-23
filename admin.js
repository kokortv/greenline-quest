(function () {
  const draftKey = "hotelQuestAdminDraft";
  const participantKey = "hotelQuestParticipant";
  const config = loadConfig();

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
    byId("finish-title").value = config.settings.finishTitle;
    byId("finish-success").value = config.settings.finishSuccess;
    byId("finish-support").value = config.settings.finishSupport;
    byId("rooms").value = config.rooms.join(", ");
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

        /* Download QR as PNG */
        qrDownloadBtn.addEventListener("click", () => {
          /* Re-draw at higher resolution for download */
          const dlCanvas = document.createElement("canvas");
          QRCodeDraw.drawToCanvas(fullUrl, dlCanvas, 10);
          const link = document.createElement("a");
          link.download = `qr-${character.id}.png`;
          link.href = dlCanvas.toDataURL("image/png");
          link.click();
        });

        /* Open QR in new tab */
        qrOpenBtn.addEventListener("click", () => {
          const w = window.open("", "_blank");
          if (w) {
            const dlCanvas = document.createElement("canvas");
            QRCodeDraw.drawToCanvas(fullUrl, dlCanvas, 10);
            w.document.write(`<!DOCTYPE html><html><head><title>QR: ${character.name}</title><style>body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f1e8;font-family:system-ui;}img{max-width:80vw;max-height:80vh;border:1px solid #d9d0c0;border-radius:8px;background:#fff;}h2{color:#192027;}</style></head><body><div style="text-align:center"><h2>${character.name} — ${character.place}</h2><img src="${dlCanvas.toDataURL("image/png")}" /><p style="color:#65717b;font-size:0.85rem;word-break:break-all;">${fullUrl}</p></div></body></html>`);
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
    config.settings.finishTitle = byId("finish-title").value.trim();
    config.settings.finishSuccess = byId("finish-success").value.trim();
    config.settings.finishSupport = byId("finish-support").value.trim();
    config.rooms = byId("rooms").value.split(",").map((room) => room.trim()).filter(Boolean);
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
      status: participant.status === "completed" || completed === characters.length ? "completed" : "active"
    };
  }

  function readLocalParticipant() {
    try {
      const stored = localStorage.getItem(participantKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  function resetPlayerProgress(playerId) {
    const participant = readLocalParticipant();
    if (!participant || participant.id !== playerId) {
      byId("admin-status").textContent = "Можно сбросить только локального игрока.";
      return;
    }
    if (!confirm(`Сбросить прогресс игрока ${participant.name}? Все найденные персонажи и баллы будут обнулены.`)) return;

    participant.spots = {};
    participant.score = 0;
    participant.status = "active";
    participant.completedAt = "";
    localStorage.setItem(participantKey, JSON.stringify(participant));
    byId("admin-status").textContent = `Прогресс игрока ${participant.name} сброшен.`;
    renderPlayers();
  }

  function deletePlayer(playerId) {
    const participant = readLocalParticipant();
    if (!participant || participant.id !== playerId) {
      byId("admin-status").textContent = "Можно удалить только локального игрока.";
      return;
    }
    if (!confirm(`Удалить игрока ${participant.name}? Это действие нельзя отменить.`)) return;

    localStorage.removeItem(participantKey);
    byId("admin-status").textContent = `Игрок ${participant.name} удалён.`;
    renderPlayers();
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
              <td>
                <div class="actions-cell">
                  ${isLocal ? `
                    <button class="reset-btn" data-action="reset" data-id="${player.id}">Сбросить</button>
                    <button class="delete-btn" data-action="delete" data-id="${player.id}">Удалить</button>
                  ` : `
                    <span style="color:var(--muted);font-size:0.7rem;">только лок.</span>
                  `}
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

  function addCharacter() {
    config.characters.push({
      id: `new-${Date.now()}`,
      name: "Новый персонаж",
      place: "Новое место",
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
      hintAudio: ""
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

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.adminTab));
  });

  render();
})();