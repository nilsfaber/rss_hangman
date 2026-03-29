/**
 * Game - Core hangman game logic.
 * Manages headline parsing, letter revealing, win/lose conditions, streaks.
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
    this.difficulty = 'medium';  // easy, medium, hard, expert
    this.state = 'idle';       // idle, playing, won, lost
    this.streak = 0;
    this.gamesPlayed = 0;
    this.gamesWon = 0;
    this.usedHeadlines = new Set();
    this.allowSpecialChars = false;
    this.whitelistWords = new Set();

    this._loadStats();
    this._loadUsedHeadlines();
    this._loadAllowSpecialChars();
    this._loadWhitelist();
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
    this.maxWrong = parseInt(max, 6);
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
   * Returns { correct, letter, revealed[], gameState }
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
      gameState: this.state
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
        if (/[a-z\u00C0-\u024F]/i.test(ch)) {
          letters.add(this._normalizeChar(ch).toLowerCase());
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
        if (this._normalizeChar(word.text[i]).toLowerCase() === letter) {
          positions.push({ wordIdx, charIdx: i });
        }
      }
    });
    return positions;
  }

  /** Normalize a character: strip accents/diacritics to base ASCII letter. */
  _normalizeChar(ch) {
    return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Check if a string contains any accented/special letters. */
  _hasSpecialChars(str) {
    return str !== str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Parse headline into word objects
   */
  _parseHeadline(headline) {
    // Split keeping punctuation attached to words (including accented chars)
    const tokens = headline.match(/[\w\u00C0-\u024F'-]+|[^\w\s\u00C0-\u024F]+|\s+/g) || [];
    this.words = [];

    tokens.forEach(token => {
      if (/^\s+$/.test(token)) {
        // mark previous word as having a space after it
        if (this.words.length > 0) this.words[this.words.length - 1].spaceAfter = true;
        return;
      }
      this.words.push({
        text: token,
        isWord: /[a-zA-Z\u00C0-\u024F]/.test(token), // contains at least one letter (incl accented)
        isPunct: /^[^\w\s\u00C0-\u024F]+$/.test(token),
        spaceAfter: false
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
      .filter(({ w }) => w.text.length <= 14) // skip very long words that overflow on small screens
      .filter(({ w }) => !this.whitelistWords.has(w.text.toLowerCase())) // never mask whitelisted words
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
   * Get unused headline from a pool.
   * Accepts array of {title, link} objects or plain strings.
   * Returns {title, link} or null.
   */
  pickHeadline(headlines, rssService) {
    // Normalise to {title, link, feedIndex} objects
    const items = headlines.map(h =>
      typeof h === 'string' ? { title: h, link: '', feedIndex: 0 } : h
    );

    // Apply exclude filter
    let filtered = rssService
      ? items.filter(h => !rssService.isExcluded(h.title))
      : items;

    // Filter out headlines with special characters if not allowed
    if (!this.allowSpecialChars) {
      filtered = filtered.filter(h => !this._hasSpecialChars(h.title));
    }

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

    const mode = (rssService && rssService.randomisation) || 'random';
    if (mode === 'sequential') return this._pickSequential(pool);
    if (mode === 'weighted')   return this._pickWeighted(pool);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _pickSequential(pool) {
    // Group by feedIndex, pick from the group with the lowest feedIndex
    const groups = new Map();
    for (const h of pool) {
      const idx = h.feedIndex ?? 0;
      if (!groups.has(idx)) groups.set(idx, []);
      groups.get(idx).push(h);
    }
    const minIdx = Math.min(...groups.keys());
    const g = groups.get(minIdx);
    return g[Math.floor(Math.random() * g.length)];
  }

  _pickWeighted(pool) {
    // Group by feedIndex; earlier feeds get higher weight (N, N-1, ..., 1)
    const groups = new Map();
    for (const h of pool) {
      const idx = h.feedIndex ?? 0;
      if (!groups.has(idx)) groups.set(idx, []);
      groups.get(idx).push(h);
    }
    const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
    const n = sortedKeys.length;
    const totalWeight = (n * (n + 1)) / 2;
    let r = Math.random() * totalWeight;
    for (let i = 0; i < sortedKeys.length; i++) {
      r -= (n - i);
      if (r <= 0) {
        const g = groups.get(sortedKeys[i]);
        return g[Math.floor(Math.random() * g.length)];
      }
    }
    const lastGroup = groups.get(sortedKeys[sortedKeys.length - 1]);
    return lastGroup[Math.floor(Math.random() * lastGroup.length)];
  }

  _onWin() {
    this.streak++;
    this.gamesPlayed++;
    this.gamesWon++;
    this._saveStats();
  }

  _onLose() {
    this.streak = 0;
    this.gamesPlayed++;
    this._saveStats();
  }

  resetStats() {
    this.streak = 0;
    this.gamesPlayed = 0;
    this.gamesWon = 0;
    this.usedHeadlines.clear();
    this._saveUsedHeadlines();
    this._saveStats();
  }

  _saveStats() {
    const stats = {
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
      localStorage.setItem('hangman_used', JSON.stringify([...this.usedHeadlines]));
    } catch (e) { /* quota */ }
  }

  _loadUsedHeadlines() {
    try {
      const data = JSON.parse(localStorage.getItem('hangman_used'));
      if (Array.isArray(data)) this.usedHeadlines = new Set(data);
    } catch (e) { /* ignore */ }
  }

  /**
   * Remove any stored headlines that are no longer present in the current feed.
   * Call this after a feed refresh so stale entries don't accumulate.
   */
  pruneUsedHeadlines(headlines) {
    const available = new Set(headlines.map(h => (typeof h === 'string' ? h : h.title)));
    const before = this.usedHeadlines.size;
    for (const title of this.usedHeadlines) {
      if (!available.has(title)) this.usedHeadlines.delete(title);
    }
    if (this.usedHeadlines.size !== before) this._saveUsedHeadlines();
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

  // ── Special characters toggle ─────────────────────────────────

  setAllowSpecialChars(enabled) {
    this.allowSpecialChars = !!enabled;
    localStorage.setItem('hangman_allowSpecialChars', JSON.stringify(this.allowSpecialChars));
  }

  _loadAllowSpecialChars() {
    try {
      const val = JSON.parse(localStorage.getItem('hangman_allowSpecialChars'));
      if (typeof val === 'boolean') this.allowSpecialChars = val;
    } catch (e) { /* ignore */ }
  }

  // ── Whitelist (never-mask) words ──────────────────────────────

  _loadWhitelist() {
    try {
      const data = JSON.parse(localStorage.getItem('hangman_whitelist'));
      if (Array.isArray(data)) {
        this.whitelistWords = new Set(data.map(w => w.toLowerCase()));
        return;
      }
    } catch (e) { /* ignore */ }
    // First load — use defaults
    this.whitelistWords = new Set(Game.DEFAULT_WHITELIST);
    this._saveWhitelist();
  }

  _saveWhitelist() {
    localStorage.setItem('hangman_whitelist', JSON.stringify([...this.whitelistWords]));
  }

  addWhitelistWord(word) {
    word = word.trim().toLowerCase();
    if (!word) return false;
    if (this.whitelistWords.has(word)) return false;
    this.whitelistWords.add(word);
    this._saveWhitelist();
    return true;
  }

  removeWhitelistWord(word) {
    this.whitelistWords.delete(word.toLowerCase());
    this._saveWhitelist();
  }

  resetWhitelist() {
    this.whitelistWords = new Set(Game.DEFAULT_WHITELIST);
    this._saveWhitelist();
  }
}

// ── Default whitelist of common words (EN + NL) ─────────────────
Game.DEFAULT_WHITELIST = [
  // English
  'the','a','an','and','or','but','in','on','at','to','for','of','is','it',
  'he','she','her','his','we','they','that','this','with','not','no','too',
  'so','has','had','was','can','will','its','are','be','by','as','do','if',
  'my','up','all','out','one','new','from','who','get','got','say','how',
  'may','into', 'nd', 'th', 'rd', 'st',
  // Dutch
  'de','het','een','en','of','maar','op','aan','te','voor','van','hij',
  'zij','haar','zijn','wij','dat','dit','met','niet','nee','ook','zo',
  'heeft','had','kan','zal','er','om','al','uit','bij','nog','wel','als',
  'dan','nu','tot','hoe','meer','naar','over','na','wat','wie'
];

window.Game = Game;
