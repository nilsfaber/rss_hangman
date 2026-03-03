/**
 * Game - Core hangman game logic.
 * Manages headline parsing, letter revealing, win/lose conditions, scoring.
 */
class Game {
  constructor() {
    this.headline = '';
    this.articleLink = '';     // link to the source article
    this.articleSource = '';    // feed/publisher name
    this.words = [];          // array of word objects
    this.hiddenIndices = [];   // indices of words that are hidden
    this.guessedLetters = new Set();
    this.correctLetters = new Set();
    this.wrongLetters = new Set();
    this.maxWrong = 6;
    this.difficulty = 'easy';  // easy, medium, hard, expert
    this.state = 'idle';       // idle, playing, won, lost
    this.score = 0;
    this.streak = 0;
    this.gamesPlayed = 0;
    this.gamesWon = 0;
    this.usedHeadlines = new Set();

    this._loadStats();
    this._loadUsedHeadlines();
  }

  /**
   * Get difficulty percentages for how many words to hide
   */
  static get DIFFICULTY_CONFIG() {
    return {
      easy:   { hidePct: 0.30, label: 'Easy' },
      medium: { hidePct: 0.50, label: 'Medium' },
      hard:   { hidePct: 0.70, label: 'Hard' },
      expert: { hidePct: 1.0,  label: 'Expert' }
    };
  }

  setDifficulty(diff) {
    this.difficulty = diff;
    this._saveSetting('difficulty', diff);
  }

  setMaxWrong(max) {
    this.maxWrong = parseInt(max, 10);
    this._saveSetting('maxWrong', this.maxWrong);
  }

  /**
   * Start a new game with a headline string and optional link
   */
  startGame(headline, link, source) {
    this.headline = headline;
    this.articleLink = link || '';
    this.articleSource = source || '';
    this.guessedLetters = new Set();
    this.correctLetters = new Set();
    this.wrongLetters = new Set();
    this.state = 'playing';

    // Parse headline into words with metadata
    this._parseHeadline(headline);

    // Decide which words to hide based on difficulty
    this._selectHiddenWords();

    // Track used headlines
    this.usedHeadlines.add(headline);
    this._saveUsedHeadlines();
    this._saveGameState();

    return {
      words: this.words,
      hiddenIndices: this.hiddenIndices,
      lettersNeeded: this._getUniqueHiddenLetters()
    };
  }

  /**
   * Guess a letter
   * Returns { correct, letter, revealed[], gameState, wrongCount }
   */
  guessLetter(letter) {
    letter = letter.toLowerCase();

    if (this.state !== 'playing' || this.guessedLetters.has(letter)) {
      return null;
    }

    this.guessedLetters.add(letter);

    // Check if letter exists in hidden words
    const hiddenLetters = this._getHiddenLetters();
    const isCorrect = hiddenLetters.has(letter);

    if (isCorrect) {
      this.correctLetters.add(letter);
    } else {
      this.wrongLetters.add(letter);
    }

    // Check win/lose
    const won = this._checkWin();
    const lost = this.wrongLetters.size >= this.maxWrong;

    if (won) {
      this.state = 'won';
      this._onWin();
    } else if (lost) {
      this.state = 'lost';
      this._onLose();
    }

    this._saveGameState();

    return {
      correct: isCorrect,
      letter,
      revealed: isCorrect ? this._getRevealedPositions(letter) : [],
      gameState: this.state,
      wrongCount: this.wrongLetters.size,
      correctCount: this.correctLetters.size
    };
  }

  /**
   * Get all letters that need to be guessed (unique, from hidden words)
   */
  _getUniqueHiddenLetters() {
    const letters = new Set();
    this.hiddenIndices.forEach(idx => {
      const word = this.words[idx];
      for (const ch of word.text) {
        if (/[a-z]/i.test(ch)) {
          letters.add(ch.toLowerCase());
        }
      }
    });
    return letters;
  }

  /**
   * Get set of all lowercase letters in hidden words
   */
  _getHiddenLetters() {
    return this._getUniqueHiddenLetters();
  }

  /**
   * Check if all hidden letters have been guessed
   */
  _checkWin() {
    const needed = this._getUniqueHiddenLetters();
    for (const letter of needed) {
      if (!this.correctLetters.has(letter)) return false;
    }
    return true;
  }

  /**
   * Get positions where a letter is revealed (for animation)
   */
  _getRevealedPositions(letter) {
    const positions = [];
    this.hiddenIndices.forEach(wordIdx => {
      const word = this.words[wordIdx];
      for (let i = 0; i < word.text.length; i++) {
        if (word.text[i].toLowerCase() === letter) {
          positions.push({ wordIdx, charIdx: i });
        }
      }
    });
    return positions;
  }

