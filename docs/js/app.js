/**
 * App - Main application controller.
 * Orchestrates screens, game flow, canvas, keyboard, and UI updates.
 */
(function () {
  'use strict';

  // --- Instances ---
  const rssService = new RSSService();
  const game = new Game();
  let settings;
  let confettiCleanupTimer;
  let streakResetTimer;

  // --- DOM References ---
  const screens = {
    game: document.getElementById('screen-game'),
    settings: document.getElementById('screen-settings')
  };

  const els = {
    gameContainer: document.getElementById('game-container'),
    btnSettings: document.getElementById('btn-settings'),
    btnBack: document.getElementById('btn-back'),
    btnSkip: document.getElementById('btn-skip'),
    headlineDisplay: document.getElementById('headline-display'),
    headlineSource: document.getElementById('headline-source'),
    keyboard: document.getElementById('keyboard'),
    gameLoading: document.getElementById('game-loading'),
    gameEmpty: document.getElementById('game-empty'),
    streakValue: document.getElementById('streak-value'),
    wrongBar: document.getElementById('wrong-bar'),
    btnRevealSource: document.getElementById('btn-reveal-source'),
    streakDisplay: document.getElementById('streak-display'),
    statsTooltip: document.getElementById('stats-tooltip'),
    ttStreak: document.getElementById('tt-streak'),
    ttPlayed: document.getElementById('tt-played'),
    ttWon: document.getElementById('tt-won'),
    ttRate: document.getElementById('tt-rate'),
  };

  const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff922b'];

  // --- Keyboard Layouts ---
  const KEYBOARD_LAYOUTS = {
    qwerty:  [
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['z','x','c','v','b','n','m']
    ],
    azerty: [
      ['a','z','e','r','t','y','u','i','o','p'],
      ['q','s','d','f','g','h','j','k','l','m'],
      ['w','x','c','v','b','n']
    ],
    qwertz: [
      ['q','w','e','r','t','z','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['y','x','c','v','b','n','m']
    ],
    dvorak: [
      ['p','y','f','g','c','r','l'],
      ['a','o','e','u','i','d','h','t','n','s'],
      ['q','j','k','x','b','m','w','v','z']
    ],
    colemak: [
      ['q','w','f','p','g','j','l','u','y'],
      ['a','r','s','t','d','h','n','e','i','o'],
      ['z','x','c','v','b','k','m']
    ]
  };

  // --- Initialization ---
  function init() {
    settings = new Settings(rssService, game, onFeedsChanged, onLayoutChanged);

    // Detect layout on first visit, then build keyboard
    if (!localStorage.getItem('hangman_keyboard_layout')) {
      detectKeyboardLayout().then(layout => {
        localStorage.setItem('hangman_keyboard_layout', layout);
        buildKeyboard();
      });
    }
    buildKeyboard();
    bindEvents();
    updateBottomBar();

    // Initial load
    if (!rssService.proxyUrl) {
      showEmptyState();
    } else if (rssService.feeds.length === 0) {
      showEmptyState();
    } else {
      // Try to restore an in-progress game first
      const restored = game.restoreGameState();
      if (restored) {
        restoreRound(restored);
        // Refresh headlines in background
        rssService.fetchAllHeadlines().then(h => game.pruneUsedHeadlines(h)).catch(() => {});
      } else {
        loadAndStartGame();
      }
    }

    // Request persistent storage so the browser won't silently evict settings
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist();
    }

    // Register service worker
    registerSW();
  }

  // --- Screen Navigation ---
  function showScreen(name) {
    Object.keys(screens).forEach(key => {
      screens[key].classList.toggle('active', key === name);
    });

    if (name === 'settings') {
      settings.render();
    }
  }

  // --- Events ---
  function bindEvents() {
    els.btnSettings.addEventListener('click', () => showScreen('settings'));
    els.btnBack.addEventListener('click', () => {
      showScreen('game');
      // If feeds exist but no game is running, load headlines
      if (!rssService.proxyUrl) {
        showEmptyState();
      } else if (rssService.feeds.length > 0 && game.state === 'idle') {
        loadAndStartGame();
      }
    });
    els.btnSkip.addEventListener('click', () => skipRound());
    els.btnRevealSource.addEventListener('click', () => revealSource());
    els.gameEmpty.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      showScreen('settings');
      if (btn.dataset.scrollTo) {
        const target = document.getElementById(btn.dataset.scrollTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    els.headlineSource.addEventListener('click', (e) => {
      if (game.state === 'playing' || !els.headlineSource.getAttribute('href')) {
        e.preventDefault();
      }
    });

    // Stats tooltip
    els.streakDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStatsTooltip();
    });
    document.addEventListener('click', () => {
      els.statsTooltip.classList.add('hidden');
    });

    // Physical keyboard
    document.addEventListener('keydown', (e) => {
      if (screens.settings.classList.contains('active')) return;
      if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
        handleGuess(e.key.toLowerCase());
      }
    });
  }

  // --- Keyboard ---
  function buildKeyboard() {
    const layoutKey = localStorage.getItem('hangman_keyboard_layout') || 'qwerty';
    const rows = KEYBOARD_LAYOUTS[layoutKey] || KEYBOARD_LAYOUTS.qwerty;

    els.keyboard.innerHTML = '';
    rows.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      row.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'key-btn';
        btn.textContent = letter;
        btn.dataset.letter = letter;
        btn.addEventListener('click', () => handleGuess(letter));
        rowEl.appendChild(btn);
      });
      els.keyboard.appendChild(rowEl);
    });

    // Re-apply current guess state to the new buttons
    game.correctLetters.forEach(l => markKey(l, true));
    game.wrongLetters.forEach(l => { if (!l.startsWith('_')) markKey(l, false); });
    if (game.state !== 'playing') disableAllKeys();
  }

  function onLayoutChanged() {
    buildKeyboard();
  }

  async function detectKeyboardLayout() {
    // Try the Keyboard API first (Chrome/Edge)
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      try {
        const map = await navigator.keyboard.getLayoutMap();
        if (map.get('KeyQ') === 'a') return 'azerty';
        if (map.get('KeyZ') === 'y') return 'qwertz';
        return 'qwerty';
      } catch (e) { /* fall through */ }
    }
    // Language-based fallback
    const [locale] = (navigator.language || 'en').toLowerCase().split(/[-_]/);
    if (locale === 'fr') return 'azerty';
    if (['de', 'at', 'cs', 'sk', 'hu', 'hr', 'sl'].includes(locale)) return 'qwertz';
    return 'qwerty';
  }

  function resetKeyboard() {
    els.keyboard.querySelectorAll('.key-btn').forEach(btn => {
      btn.disabled = false;
      btn.className = 'key-btn';
    });
  }

  function markKey(letter, correct) {
    const btn = els.keyboard.querySelector(`[data-letter="${letter}"]`);
    if (btn) {
      btn.disabled = true;
      btn.classList.add(correct ? 'correct' : 'wrong');
    }
  }

  function disableAllKeys() {
    els.keyboard.querySelectorAll('.key-btn').forEach(btn => {
      btn.disabled = true;
    });
  }

  // --- Game Flow ---
  async function loadAndStartGame() {
    if (!rssService.proxyUrl) {
      showEmptyState();
      return;
    }
    showLoadingState();

    try {
      const headlines = await rssService.fetchAllHeadlines();
      game.pruneUsedHeadlines(headlines);
      if (headlines.length === 0) {
        showEmptyState();
        return;
      }
      hideLoadingState();
      startNewRound(headlines);
    } catch (err) {
      // Try cached headlines
      if (rssService.headlines.length > 0) {
        hideLoadingState();
        startNewRound(rssService.headlines);
      } else {
        showEmptyState();
      }
    }
  }

  function startNewRound(headlines) {
    const article = game.pickHeadline(headlines || rssService.headlines, rssService);
    if (!article) {
      showEmptyState();
      return;
    }

    const gameData = game.startGame(article.title, article.link, article.source);
    renderWrongBar();
    resetKeyboard();
    hideResult();
    els.headlineSource.textContent = '';
    els.headlineSource.removeAttribute('href');
    els.headlineSource.classList.add('hidden');
    els.btnRevealSource.disabled = false;
    els.btnRevealSource.classList.remove('hidden');
    renderHeadline(gameData);
    updateBottomBar();
  }

  /** Restore a previously in-progress game after page refresh. */
  function restoreRound(gameData) {
    renderWrongBar();
    resetKeyboard();
    hideResult();

    // Mark already-guessed keys on keyboard
    game.guessedLetters.forEach(letter => {
      if (letter.startsWith('_')) return; // skip special markers like _source
      const correct = game.correctLetters.has(letter);
      markKey(letter, correct);
    });

    // Check if source was already revealed (via _source marker)
    if (game.wrongLetters.has('_source')) {
      els.headlineSource.textContent = game.articleSource || 'Unknown';
      els.headlineSource.removeAttribute('href');
      els.headlineSource.classList.remove('hidden');
      els.btnRevealSource.classList.add('hidden');
    } else {
      els.headlineSource.textContent = '';
      els.headlineSource.removeAttribute('href');
      els.headlineSource.classList.add('hidden');
      els.btnRevealSource.classList.remove('hidden');
      els.btnRevealSource.disabled = false;
    }

    renderHeadline(gameData);
    // Reveal already-guessed correct letters in the UI
    game.correctLetters.forEach(letter => {
      const positions = game._getRevealedPositions(letter);
      revealLetters(positions);
    });

    updateBottomBar();
  }

  function nextRound() {
    game.clearGameState();
    if (rssService.headlines.length > 0) {
      startNewRound(rssService.headlines);
    } else {
      loadAndStartGame();
    }
  }

  function skipRound() {
    if (game.state === 'won' || game.state === 'lost') {
      nextRound();
      return;
    }
    if (game.state !== 'playing') return;
    game.streak = 0;
    game._saveStats();
    game.clearGameState();
    nextRound();
  }

  function revealSource() {
    if (game.state !== 'playing') return;
    if (els.btnRevealSource.classList.contains('hidden')) return;

    // Replace button with source text
    els.headlineSource.textContent = game.articleSource || 'Unknown';
    els.headlineSource.removeAttribute('href');
    els.headlineSource.classList.remove('hidden');
    els.btnRevealSource.classList.add('hidden');

    // Cost: one wrong guess
    game.wrongLetters.add('_source');
    renderWrongBar();
    game._saveGameState();

    // Check if this causes a loss
    if (game.wrongLetters.size >= game.maxWrong) {
      game.state = 'lost';
      game.streak = 0;
      game.gamesPlayed++;
      game._saveStats();
      onGameLost();
    }
  }

  function handleGuess(letter) {
    if (game.state !== 'playing') return;

    const result = game.guessLetter(letter);
    if (!result) return;

    markKey(result.letter, result.correct);

    if (result.correct) {
      revealLetters(result.revealed);
    } else {
      renderWrongBar();
      // Shake headline on wrong guess
      els.headlineDisplay.classList.add('shake');
      setTimeout(() => els.headlineDisplay.classList.remove('shake'), 400);
    }

    if (result.gameState === 'won') {
      onGameWon();
    } else if (result.gameState === 'lost') {
      onGameLost();
    }
  }

  // --- Headline Rendering ---
  function renderHeadline(gameData) {
    els.headlineDisplay.innerHTML = '';

    let shownGroup = null; // accumulates consecutive shown words
    const breakAfterPunctuation = /[,:.;]/;

    function appendLineBreak() {
      const lineBreak = document.createElement('span');
      lineBreak.className = 'headline-break';
      els.headlineDisplay.appendChild(lineBreak);
    }

    function flushShown() {
      if (shownGroup) {
        els.headlineDisplay.appendChild(shownGroup);
        shownGroup = null;
      }
    }

    gameData.words.forEach((word, wordIdx) => {
      const isHidden = gameData.hiddenIndices.includes(wordIdx);

      if (word.isPunct || !isHidden) {
        // Accumulate into a shared shown group
        if (!shownGroup) {
          shownGroup = document.createElement('span');
          shownGroup.className = 'word-group shown-group';
        }
        // Add space before non-punctuation words (unless group is empty)
        if (!word.isPunct && shownGroup.textContent.length > 0) {
          shownGroup.textContent += ' ';
        }
        shownGroup.textContent += word.text;

        if (breakAfterPunctuation.test(word.text) && word.spaceAfter) {
          flushShown();
          appendLineBreak();
        }

        return;
      }

      // Hidden word — flush any accumulated shown text first
      flushShown();

      const group = document.createElement('span');
      group.className = 'word-group';

      for (let i = 0; i < word.text.length; i++) {
        const ch = word.text[i];
        const span = document.createElement('span');
        span.dataset.wordIdx = wordIdx;
        span.dataset.charIdx = i;

        const norm = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (!/[a-zA-Z\u00C0-\u024F]/.test(ch) || !/^[a-z]$/.test(norm)) {
          span.className = 'letter-slot shown-letter';
          span.textContent = ch;
        } else {
          span.className = 'letter-slot hidden-letter';
          span.textContent = ch;
        }

        group.appendChild(span);
      }

      els.headlineDisplay.appendChild(group);
    });

    flushShown();
  }

  function revealLetters(positions) {
    positions.forEach(({ wordIdx, charIdx }, i) => {
      const slot = els.headlineDisplay.querySelector(
        `[data-word-idx="${wordIdx}"][data-char-idx="${charIdx}"]`
      );
      if (slot) {
        setTimeout(() => {
          slot.classList.add('revealed');
          slot.classList.add('pop-in');
        }, i * 50); // stagger animation
      }
    });
  }

  function revealAllLetters(className) {
    els.headlineDisplay.querySelectorAll('.hidden-letter:not(.revealed)').forEach((slot, i) => {
      setTimeout(() => {
        slot.classList.add(className);
        slot.classList.add('pop-in');
      }, i * 30);
    });
  }

  function ensureConfettiLayer() {
    if (els.confettiLayer) return;
    const layer = document.createElement('div');
    layer.id = 'confetti-layer';
    els.gameContainer.appendChild(layer);
    els.confettiLayer = layer;
  }

  function burstConfetti() {
    ensureConfettiLayer();

    clearTimeout(confettiCleanupTimer);
    els.confettiLayer.innerHTML = '';

    const layerRect = els.confettiLayer.getBoundingClientRect();
    const streakRect = els.streakValue.getBoundingClientRect();
    const originX = streakRect.left + (streakRect.width / 2) - layerRect.left;
    const originY = streakRect.top + (streakRect.height / 2) - layerRect.top;

    const pieceCount = 56;
    for (let i = 0; i < pieceCount; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';

      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * 180;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance + 110;

      piece.style.setProperty('--tx', `${tx.toFixed(1)}px`);
      piece.style.setProperty('--ty', `${ty.toFixed(1)}px`);
      piece.style.setProperty('--rot', `${Math.round((Math.random() * 900) - 450)}deg`);
      piece.style.setProperty('--delay', `${Math.round(Math.random() * 140)}ms`);
      piece.style.width = `${6 + Math.round(Math.random() * 6)}px`;
      piece.style.height = `${10 + Math.round(Math.random() * 8)}px`;
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.left = `${originX}px`;
      piece.style.top = `${originY}px`;

      els.confettiLayer.appendChild(piece);
    }

    confettiCleanupTimer = setTimeout(() => {
      if (els.confettiLayer) {
        els.confettiLayer.innerHTML = '';
      }
    }, 1700);
  }

  // --- Win/Lose ---
  function onGameWon() {
    disableAllKeys();
    updateBottomBar();
    game.clearGameState();

    // Turn wrong-bar segments green on win
    els.wrongBar.querySelectorAll('.wrong-segment.filled').forEach(s => s.classList.add('won'));

    // Reveal all letters as won
    revealAllLetters('revealed');
    burstConfetti();

    setTimeout(() => {
      showResult(true);
    }, 500);
  }

  function onGameLost() {
    disableAllKeys();
    revealAllLetters('lost-reveal');
    updateBottomBar();
    game.clearGameState();

    setTimeout(() => {
      showResult(false);
    }, 800);
  }

  function showResult(won) {
    const streakClass = won ? 'outcome-won' : 'outcome-lost';
    els.streakValue.classList.remove('outcome-won', 'outcome-lost');
    void els.streakValue.offsetWidth;
    els.streakValue.classList.add(streakClass);

    els.btnSkip.classList.remove('wiggle');
    void els.btnSkip.offsetWidth;
    els.btnSkip.classList.add('wiggle');

    // Show source as clickable link under headline
    if (game.articleSource) {
      els.headlineSource.textContent = game.articleSource;
      if (game.articleLink) {
        els.headlineSource.href = game.articleLink;
      } else {
        els.headlineSource.removeAttribute('href');
      }
      els.headlineSource.classList.remove('hidden');
      els.btnRevealSource.classList.add('hidden');
    }
  }

  function hideResult() {
    els.btnSkip.classList.remove('wiggle');
  }

  // --- UI State ---
  function showLoadingState() {
    els.gameLoading.classList.remove('hidden');
    els.gameEmpty.classList.add('hidden');
  }

  function hideLoadingState() {
    els.gameLoading.classList.add('hidden');
  }

  function showEmptyState() {
    els.gameLoading.classList.add('hidden');
    if (!rssService.proxyUrl) {
      els.gameEmpty.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" width="64" height="64"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-8h2v6h-2V9z"/></svg>
        <h2>CORS Proxy Not Configured</h2>
        <p>A proxy is needed to fetch RSS feeds. Set it up in Game settings.</p>
        <button class="btn-primary" data-scroll-to="proxy-url">Configure Proxy</button>
      </div>`;
    } else {
      els.gameEmpty.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" width="64" height="64"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <h2>No Headlines Available</h2>
        <p>Add RSS feeds in Settings to start playing!</p>
        <button class="btn-primary">Open Settings</button>
      </div>`;
    }
    els.gameEmpty.classList.remove('hidden');
  }

  function updateBottomBar() {
    const nextStreak = Number(game.streak) || 0;
    const currentStreak = Number(els.streakValue.textContent) || 0;

    clearTimeout(streakResetTimer);

    if (currentStreak > 0 && nextStreak === 0) {
      els.streakValue.classList.remove('outcome-won', 'outcome-lost', 'streak-reset-in', 'streak-reset-out');
      void els.streakValue.offsetWidth;
      els.streakValue.classList.add('streak-reset-out');

      streakResetTimer = setTimeout(() => {
        els.streakValue.textContent = '0';
        els.streakValue.classList.remove('streak-reset-out');
        void els.streakValue.offsetWidth;
        els.streakValue.classList.add('streak-reset-in');

        streakResetTimer = setTimeout(() => {
          els.streakValue.classList.remove('streak-reset-in');
        }, 320);
      }, 340);
      return;
    }

    els.streakValue.classList.remove('streak-reset-out', 'streak-reset-in');
    els.streakValue.textContent = String(nextStreak);
  }

  function toggleStatsTooltip() {
    const isHidden = els.statsTooltip.classList.contains('hidden');
    if (isHidden) {
      els.ttStreak.textContent = game.streak;
      els.ttPlayed.textContent = game.gamesPlayed;
      els.ttWon.textContent = game.gamesWon;
      els.ttRate.textContent = game.gamesPlayed > 0
        ? Math.round(game.gamesWon / game.gamesPlayed * 100) + '%'
        : '—';
      els.statsTooltip.classList.remove('hidden');
    } else {
      els.statsTooltip.classList.add('hidden');
    }
  }

  function renderWrongBar() {
    const max = game.maxWrong;
    const wrong = game.wrongLetters.size;
    let html = '';
    for (let i = 0; i < max; i++) {
      html += `<div class="wrong-segment${i < wrong ? ' filled' : ''}"></div>`;
    }
    els.wrongBar.innerHTML = html;
  }

  // --- Feed Changes ---
  function onFeedsChanged() {
    if (rssService.feeds.length === 0) {
      rssService.headlines = [];
      game.state = 'idle';
      showEmptyState();
    } else {
      // Mark idle so the back-button will trigger a fresh load
      if (game.state === 'idle') {
        els.gameEmpty.classList.add('hidden');
      }
    }
  }

  // --- Service Worker ---
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
    }
  }

  // --- Start ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
