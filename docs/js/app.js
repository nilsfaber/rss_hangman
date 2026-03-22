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
    headlineDisplay: document.getElementById('headline-display'),
    headlineSource: document.getElementById('headline-source'),
    keyboard: document.getElementById('keyboard'),
    resultIcon: document.getElementById('result-icon'),
    resultActions: document.getElementById('result-actions'),
    gameLoading: document.getElementById('game-loading'),
    gameEmpty: document.getElementById('game-empty'),
    gameNoProxy: document.getElementById('game-no-proxy'),
    streakValue: document.getElementById('streak-value'),
    wrongBar: document.getElementById('wrong-bar'),
    btnRevealSource: document.getElementById('btn-reveal-source'),
  };

  // --- Keyboard Layout ---
  const KEYBOARD_ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];

  // --- Initialization ---
  function init() {
    settings = new Settings(rssService, game, onFeedsChanged);

    buildKeyboard();
    bindEvents();
    updateBottomBar();

    // Initial load
    if (!rssService.proxyUrl) {
      showNoProxyState();
    } else if (rssService.feeds.length === 0) {
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
        showNoProxyState();
      } else if (rssService.feeds.length > 0 && game.state === 'idle') {
        loadAndStartGame();
      }
    });
    els.btnNext.addEventListener('click', () => nextRound());
    els.btnSkip.addEventListener('click', () => skipRound());
    els.btnRevealSource.addEventListener('click', () => revealSource());
    els.btnGoSettings.addEventListener('click', () => showScreen('settings'));

    // Configure Proxy button — go to settings and scroll to Game section
    document.getElementById('btn-go-proxy-settings').addEventListener('click', () => {
      showScreen('settings');
      const gameSection = document.getElementById('proxy-url');
      if (gameSection) gameSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    if (!rssService.proxyUrl) {
      showNoProxyState();
      return;
    }
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

    const gameData = game.startGame(article.title, article.link, article.source);
    renderWrongBar();
    resetKeyboard();
    hideResult();
    els.headlineSource.textContent = '';
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
      els.headlineSource.classList.remove('hidden');
      els.btnRevealSource.classList.add('hidden');
    } else {
      els.headlineSource.textContent = '';
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
    els.headlineSource.classList.remove('hidden');
    els.btnRevealSource.classList.add('hidden');

    // Cost: one wrong guess
    game.wrongLetters.add('_source');
    renderWrongBar();

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
          shownGroup.className = 'word-group';
        }
        // Add space before non-punctuation words (unless group is empty)
        if (!word.isPunct && shownGroup.textContent.length > 0) {
          shownGroup.textContent += ' ';
        }
        shownGroup.textContent += word.text;
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

        if (!/[a-zA-Z\u00C0-\u024F]/.test(ch)) {
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

  // --- Win/Lose ---
  function onGameWon() {
    disableAllKeys();
    updateBottomBar();
    game.clearGameState();

    // Turn wrong-bar segments green on win
    els.wrongBar.querySelectorAll('.wrong-segment.filled').forEach(s => s.classList.add('won'));

    // Reveal all letters as won
    revealAllLetters('revealed');

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
    // Show icon above headline (absolutely positioned)
    els.resultIcon.textContent = won ? '🎉' : '💀';
    els.resultIcon.classList.remove('hidden');

    // Show source as clickable link under headline
    if (game.articleSource) {
      els.headlineSource.textContent = game.articleSource;
      if (game.articleLink) {
        els.headlineSource.href = game.articleLink;
      }
      els.headlineSource.classList.remove('hidden');
      els.btnRevealSource.classList.add('hidden');
    }

    // Show actions row (next button)
    els.resultActions.classList.remove('hidden');
  }

  function hideResult() {
    els.resultIcon.classList.add('hidden');
    els.resultActions.classList.add('hidden');
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
    els.gameNoProxy.classList.add('hidden');
    els.gameEmpty.classList.remove('hidden');
  }

  function showNoProxyState() {
    els.gameLoading.classList.add('hidden');
    els.gameEmpty.classList.add('hidden');
    els.gameNoProxy.classList.remove('hidden');
  }

  function updateBottomBar() {
    els.streakValue.textContent = game.streak;
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
