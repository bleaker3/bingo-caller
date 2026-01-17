(() => {
  "use strict";

  const STORAGE_KEY = "bingoCallerState_v1";

  const LETTERS = [
    { letter: "B", min: 1, max: 15 },
    { letter: "I", min: 16, max: 30 },
    { letter: "N", min: 31, max: 45 },
    { letter: "G", min: 46, max: 60 },
    { letter: "O", min: 61, max: 75 },
  ];

  /** DOM */
  let startBtn, nextBtn, resetBtn, fullscreenBtn, autoplayBtn;
  let intervalSelect, voiceToggle;
  let currentCallEl, calledListEl, bingoGridEl;

  /** State */
  let deck = [];
  let deckIndex = 0;
  let called = []; // array of numbers in called order
  let current = null; // {letter, number}
  let autoplayTimer = null;
  let voiceEnabled = false;

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

    const letterNameMap = { B: "B", I: "I", N: "N", G: "G", O: "O" };
    const phrase = `${letterNameMap[call.letter] ?? call.letter} ${call.number}`;

    // Cancel any queued speech to keep it snappy
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
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

    if (reversed.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No numbers called yet.";
      calledListEl.appendChild(empty);
      return;
    }

    for (const n of reversed) {
      const call = numToCall(n);
      const item = document.createElement("div");
      item.className = "called-item";
      item.textContent = `${call.letter}${call.number}`;
      calledListEl.appendChild(item);
    }
  }

  function updateCurrentCall() {
    if (!current) {
      currentCallEl.textContent = "Press Start";
      return;
    }
    currentCallEl.textContent = `${current.letter}${current.number}`;
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
    if (autoplayTimer) {
      autoplayBtn.textContent = "Stop Autoplay";
      autoplayBtn.classList.add("primary");
    } else {
      autoplayBtn.textContent = "Autoplay";
      autoplayBtn.classList.remove("primary");
    }
  }

  function startGame() {
    stopAutoplay();

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
      stopAutoplay();
      updateUI();
    }
  }

  function resetGame() {
    stopAutoplay();
    deck = [];
    deckIndex = 0;
    called = [];
    current = null;
    voiceEnabled = false;

    clearState();
    updateUI();
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function parseIntervalMs(rawValue) {
    const value = String(rawValue ?? "").trim();
    if (!value) return 5000;

    const hasSecondsSuffix = /s$/i.test(value);
    const numeric = Number.parseFloat(value.replace(/s$/i, ""));

    if (!Number.isFinite(numeric)) return 5000;
    if (hasSecondsSuffix || numeric < 100) return Math.round(numeric * 1000);
    return Math.round(numeric);
  }

  function toggleAutoplay(rawInterval) {
    if (autoplayTimer) {
      stopAutoplay();
      updateUI();
      return;
    }
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

    const intervalMs = parseIntervalMs(rawInterval);

    autoplayTimer = setInterval(() => {
      if (deckIndex >= deck.length) {
        stopAutoplay();
        updateUI();
        return;
      }
      nextNumber();
    }, intervalMs);

    updateUI();
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
      toggleAutoplay(intervalSelect.value);
    });

    voiceToggle.addEventListener("change", () => {
      voiceEnabled = !!voiceToggle.checked;
      saveState();
    });

    fullscreenBtn.addEventListener("click", () => {
      toggleFullscreen().catch(() => {});
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

    intervalSelect = $("intervalSelect");
    voiceToggle = $("voiceToggle");

    currentCallEl = $("currentCall");
    calledListEl = $("calledList");
    bingoGridEl = $("bingoGrid");

    // If any element missing, fail loudly in console
    const required = [
      startBtn, nextBtn, resetBtn, fullscreenBtn, autoplayBtn,
      intervalSelect, voiceToggle, currentCallEl, calledListEl, bingoGridEl,
    ];
    if (required.some((x) => !x)) {
      console.error("Missing required elements. Check index.html IDs.");
      return;
    }

    buildGrid();

    // Restore prior state if available
    loadState();
    updateUI();

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