  /**
   * Parse headline into word objects
   */
  _parseHeadline(headline) {
    // Split keeping punctuation attached to words
    const tokens = headline.match(/[\w'-]+|[^\w\s]+|\s+/g) || [];
    this.words = [];

    tokens.forEach(token => {
      if (/^\s+$/.test(token)) {
        // skip standalone whitespace, it's implicit between words
        return;
      }
      this.words.push({
        text: token,
        isWord: /[a-zA-Z]/.test(token), // contains at least one letter
        isPunct: /^[^\w\s]+$/.test(token)
      });
    });
  }

  /**
   * Select which words to hide based on difficulty
   */
  _selectHiddenWords() {
    const config = Game.DIFFICULTY_CONFIG[this.difficulty];
    const wordIndices = this.words
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.isWord && w.text.length >= 2) // only hide real words with 2+ chars
      .map(({ i }) => i);

    if (wordIndices.length === 0) {
      this.hiddenIndices = [];
      return;
    }

    const numToHide = Math.max(1, Math.round(wordIndices.length * config.hidePct));

    // Shuffle and pick
    const shuffled = [...wordIndices].sort(() => Math.random() - 0.5);
    this.hiddenIndices = shuffled.slice(0, numToHide).sort((a, b) => a - b);
  }

  /**
   * Check if a letter at a position in a word should be revealed
   */
  isLetterRevealed(wordIdx, charIdx) {
    if (!this.hiddenIndices.includes(wordIdx)) return true; // not hidden
    const ch = this.words[wordIdx].text[charIdx];
    if (!/[a-zA-Z]/.test(ch)) return true; // punctuation/numbers always shown
    return this.correctLetters.has(ch.toLowerCase());
  }

  /**
   * Get unused headline from a pool.
   * Accepts array of {title, link} objects or plain strings.
   * Returns {title, link} or null.
   */
  pickHeadline(headlines, rssService) {
    // Normalise to {title, link} objects
    const items = headlines.map(h =>
      typeof h === 'string' ? { title: h, link: '' } : h
    );

    // Apply exclude filter
    const filtered = rssService
      ? items.filter(h => !rssService.isExcluded(h.title))
      : items;

    // Deduplicate by title
    const seen = new Set();
    const unique = filtered.filter(h => {
      if (seen.has(h.title)) return false;
      seen.add(h.title);
      return true;
    });

    const unused = unique.filter(h => !this.usedHeadlines.has(h.title));
    const pool = unused.length > 0 ? unused : unique;

    if (pool.length === 0) return null;

    if (unused.length === 0) {
      this.usedHeadlines.clear();
      this._saveUsedHeadlines();
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    return pick;
  }

  _onWin() {
    // Score: base points + bonus for fewer wrong guesses + streak bonus
    const basePoints = 10;
    const diffMultiplier = { easy: 1, medium: 1.5, hard: 2, expert: 3 }[this.difficulty];
    const wrongPenalty = this.wrongLetters.size * 2;
    const streakBonus = Math.min(this.streak * 2, 20);

    const points = Math.max(1, Math.round((basePoints - wrongPenalty + streakBonus) * diffMultiplier));
    this.score += points;
    this.streak++;
    this.gamesPlayed++;
    this.gamesWon++;
    this._saveStats();
    return points;
  }

  _onLose() {
    this.streak = 0;
    this.gamesPlayed++;
    this._saveStats();
  }

  resetStats() {
    this.score = 0;
    this.streak = 0;
    this.gamesPlayed = 0;
    this.gamesWon = 0;
    this.usedHeadlines.clear();
    this._saveUsedHeadlines();
    this._saveStats();
  }

  _saveStats() {
    const stats = {
      score: this.score,
      streak: this.streak,
      gamesPlayed: this.gamesPlayed,
      gamesWon: this.gamesWon
    };
    localStorage.setItem('hangman_stats', JSON.stringify(stats));
  }

  _loadStats() {
    try {
      const stats = JSON.parse(localStorage.getItem('hangman_stats'));
      if (stats) {
        this.score = stats.score || 0;
        this.streak = stats.streak || 0;
        this.gamesPlayed = stats.gamesPlayed || 0;
        this.gamesWon = stats.gamesWon || 0;
      }
    } catch (e) { /* ignore */ }

    try {
      const diff = localStorage.getItem('hangman_difficulty');
      if (diff) this.difficulty = JSON.parse(diff);
      const maxW = localStorage.getItem('hangman_maxWrong');
      if (maxW) this.maxWrong = JSON.parse(maxW);
    } catch (e) { /* ignore */ }
  }

  _saveSetting(key, value) {
    localStorage.setItem('hangman_' + key, JSON.stringify(value));
  }

  _saveUsedHeadlines() {
    try {
      sessionStorage.setItem('hangman_used', JSON.stringify([...this.usedHeadlines]));
    } catch (e) { /* quota */ }
  }

  _loadUsedHeadlines() {
    try {
      const data = JSON.parse(sessionStorage.getItem('hangman_used'));
      if (Array.isArray(data)) this.usedHeadlines = new Set(data);
    } catch (e) { /* ignore */ }
  }

  // ── In-progress game state persistence ────────────────────────

  _saveGameState() {
    try {
      const state = {
        headline: this.headline,
        articleLink: this.articleLink,
        articleSource: this.articleSource,
        words: this.words,
        hiddenIndices: this.hiddenIndices,
        guessedLetters: [...this.guessedLetters],
        correctLetters: [...this.correctLetters],
        wrongLetters: [...this.wrongLetters],
        gameState: this.state,
        difficulty: this.difficulty,
        maxWrong: this.maxWrong
      };
      sessionStorage.setItem('hangman_gameState', JSON.stringify(state));
    } catch (e) { /* quota */ }
  }

  clearGameState() {
    sessionStorage.removeItem('hangman_gameState');
  }

  /**
   * Restore a saved in-progress game.
   * Returns the game data object (like startGame) or null if nothing saved.
   */
  restoreGameState() {
    try {
      const raw = sessionStorage.getItem('hangman_gameState');
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.headline || s.gameState !== 'playing') {
        this.clearGameState();
        return null;
      }

      this.headline = s.headline;
      this.articleLink = s.articleLink || '';
      this.articleSource = s.articleSource || '';
      this.words = s.words;
      this.hiddenIndices = s.hiddenIndices;
      this.guessedLetters = new Set(s.guessedLetters);
      this.correctLetters = new Set(s.correctLetters);
      this.wrongLetters = new Set(s.wrongLetters);
      this.state = 'playing';

      return {
        words: this.words,
        hiddenIndices: this.hiddenIndices,
        lettersNeeded: this._getUniqueHiddenLetters()
      };
    } catch (e) {
      this.clearGameState();
      return null;
    }
  }
}

window.Game = Game;
