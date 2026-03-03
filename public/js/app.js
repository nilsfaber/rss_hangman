/**
 * App - Main application controller.
 * Orchestrates screens, game flow, canvas, keyboard, and UI updates.
 */
(function () {
  'use strict';

  // --- Instances ---
  const rssService = new RSSService();
  const game = new Game();
  let hangmanCanvas;
  let settings;

  // --- DOM References ---
  const screens = {
    game: document.getElementById('screen-game'),
    settings: document.getElementById('screen-settings')
  };

  const els = {
    btnSettings: document.getElementById('btn-settings'),
    btnBack: document.getElementById('btn-back'),
    btnNext: document.getElementById('btn-next'),
    btnSkip: document.getElementById('btn-skip'),
    btnGoSettings: document.getElementById('btn-go-settings'),
    appTitle: document.getElementById('app-title'),
    headlineDisplay: document.getElementById('headline-display'),
    headlineSource: document.getElementById('headline-source'),
    keyboard: document.getElementById('keyboard'),
    gameOverlay: document.getElementById('game-overlay'),
    overlayIcon: document.getElementById('overlay-icon'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayHeadline: document.getElementById('overlay-headline'),
    overlayStats: document.getElementById('overlay-stats'),
    gameLoading: document.getElementById('game-loading'),
    gameEmpty: document.getElementById('game-empty'),
    scoreValue: document.getElementById('score-value'),
    diffValue: document.getElementById('diff-value'),
    streakValue: document.getElementById('streak-value'),
    wrongCurrent: document.getElementById('wrong-current'),
    wrongMax: document.getElementById('wrong-max'),
    btnRevealSource: document.getElementById('btn-reveal-source'),
    hangmanCanvas: document.getElementById('hangman-canvas')
  };

  // --- Keyboard Layout ---
  const KEYBOARD_ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];

  // --- Initialization ---
  function init() {
    hangmanCanvas = new HangmanCanvas(els.hangmanCanvas);
    settings = new Settings(rssService, game, onFeedsChanged);

    buildKeyboard();
    bindEvents();
    updateBottomBar();

    // Initial load
    if (rssService.feeds.length === 0) {
      showEmptyState();
    } else {
      // Try to restore an in-progress game first
      const restored = game.restoreGameState();
      if (restored) {
        restoreRound(restored);
        // Refresh headlines in background
        rssService.fetchAllHeadlines().catch(() => {});
      } else {
        loadAndStartGame();
      }
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
      els.btnSettings.classList.add('hidden');
      els.btnBack.classList.remove('hidden');
      els.appTitle.textContent = 'Settings';
      settings.render();
    } else {
      els.btnSettings.classList.remove('hidden');
      els.btnBack.classList.add('hidden');
      els.appTitle.textContent = 'RSS Hangman';
    }
  }

  // --- Events ---
  function bindEvents() {
    els.btnSettings.addEventListener('click', () => showScreen('settings'));
    els.btnBack.addEventListener('click', () => {
      showScreen('game');
      // If feeds exist but no game is running, load headlines
      if (rssService.feeds.length > 0 && game.state === 'idle') {
        loadAndStartGame();
      }
    });
    els.btnNext.addEventListener('click', () => nextRound());
    els.btnSkip.addEventListener('click', () => skipRound());
    els.btnRevealSource.addEventListener('click', () => revealSource());
    els.btnGoSettings.addEventListener('click', () => showScreen('settings'));

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
    els.keyboard.innerHTML = '';

    KEYBOARD_ROWS.forEach(row => {
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
    showLoadingState();

    try {
      const headlines = await rssService.fetchAllHeadlines();
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

    hangmanCanvas.setMaxStages(game.maxWrong);
    hangmanCanvas.reset();
    resetKeyboard();
    hideOverlay();

    const gameData = game.startGame(article.title, article.link, article.source);
    els.headlineSource.textContent = '';
    els.headlineSource.classList.add('hidden');
    els.btnRevealSource.disabled = false;
    els.btnRevealSource.classList.remove('used');
    renderHeadline(gameData);
    updateBottomBar();
    updateWrongCount();
  }

  /** Restore a previously in-progress game after page refresh. */
  function restoreRound(gameData) {
    hangmanCanvas.setMaxStages(game.maxWrong);
    hangmanCanvas.reset();
    resetKeyboard();
    hideOverlay();

    // Re-draw hangman stages for wrong guesses
    for (let i = 0; i < game.wrongLetters.size; i++) {
      hangmanCanvas.addStage();
    }

    // Mark already-guessed keys on keyboard
    game.guessedLetters.forEach(letter => {
      if (letter.startsWith('_')) return; // skip special markers like _source
      const correct = game.correctLetters.has(letter);
      markKey(letter, correct);
    });

    // Check if source was already revealed (via _source marker)
    if (game.wrongLetters.has('_source')) {
      els.headlineSource.textContent = game.articleSource || 'Unknown';
      els.headlineSource.classList.remove('hidden');
      els.btnRevealSource.disabled = true;
      els.btnRevealSource.classList.add('used');
    } else {
      els.headlineSource.textContent = '';
      els.headlineSource.classList.add('hidden');
      els.btnRevealSource.disabled = false;
      els.btnRevealSource.classList.remove('used');
    }

    renderHeadline(gameData);
    // Reveal already-guessed correct letters in the UI
    game.correctLetters.forEach(letter => {
      const positions = game._getRevealedPositions(letter);
      revealLetters(positions);
    });

    updateBottomBar();
    updateWrongCount();
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
    if (game.state !== 'playing') return;
    game.streak = 0;
    game._saveStats();
    game.clearGameState();
    nextRound();
  }

  function revealSource() {
    if (game.state !== 'playing') return;
    if (els.btnRevealSource.classList.contains('used')) return;

    // Show the source
    els.headlineSource.textContent = game.articleSource || 'Unknown';
    els.headlineSource.classList.remove('hidden');
    els.btnRevealSource.disabled = true;
    els.btnRevealSource.classList.add('used');

    // Cost: one wrong guess
    game.wrongLetters.add('_source');
    hangmanCanvas.addStage();
    updateWrongCount();

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
      hangmanCanvas.addStage();
      updateWrongCount();
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

    gameData.words.forEach((word, wordIdx) => {
      const isHidden = gameData.hiddenIndices.includes(wordIdx);

      if (word.isPunct) {
        const span = document.createElement('span');
        span.className = 'letter-slot punctuation';
        span.textContent = word.text;
        els.headlineDisplay.appendChild(span);
        return;
      }

      const group = document.createElement('span');
      group.className = 'word-group';

      for (let i = 0; i < word.text.length; i++) {
        const ch = word.text[i];
        const span = document.createElement('span');
        span.dataset.wordIdx = wordIdx;
        span.dataset.charIdx = i;

        if (!isHidden || !/[a-zA-Z]/.test(ch)) {
          // Shown letter or non-alpha in hidden word
          span.className = 'letter-slot shown-letter';
          span.textContent = ch;
        } else {
          // Hidden letter
          span.className = 'letter-slot hidden-letter';
          span.textContent = ch; // stored but hidden via CSS (color: transparent)
        }

        group.appendChild(span);
      }

      els.headlineDisplay.appendChild(group);
    });
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

  // --- Win/Lose ---
  function onGameWon() {
    disableAllKeys();
    updateBottomBar();
    game.clearGameState();

    setTimeout(() => {
      showOverlay(true);
    }, 500);
  }

  function onGameLost() {
    disableAllKeys();
    revealAllLetters('lost-reveal');
    updateBottomBar();
    game.clearGameState();

    setTimeout(() => {
      showOverlay(false);
    }, 800);
  }

  function showOverlay(won) {
    els.overlayIcon.textContent = won ? '🎉' : '💀';
    els.overlayTitle.textContent = won ? 'You Got It!' : 'Game Over';
    els.overlayTitle.className = won ? 'win' : 'lose';
    els.overlayHeadline.textContent = game.headline;

    // Show source in overlay
    const overlaySource = document.getElementById('overlay-source');
    overlaySource.textContent = game.articleSource || '';

    // Always show source on game end
    if (game.articleSource) {
      els.headlineSource.textContent = game.articleSource;
      els.headlineSource.classList.remove('hidden');
    }

    // Article link
    const overlayLink = document.getElementById('overlay-link');
    if (game.articleLink) {
      overlayLink.href = game.articleLink;
      overlayLink.textContent = 'Read Article \u2192';
    } else {
      overlayLink.href = '#';
      overlayLink.textContent = '';
    }

    const accuracy = game.guessedLetters.size > 0
      ? Math.round((game.correctLetters.size / game.guessedLetters.size) * 100)
      : 0;

    els.overlayStats.innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${game.correctLetters.size}</span>
        <span>Correct</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${game.wrongLetters.size}</span>
        <span>Wrong</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${accuracy}%</span>
        <span>Accuracy</span>
      </div>
    `;

    els.gameOverlay.classList.remove('hidden');
  }

  function hideOverlay() {
    els.gameOverlay.classList.add('hidden');
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
    els.gameEmpty.classList.remove('hidden');
  }

  function updateBottomBar() {
    els.scoreValue.textContent = game.score;
    els.diffValue.textContent = Game.DIFFICULTY_CONFIG[game.difficulty].label;
    els.streakValue.textContent = game.streak;
  }

  function updateWrongCount() {
    els.wrongCurrent.textContent = game.wrongLetters.size;
    els.wrongMax.textContent = game.maxWrong;
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
