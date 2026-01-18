(() => {
  "use strict";

  const STORAGE_KEY = "bingoCallerState_v1";
  const THEME_KEY = "bingoCallerTheme_v1";
  const VOICE_KEY = "preferredVoiceName";

  const LETTERS = [
    { letter: "B", min: 1, max: 15 },
    { letter: "I", min: 16, max: 30 },
    { letter: "N", min: 31, max: 45 },
    { letter: "G", min: 46, max: 60 },
    { letter: "O", min: 61, max: 75 },
  ];

  /** DOM */
  let startBtn, nextBtn, resetBtn, fullscreenBtn, autoplayBtn, darkModeToggle;
  let intervalSelect, voiceToggle, voiceSelect;
  let currentCallEl, calledListEl, bingoGridEl, remainingEl;

  /** State */
  let deck = [];
  let deckIndex = 0;
  let called = []; // array of numbers in called order
  let current = null; // {letter, number}
  let autoplayTimerId = null;
  let voiceEnabled = false;
  let voices = [];
  let selectedVoiceName = "";

  function $(id) {
    return document.getElementById(id);
  }

  function shuffle(arr) {
    // Fisher-Yates
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function numToCall(n) {
    const group = LETTERS.find((g) => n >= g.min && n <= g.max);
    return { letter: group ? group.letter : "?", number: n };
  }

  function speakCall(call) {
    if (!voiceEnabled) return;
    if (!("speechSynthesis" in window)) return;

    // Cancel any queued speech to keep it snappy
    window.speechSynthesis.cancel();
    const letter = call.letter;
    const numberWords = numberToWords(call.number);
    const voice = getSelectedVoice();

    const utterLetter = new SpeechSynthesisUtterance(letter);
    utterLetter.rate = 0.95;
    utterLetter.pitch = 1.05;
    utterLetter.volume = 1.0;
    if (voice) utterLetter.voice = voice;

    const utterNumber = new SpeechSynthesisUtterance(numberWords);
    utterNumber.rate = 0.95;
    utterNumber.pitch = 1.05;
    utterNumber.volume = 1.0;
    if (voice) utterNumber.voice = voice;

    utterLetter.onend = () => {
      setTimeout(() => {
        window.speechSynthesis.speak(utterNumber);
      }, 180);
    };

    window.speechSynthesis.speak(utterLetter);
  }

  function saveState() {
    const data = {
      deck,
      deckIndex,
      called,
      current,
      voiceEnabled,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function numberToWords(n) {
    const ones = [
      "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
      "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
      "seventeen", "eighteen", "nineteen",
    ];
    const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy"];
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (o === 0) return tens[t];
    return `${tens[t]}-${ones[o]}`;
  }

  function getSelectedVoice() {
    if (!voices.length) return null;
    if (selectedVoiceName) {
      const match = voices.find((v) => v.name === selectedVoiceName);
      if (match) return match;
    }
    return null;
  }

  function pickDefaultVoice() {
    const englishVoices = voices.filter((v) => /^en/i.test(v.lang));
    const googleUs = englishVoices.find((v) => /google us english/i.test(v.name));
    if (googleUs) return googleUs.name;

    const natural = englishVoices.find((v) => /natural|neural|online/i.test(v.name));
    if (natural) return natural.name;

    const named = englishVoices.find((v) => /aria|jenny|samantha|google/i.test(v.name));
    if (named) return named.name;

    if (englishVoices.length) return englishVoices[0].name;
    return voices[0]?.name ?? "";
  }

  function initVoices() {
    voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length || !voiceSelect) return;

    voiceSelect.innerHTML = "";
    for (const v of voices) {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    }

    const saved = localStorage.getItem(VOICE_KEY);
    if (saved && voices.some((v) => v.name === saved)) {
      selectedVoiceName = saved;
    } else {
      selectedVoiceName = pickDefaultVoice();
      if (selectedVoiceName) {
        localStorage.setItem(VOICE_KEY, selectedVoiceName);
      }
    }
    if (selectedVoiceName) {
      voiceSelect.value = selectedVoiceName;
    }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.deck)) return false;
      deck = data.deck;
      deckIndex = Number.isFinite(data.deckIndex) ? data.deckIndex : 0;
      called = Array.isArray(data.called) ? data.called : [];
      current = data.current ?? null;
      voiceEnabled = !!data.voiceEnabled;
      return true;
    } catch {
      return false;
    }
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("theme-dark", isDark);
    document.documentElement.classList.toggle("theme-light", !isDark);
    darkModeToggle.setAttribute("aria-pressed", String(isDark));
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === "dark" || saved === "light" ? saved : "light";
    applyTheme(theme);
  }

  function buildGrid() {
    // Clear
    bingoGridEl.innerHTML = "";

    // Header row B I N G O
    const header = document.createElement("div");
    header.className = "bingo-header";
    for (const g of LETTERS) {
      const h = document.createElement("div");
      h.className = "bingo-header-cell";
      h.textContent = g.letter;
      header.appendChild(h);
    }
    bingoGridEl.appendChild(header);

    // Grid body (5 columns, 15 rows)
    const body = document.createElement("div");
    body.className = "bingo-body";

    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 5; col++) {
        const n = col * 15 + (row + 1); // 1..75 in B/I/N/G/O columns
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "bingo-cell";
        cell.dataset.number = String(n);
        cell.setAttribute("aria-label", `Number ${n}`);
        cell.textContent = String(n);
        body.appendChild(cell);
      }
    }

    bingoGridEl.appendChild(body);
  }

  function updateGridMarks() {
    const calledSet = new Set(called);
    const cells = bingoGridEl.querySelectorAll(".bingo-cell");
    cells.forEach((cell) => {
      const n = Number(cell.dataset.number);
      if (calledSet.has(n)) cell.classList.add("called");
      else cell.classList.remove("called");
    });
  }

  function updateCalledList() {
    // Most recent on top
    calledListEl.innerHTML = "";
    const reversed = [...called].reverse();
    const visible = reversed.slice(0, 5);

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No numbers called yet.";
      calledListEl.appendChild(empty);
      return;
    }

    for (const n of visible) {
      const call = numToCall(n);
      const item = document.createElement("div");
      item.className = "called-item";
      item.textContent = `${call.letter}${call.number}`;
      calledListEl.appendChild(item);
    }
  }

  function updateCurrentCall() {
    const letterEl = currentCallEl.querySelector(".call-letter");
    const numberEl = currentCallEl.querySelector(".call-number");
    if (!current) {
      currentCallEl.classList.add("is-empty");
      if (letterEl) letterEl.textContent = "";
      if (numberEl) numberEl.textContent = "PRESS START";
      return;
    }
    currentCallEl.classList.remove("is-empty");
    if (letterEl) letterEl.textContent = current.letter;
    if (numberEl) numberEl.textContent = String(current.number);
  }

  function updateUI() {
    updateCurrentCall();
    updateCalledList();
    updateGridMarks();

    // Button enable/disable
    const started = deck.length === 75;
    startBtn.disabled = started && deckIndex > 0; // allow start only before first draw
    nextBtn.disabled = !started || deckIndex >= deck.length;
    voiceToggle.checked = voiceEnabled;

    // Autoplay label
    if (autoplayTimerId) {
      autoplayBtn.textContent = "Stop Autoplay";
      autoplayBtn.classList.add("primary");
    } else {
      autoplayBtn.textContent = "Autoplay";
      autoplayBtn.classList.remove("primary");
    }

    if (remainingEl) {
      const remaining = Math.max(0, 75 - called.length);
      remainingEl.textContent = `Remaining: ${remaining}`;
    }

    const canStart = deck.length !== 75 || called.length === 0;
    currentCallEl.classList.toggle("is-clickable", canStart);
    currentCallEl.setAttribute("role", canStart ? "button" : "status");
    currentCallEl.setAttribute("aria-label", canStart ? "Press Start" : "Current call");
    currentCallEl.tabIndex = canStart ? 0 : -1;

    if (voiceSelect) {
      voiceSelect.disabled = !voiceEnabled;
      voiceSelect.classList.toggle("voice-disabled", !voiceEnabled);
    }
  }

  function handleBallActivate() {
    const canStart = deck.length !== 75 || called.length === 0;
    if (!canStart) return;
    startGame();
    nextNumber();
  }

  function startGame() {
    stopAutoplayTimer();

    deck = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
    deckIndex = 0;
    called = [];
    current = null;

    saveState();
    updateUI();
  }

  function nextNumber() {
    if (deck.length !== 75) return; // not started
    if (deckIndex >= deck.length) return; // finished

    const n = deck[deckIndex];
    deckIndex++;

    called.push(n);
    current = numToCall(n);

    saveState();
    updateUI();
    speakCall(current);

    if (deckIndex >= deck.length) {
      stopAutoplayTimer();
      updateUI();
    }
  }

  function resetGame() {
    stopAutoplayTimer();
    deck = [];
    deckIndex = 0;
    called = [];
    current = null;
    voiceEnabled = false;

    clearState();
    updateUI();
  }

  function stopAutoplayTimer() {
    if (autoplayTimerId) {
      clearInterval(autoplayTimerId);
      autoplayTimerId = null;
    }
  }

  function parseIntervalMs(rawValue) {
    const value = String(rawValue ?? "").trim();
    if (!value) return 8000;

    const hasSecondsSuffix = /s$/i.test(value);
    const numeric = Number.parseFloat(value.replace(/s$/i, ""));

    if (!Number.isFinite(numeric)) return 8000;
    if (hasSecondsSuffix || numeric < 100) return Math.round(numeric * 1000);
    return Math.round(numeric);
  }

  function startAutoplayTimer() {
    if (autoplayTimerId) return;
    if (deck.length !== 75) {
      console.warn("Autoplay requires a started game.");
      updateUI();
      return;
    }
    if (deckIndex >= deck.length) {
      console.warn("Autoplay cannot start after the game is finished.");
      updateUI();
      return;
    }

    const intervalMs = parseIntervalMs(intervalSelect.value);
    autoplayTimerId = setInterval(() => {
      if (deckIndex >= deck.length) {
        stopAutoplayTimer();
        updateUI();
        return;
      }
      nextNumber();
    }, intervalMs);

    updateUI();
  }

  function restartAutoplayTimer() {
    if (!autoplayTimerId) return;
    stopAutoplayTimer();
    startAutoplayTimer();
  }

  function toggleAutoplay() {
    if (autoplayTimerId) {
      stopAutoplayTimer();
      updateUI();
      return;
    }
    startAutoplayTimer();
  }

  async function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  function bindEvents() {
    startBtn.addEventListener("click", () => startGame());
    nextBtn.addEventListener("click", () => nextNumber());
    resetBtn.addEventListener("click", () => resetGame());

    autoplayBtn.addEventListener("click", () => {
      toggleAutoplay();
    });

    intervalSelect.addEventListener("change", () => {
      if (autoplayTimerId) restartAutoplayTimer();
    });

    voiceToggle.addEventListener("change", () => {
      voiceEnabled = !!voiceToggle.checked;
      if (!voiceEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      saveState();
      updateUI();
    });

    voiceSelect.addEventListener("change", () => {
      selectedVoiceName = voiceSelect.value;
      localStorage.setItem(VOICE_KEY, selectedVoiceName);
    });

    fullscreenBtn.addEventListener("click", () => {
      toggleFullscreen().catch(() => {});
    });

    darkModeToggle.addEventListener("click", () => {
      const isDark = document.documentElement.classList.contains("theme-dark");
      const nextTheme = isDark ? "light" : "dark";
      localStorage.setItem(THEME_KEY, nextTheme);
      applyTheme(nextTheme);
    });

    currentCallEl.addEventListener("click", () => handleBallActivate());
    currentCallEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        handleBallActivate();
      }
    });

    // Keyboard shortcuts: Space = Next, R = Reset
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        nextNumber();
      }
      if (e.key?.toLowerCase() === "r") {
        resetGame();
      }
    });
  }

  function init() {
    // Grab DOM references
    startBtn = $("startBtn");
    nextBtn = $("nextBtn");
    resetBtn = $("resetBtn");
    fullscreenBtn = $("fullscreenBtn");
    autoplayBtn = $("autoplayBtn");
    darkModeToggle = $("darkModeToggle");

    intervalSelect = $("intervalSelect");
    voiceToggle = $("voiceToggle");
    voiceSelect = $("voiceSelect");

    currentCallEl = $("currentCall");
    calledListEl = $("calledList");
    bingoGridEl = $("bingoGrid");
    const controlsEl = document.querySelector(".controls");
    if (controlsEl) {
      remainingEl = document.getElementById("remainingCount");
      if (!remainingEl) {
        remainingEl = document.createElement("div");
        remainingEl.id = "remainingCount";
        remainingEl.className = "remaining-count";
        controlsEl.insertAdjacentElement("afterend", remainingEl);
      }
    }

    // If any element missing, fail loudly in console
    const required = [
      startBtn, nextBtn, resetBtn, fullscreenBtn, autoplayBtn,
      darkModeToggle, intervalSelect, voiceToggle, voiceSelect, currentCallEl, calledListEl, bingoGridEl,
    ];
    if (required.some((x) => !x)) {
      console.error("Missing required elements. Check index.html IDs.");
      return;
    }

    buildGrid();

    // Restore prior state if available
    loadState();
    updateUI();
    initTheme();

    initVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => initVoices();
    }

    bindEvents();

    console.log("Bingo Caller ready ✅");
  }

  document.addEventListener("DOMContentLoaded", init);

  // Expose for debugging (optional)
  window.BingoCaller = {
    startGame,
    nextNumber,
    resetGame,
    toggleAutoplay,
    toggleVoice: (enabled) => { voiceEnabled = !!enabled; saveState(); updateUI(); },
  };
})();
