(function () {
  const fallbackConfig = window.HOTEL_QUEST_CONFIG;
  const storageKey = "hotelQuestParticipant";
  const queueKey = "hotelQuestSyncQueue";
  const adminDraftKey = "hotelQuestAdminDraft";

  let config = normalizeConfig(readAdminDraft() || fallbackConfig);

  /* Fix old pixel-based coordinates (x>100 or y>100) by clamping to percentages */
  config.characters.forEach((ch) => {
    if (ch.x > 100) ch.x = Math.min(ch.x / 3.6, 100);
    if (ch.y > 100) ch.y = Math.min(ch.y / 4, 100);
  });

  const screens = {
    start: document.getElementById("start-screen"),
    quest: document.getElementById("quest-screen"),
    finish: document.getElementById("finish-screen")
  };

  const byId = (id) => document.getElementById(id);
  const weatherLabels = { sun: "Солнце", rain: "Дождь", cloudy: "Облачно" };

  function currentSpot() {
    return new URLSearchParams(window.location.search).get("spot");
  }

  function readAdminDraft() {
    try {
      const draft = localStorage.getItem(adminDraftKey);
      return draft ? JSON.parse(draft) : null;
    } catch (error) {
      return null;
    }
  }

  function normalizeConfig(raw) {
    const settings = {
      currentWeather: "sun",
      maxAttempts: 3,
      finishTitle: "Все хранители найдены",
      finishSuccess: "Отличный результат! Вы собрали всех хранителей отеля.",
      finishSupport: "Квест завершен. Не все загадки покорились, но коллекция собрана.",
      nameBlockList: [],
      ...(raw.settings || {})
    };

    return {
      ...raw,
      settings,
      rooms: (raw.rooms || []).map(String),
      characters: (raw.characters || []).map((character) => ({
        enabled: true,
        active: true,
        weatherRule: "any",
        availableFrom: "",
        availableTo: "",
        foundPoints: 10,
        attemptPoints: [30, 20, 10],
        answers: [],
        image: "",
        imageSolved: "",
        hintType: "text",
        hintText: "Нажми на меня, я подскажу!",
        hintFoundText: "Ты уже нашёл меня!",
        hintAudio: "",
        ...character
      }))
    };
  }

  async function loadRemoteConfig() {
    if (!config.sheetEndpoint) return;
    try {
      const response = await fetch(`${config.sheetEndpoint}?action=config`);
      const remote = await response.json();
      if (remote && remote.characters) {
        config = normalizeConfig({ ...config, ...remote });
        populateRoomOptions();
        renderCurrentState();
      }
    } catch (error) {
      queueEvent("config_load_failed", { message: error.message });
    }
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  function saveState(nextState) {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
  }

  function validateName(name) {
    const value = name.trim();
    const normalized = normalizeText(value);
    const blocked = config.settings.nameBlockList.map(normalizeText);
    if (value.length < 2 || value.length > 32) return "Имя должно быть от 2 до 32 символов.";
    if (!/^[A-Za-zА-Яа-яЁё' -]+$/.test(value)) return "В имени можно использовать только буквы, пробел и дефис.";
    if (/(.)\1{4,}/.test(normalized)) return "Похоже на случайный набор символов. Введите настоящее имя.";
    if (blocked.some((word) => word && normalized.includes(word))) return "Введите имя без грубых или служебных слов.";
    return "";
  }

  function validateRoom(room) {
    const value = room.trim();
    if (!config.rooms.includes(value)) return "Выберите номер комнаты из списка отеля.";
    return "";
  }

  function createParticipant(formData) {
    const id = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now());
    const deviceId = localStorage.getItem("hotelQuestDeviceId") || createDeviceId();
    return {
      id,
      deviceId,
      name: formData.get("guestName").trim(),
      room: formData.get("roomNumber").trim(),
      startedAt: new Date().toISOString(),
      completedAt: "",
      status: "active",
      score: 0,
      spots: {}
    };
  }

  function createDeviceId() {
    const id = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `device-${Date.now()}`;
    localStorage.setItem("hotelQuestDeviceId", id);
    return id;
  }

  function setScreen(name) {
    Object.entries(screens).forEach(([key, node]) => {
      node.classList.toggle("screen-active", key === name);
    });
  }

  function setQuestView(name, characterName) {
    ["map", "character", "profile"].forEach((view) => {
      const el = byId(`${view}-view`);
      el.hidden = view !== name;
      /* Re-trigger viewIn animation */
      if (view === name) {
        el.style.animation = "none";
        el.offsetHeight; // reflow
        el.style.animation = "";
      }
    });

    /* Topbar is always visible — just change content */
    const topbar = byId("topbar");
    if (topbar) topbar.hidden = false;

    /* Title */
    const title = byId("quest-title");
    if (name === "profile") {
      title.textContent = "Профиль";
    } else if (name === "character") {
      title.textContent = characterName || "Встреча";
    } else {
      title.textContent = "Карта поиска";
    }

    /* Back button removed — use map chip instead */

    /* Profile button: hide when already on profile */
    byId("profile-button").hidden = name === "profile";

    /* Map button: show on character & profile, hide on map */
    byId("map-button").hidden = name === "map";
  }

  /** Update weather icon in topbar */
  function updateWeatherIcon() {
    const btn = byId("weather-button");
    const svg = byId("weather-svg");
    if (!btn || !svg) return;

    const weather = config.settings.currentWeather;
    btn.classList.remove("is-sun", "is-rain", "is-cloudy");

    if (weather === "sun") {
      btn.classList.add("is-sun");
      btn.setAttribute("aria-label", "Солнце");
      svg.innerHTML = `
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
    } else if (weather === "rain") {
      btn.classList.add("is-rain");
      btn.setAttribute("aria-label", "Дождь");
      svg.innerHTML = `
        <line x1="16" y1="13" x2="16" y2="21"/>
        <line x1="8" y1="13" x2="8" y2="21"/>
        <line x1="12" y1="15" x2="12" y2="23"/>
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>`;
    } else {
      btn.classList.add("is-cloudy");
      btn.setAttribute("aria-label", "Облачно");
      svg.innerHTML = `
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>`;
    }
  }

  function getParticipant() {
    return loadState();
  }

  function updateParticipant(mutator) {
    const participant = getParticipant();
    if (!participant) return null;
    mutator(participant);
    saveState(participant);
    render(participant);
    return participant;
  }

  function queueEvent(type, payload) {
    const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
    queue.push({ type, sentAt: new Date().toISOString(), payload });
    localStorage.setItem(queueKey, JSON.stringify(queue));
    syncQueue();
  }

  async function syncQueue() {
    if (!config.sheetEndpoint) return;
    const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
    if (!queue.length) return;

    const remaining = [];
    for (const event of queue) {
      try {
        await fetch(config.sheetEndpoint, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(event)
        });
      } catch (error) {
        remaining.push(event);
      }
    }
    localStorage.setItem(queueKey, JSON.stringify(remaining));
  }

  function isCharacterAvailable(character) {
    if (!character.active) return false;
    if (character.weatherRule !== "any" && character.weatherRule !== config.settings.currentWeather) return false;
    if (!character.availableFrom && !character.availableTo) return true;

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const from = timeToMinutes(character.availableFrom || "00:00");
    const to = timeToMinutes(character.availableTo || "23:59");
    if (from <= to) return minutes >= from && minutes <= to;
    return minutes >= from || minutes <= to;
  }

  function timeToMinutes(value) {
    const [hours, minutes] = String(value).split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  function getEnabledCharacters() {
    return config.characters.filter((ch) => ch.enabled !== false);
  }

  function getCharacter(id) {
    return config.characters.find((character) => character.id === id);
  }

  function getProgress(participant) {
    const all = getEnabledCharacters();
    const found = all.filter((ch) => participant.spots[ch.id]?.found).length;
    const solved = all.filter((ch) => participant.spots[ch.id]?.solved).length;
    const completed = all.filter((ch) => {
      const spot = participant.spots[ch.id];
      return spot?.found && (spot.solved || spot.attempts >= config.settings.maxAttempts);
    }).length;
    const percent = all.length ? Math.round((found / all.length) * 100) : 100;
    return { characters: all, found, solved, completed, percent };
  }

  function populateRoomOptions() {
    byId("room-options").innerHTML = config.rooms.map((room) => `<option value="${room}"></option>`).join("");
  }

  function renderCurrentState() {
    const participant = getParticipant();
    if (participant) render(participant);
  }

  /** Get character image based on state: not-found → found → solved */
  function getCharacterImage(character, state) {
    if (state === "solved" && character.imageSolved) return character.imageSolved;
    return character.image || "";
  }

  // === Отрисовка пинов на карте (проценты) ===
  function renderMapPins(participant) {
    const container = byId("map-pins");
    if (!container) return;
    container.innerHTML = "";

    getEnabledCharacters().forEach((character) => {
      const spot = participant.spots[character.id];
      const found = Boolean(spot?.found);
      const solved = Boolean(spot?.solved);
      const available = isCharacterAvailable(character);
      const imgState = solved ? "solved" : found ? "found" : "default";
      const imageUrl = getCharacterImage(character, imgState);

      const pin = document.createElement("div");
      pin.className = `map-pin ${found ? "is-found" : ""} ${solved ? "is-solved" : ""} ${!available ? "is-unavailable" : ""}`;
      pin.style.left = character.x + "%";
      pin.style.top = character.y + "%";
      pin.dataset.characterId = character.id;

      if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = character.name;
        img.onerror = function () {
          this.style.display = "none";
          const fallback = document.createElement("div");
          fallback.className = "pin-fallback";
          fallback.textContent = solved ? "★" : found ? "✓" : "?";
          pin.prepend(fallback);
        };
        pin.appendChild(img);
      } else {
        const fallback = document.createElement("div");
        fallback.className = "pin-fallback";
        fallback.textContent = solved ? "★" : found ? "✓" : "?";
        pin.appendChild(fallback);
      }

      if (!available) {
        const icon = document.createElement("div");
        icon.className = "pin-unavailable-icon";
        icon.textContent = "⏱";
        pin.appendChild(icon);
      }

      const label = document.createElement("div");
      label.className = "pin-label";
      label.textContent = found ? character.name : (available ? character.name : `${character.name} ⏱`);
      pin.appendChild(label);

      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        showHintBubble(character, participant, pin);
      });

      container.appendChild(pin);
    });
  }

  // === Показ облачка ===
  function showHintBubble(character, participant, pinElement) {
    const spot = participant.spots[character.id];
    const found = Boolean(spot?.found);
    const available = isCharacterAvailable(character);

    if (character.enabled === false || !available) {
      showBubble("⏳ Персонаж недоступен", pinElement, "#b94d3e");
      return;
    }

    let message = found ? character.hintFoundText : character.hintText;
    if (!message) message = found ? "Ты уже нашёл меня!" : "Попробуй найти меня!";

    const bubbleColor = character.color;

    if (character.hintType === "voice" && character.hintAudio) {
      const audio = new Audio(character.hintAudio);
      audio.play().catch(() => {
        showBubble("Не удалось воспроизвести аудио", pinElement, character.color);
      });
      showBubble("Слушай подсказку", pinElement, character.color);
    } else {
      showBubble(message, pinElement, bubbleColor);
    }
  }

  let bubbleTimeout = null;

  function showBubble(text, pinElement, color = "#2364aa") {
    const oldBubble = document.querySelector(".hint-bubble");
    if (oldBubble) {
      oldBubble.classList.add("is-leaving");
      setTimeout(() => oldBubble.remove(), 300);
    }
    if (bubbleTimeout) clearTimeout(bubbleTimeout);

    const rect = pinElement.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top - 8;

    const bubble = document.createElement("div");
    bubble.className = "hint-bubble";
    bubble.style.position = "fixed";
    bubble.style.left = x + "px";
    bubble.style.top = y + "px";
    bubble.style.setProperty("--bubble-color", color);

    bubble.innerHTML = `
      <div class="hint-bubble-content">${escapeHtml(text)}</div>
      <div class="hint-bubble-arrow"></div>
    `;

    document.body.appendChild(bubble);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bubble.classList.add("is-visible");
      });
    });

    bubbleTimeout = setTimeout(() => {
      bubble.classList.remove("is-visible");
      bubble.classList.add("is-leaving");
      setTimeout(() => bubble.remove(), 300);
    }, 3000);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function showWeatherToast(text, color) {
    const old = document.querySelector(".weather-toast");
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.className = "weather-toast";
    toast.style.setProperty("--toast-color", color);
    toast.textContent = text;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add("is-visible");
      });
    });

    setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 400);
    }, 2000);
  }

  // === Коллекция ===
  function renderCollection(participant) {
    const grid = byId("collection-grid");
    grid.innerHTML = "";
    getEnabledCharacters().forEach((character) => {
      const spot = participant.spots[character.id];
      const found = Boolean(spot?.found);
      const solved = Boolean(spot?.solved);
      const imgState = solved ? "solved" : found ? "found" : "default";
      const imgSrc = getCharacterImage(character, imgState);
      const card = document.createElement("article");
      card.className = `collection-card ${found ? "is-found" : "is-not-found"} ${solved ? "is-solved" : ""}`;
      card.innerHTML = `
        ${imgSrc ? `<img class="card-portrait" src="${imgSrc}" alt="${found ? character.name : ''}" onerror="this.style.display='none'" />` : '<div class="card-portrait" style="background:var(--line);border-radius:var(--radius-sm);"></div>'}
        <strong>${found ? character.name : "???"}</strong>
        <span>${character.place}</span>
        <small>${solved ? "Решено" : found ? "Открыт" : "Не найден"}</small>
      `;

      card.addEventListener("click", () => {
        if (found) {
          navigateToCharacter(character.id);
        } else {
          showHintBubble(character, participant, card);
        }
      });
      grid.appendChild(card);
    });
  }

  /** Navigate to a character view by setting the spot param */
  function navigateToCharacter(characterId) {
    const url = new URL(window.location.href);
    url.searchParams.set("spot", characterId);
    window.history.replaceState({}, "", url);
    const participant = getParticipant();
    if (participant) {
      renderCharacter(participant);
      const ch = getCharacter(characterId);
      setQuestView("character", ch ? ch.name : undefined);
    }
  }

  function revealCharacter(participant, character) {
    if (!participant.spots[character.id]) {
      participant.spots[character.id] = {
        found: true,
        foundAt: new Date().toISOString(),
        attempts: 0,
        solved: false,
        score: character.foundPoints
      };
      participant.score += Number(character.foundPoints || 0);
      saveState(participant);
      queueEvent("found", { participant, characterId: character.id });
    }
  }

  /** Render attempts indicator (dots) */
  function renderAttemptsDots(spot, maxAttempts) {
    const bar = byId("attempts-bar");
    if (!bar) return;
    bar.innerHTML = "";
    const attempts = spot ? spot.attempts : 0;
    for (let i = 0; i < maxAttempts; i++) {
      const dot = document.createElement("span");
      dot.className = "attempts-dot";
      if (i < attempts) {
        dot.classList.add("is-used");
      } else if (i === attempts) {
        dot.classList.add("is-active");
      }
      bar.appendChild(dot);
    }
  }

  /** Render status pill in character panel */
  function renderStatusPill(spot, character) {
    const pill = byId("status-pill");
    if (!pill) return;
    pill.innerHTML = "";

    if (!spot || !spot.found) {
      pill.className = "status-pill is-pending";
      pill.textContent = "Ожидание";
      return;
    }

    if (spot.solved) {
      pill.className = "status-pill is-solved";
      pill.textContent = "Решено";
      return;
    }

    const attemptsLeft = Math.max(0, config.settings.maxAttempts - (spot.attempts || 0));
    if (attemptsLeft === 0) {
      pill.className = "status-pill is-exhausted";
      pill.textContent = "Попытки кончились";
      return;
    }

    pill.className = "status-pill is-pending";
    pill.textContent = `${attemptsLeft} ${attemptsLeft === 1 ? "попытка" : "попытки"}`;
  }

  function renderCharacter(participant) {
    const character = getCharacter(currentSpot());
    const body = byId("character-panel");
    const feedback = byId("feedback");
    const answerForm = byId("answer-form");
    const answerInput = byId("answer-input");
    const avatar = byId("character-avatar");
    feedback.textContent = "";
    feedback.className = "feedback";
    body.classList.remove("is-solved", "is-exhausted");
    answerForm.classList.remove("is-hidden");
    avatar.classList.remove("is-solved");

    if (!character) {
      return;
    }

    /* Portrait: pick image based on state */
    const spot = participant.spots[character.id] || { attempts: 0, solved: false, found: false };
    const solved = spot.solved || false;
    const imgState = solved ? "solved" : spot.found ? "found" : "default";
    const imgSrc = getCharacterImage(character, imgState);

    if (imgSrc) {
      avatar.src = imgSrc;
      avatar.alt = character.name;
      avatar.style.display = "";
    } else {
      avatar.src = "";
      avatar.alt = "";
      avatar.style.display = "none";
    }

    /* Solved glow on portrait */
    if (solved) {
      avatar.classList.add("is-solved");
    }

    /* Hero background tinted with character color */
    const hero = byId("character-hero");
    hero.style.background = `
      radial-gradient(ellipse at 50% 80%, ${character.color}18, transparent 60%),
      linear-gradient(180deg, #dbe9ef 0%, #eef2f0 60%, var(--bg) 100%)
    `;

    byId("character-place").textContent = character.place;
    byId("character-name").textContent = character.name;

    const attemptsLeft = Math.max(0, config.settings.maxAttempts - spot.attempts);

    /* Render attempts indicator and status pill */
    renderAttemptsDots(spot, config.settings.maxAttempts);
    renderStatusPill(spot, character);

    /* Disabled / unavailable characters */
    if (character.enabled === false) {
      byId("riddle-text").textContent = "Этот персонаж временно не участвует в квесте.";
      answerForm.classList.add("is-hidden");
      feedback.textContent = "Обратитесь к администратору.";
      feedback.className = "feedback feedback-error";
      return;
    }

    if (!isCharacterAvailable(character)) {
      let hint = "Этот персонаж сейчас недоступен.";
      if (character.weatherRule !== "any" && character.weatherRule !== config.settings.currentWeather) {
        hint += ` Он появляется только в ${weatherLabels[character.weatherRule] || "определённую погоду"}.`;
      }
      if (character.availableFrom && character.availableTo) {
        hint += ` Доступен с ${character.availableFrom} до ${character.availableTo}.`;
      }
      byId("riddle-text").textContent = hint;
      answerForm.classList.add("is-hidden");
      feedback.textContent = "Попробуйте позже или измените погоду в настройках.";
      feedback.className = "feedback feedback-error";
      return;
    }

    const exhausted = attemptsLeft === 0 && spot.attempts > 0;

    /* After solving or exhausting: hide the form, stay on screen */
    if (solved || exhausted) {
      answerForm.classList.add("is-hidden");
      body.classList.add(solved ? "is-solved" : "is-exhausted");

      byId("riddle-text").textContent = character.riddle;

      if (solved && spot.lastFeedback) {
        feedback.textContent = spot.lastFeedback;
        feedback.className = "feedback";
      }
      /* No extra feedback for exhausted — status pill already says it */
    } else {
      /* Active riddle — show form */
      byId("riddle-text").textContent = character.riddle;
      answerInput.disabled = false;
      answerInput.focus();

      feedback.textContent = spot.lastFeedback || `Попыток осталось: ${attemptsLeft}. За находку уже начислено ${character.foundPoints} баллов.`;
    }
  }

  function render(participant) {
    const scannedCharacter = getCharacter(currentSpot());
    if (participant.status !== "completed" && scannedCharacter && isCharacterAvailable(scannedCharacter)) {
      revealCharacter(participant, scannedCharacter);
    }

    const progress = getProgress(participant);
    byId("profile-name").textContent = participant.name;
    byId("profile-room").textContent = `Комната ${participant.room}`;
    updateWeatherIcon();
    byId("score-value").textContent = participant.score;
    byId("found-value").textContent = `${progress.found}/${progress.characters.length}`;
    byId("progress-value").textContent = `${progress.percent}%`;
    const progressBar = byId("progress-bar");
    if (progressBar) progressBar.style.width = `${progress.percent}%`;
    byId("final-score").textContent = participant.score;
    renderMapPins(participant);
    renderCollection(participant);

    if (participant.status === "completed" || progress.completed === progress.characters.length) {
      if (!participant.completedAt) {
        participant.completedAt = new Date().toISOString();
        participant.status = "completed";
        saveState(participant);
        queueEvent("completed", participant);
      }
      renderFinish(participant, progress);
      setScreen("finish");
      return;
    }

    if (currentSpot()) {
      renderCharacter(participant);
      const ch = getCharacter(currentSpot());
      setQuestView("character", ch ? ch.name : undefined);
    } else {
      setQuestView("map");
    }
    setScreen("quest");
  }

  function renderFinish(participant, progress) {
    byId("finish-title").textContent = config.settings.finishTitle;
    const allSolved = progress.solved === progress.characters.length;
    byId("finish-copy").textContent = `${allSolved ? config.settings.finishSuccess : config.settings.finishSupport} ${participant.name}, результат комнаты ${participant.room}: ${participant.score} баллов.`;
    drawResultCard(participant, progress);
  }

  function drawResultCard(participant, progress) {
    const canvas = byId("result-card");
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f5f1e8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#192027";
    ctx.font = "700 54px sans-serif";
    ctx.fillText(config.hotelName, 70, 120);
    ctx.font = "700 72px sans-serif";
    ctx.fillText(`${participant.score} баллов`, 70, 270);
    ctx.font = "500 34px sans-serif";
    ctx.fillText(`Игрок: ${participant.name}`, 70, 370);
    ctx.fillText(`Комната: ${participant.room}`, 70, 430);
    ctx.fillText(`Персонажи: ${progress.found}/${progress.characters.length}`, 70, 490);
    ctx.fillStyle = "#2364aa";
    ctx.fillRect(70, 560, Math.max(24, progress.percent * 7), 34);
    ctx.fillStyle = "#192027";
    ctx.font = "700 32px sans-serif";
    ctx.fillText(`Прогресс ${progress.percent}%`, 70, 650);
    ctx.font = "500 28px sans-serif";
    ctx.fillText("Спасибо за игру", 70, 1060);
  }

  function returnToMap() {
    const url = new URL(window.location.href);
    url.searchParams.delete("spot");
    window.history.replaceState({}, "", url);
    setQuestView("map");
    render(getParticipant());
  }

  // === Регистрация ===
  byId("registration-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nameError = validateName(data.get("guestName"));
    const roomError = validateRoom(data.get("roomNumber"));
    const feedback = byId("registration-feedback");
    feedback.textContent = nameError || roomError;
    if (feedback.textContent) return;

    const participant = createParticipant(data);
    saveState(participant);
    queueEvent("registered", participant);
    render(participant);
  });

  // === Ответ на загадку ===
  byId("answer-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const character = getCharacter(currentSpot());
    if (!character || !isCharacterAvailable(character)) return;

    const input = byId("answer-input");
    const answer = normalizeText(input.value);
    if (!answer) return;

    const correct = character.answers.map(normalizeText).includes(answer);

    updateParticipant((participant) => {
      const spot = participant.spots[character.id];
      if (!spot || spot.solved || spot.attempts >= config.settings.maxAttempts) return;
      spot.attempts += 1;
      spot.lastAnswer = input.value.trim();
      spot.answeredAt = new Date().toISOString();

      if (correct) {
        const bonus = Number(character.attemptPoints[spot.attempts - 1] || 0);
        spot.solved = true;
        spot.score += bonus;
        participant.score += bonus;
        spot.lastFeedback = `Верно! Бонус за ${spot.attempts}-ю попытку: +${bonus}.`;
      } else if (spot.attempts >= config.settings.maxAttempts) {
        spot.lastFeedback = "Попытки закончились. Баллы за находку сохранены.";
      } else {
        spot.lastFeedback = `Пока нет. Осталось попыток: ${config.settings.maxAttempts - spot.attempts}.`;
      }
      participant.spots[character.id] = spot;
      queueEvent("answer", { participant, characterId: character.id, correct });
    });
    input.value = "";
  });

  byId("profile-button").addEventListener("click", () => setQuestView("profile"));
  byId("map-button").addEventListener("click", () => {
    returnToMap();
  });
  byId("weather-button").addEventListener("click", () => {
    const weather = config.settings.currentWeather;
    const labels = { sun: "Сегодня солнце", rain: "Сегодня дождь", cloudy: "Сегодня облачно" };
    const colors = { sun: "#e8a317", rain: "#2364aa", cloudy: "#65717b" };
    const btn = byId("weather-button");
    showWeatherToast(labels[weather] || "Погода", colors[weather] || "#2364aa");
  });
  byId("save-result-button").addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "hotel-quest-result.png";
    link.href = byId("result-card").toDataURL("image/png");
    link.click();
  });

  populateRoomOptions();
  loadRemoteConfig();

  const state = loadState();
  if (state) {
    render(state);
    syncQueue();
  } else {
    setScreen("start");
  }
})();