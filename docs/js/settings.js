/**
 * Settings - Manages the settings screen UI interactions.
 */
class Settings {
  constructor(rssService, game, onFeedsChanged) {
    this.rss = rssService;
    this.game = game;
    this.onFeedsChanged = onFeedsChanged;

    this._cacheElements();
    this._bindEvents();
    this.render();
  }

  _cacheElements() {
    this.feedList = document.getElementById('feed-list');
    this.feedInput = document.getElementById('feed-url-input');
    this.btnAdd = document.getElementById('btn-add-feed');
    this.feedStatus = document.getElementById('feed-status');
    this.presetContainer = document.getElementById('preset-feeds');
    this.difficultySelector = document.getElementById('difficulty-selector');
    this.maxWrongSelect = document.getElementById('max-wrong');
    this.btnResetStats = document.getElementById('btn-reset-stats');
    this.btnForceFetch = document.getElementById('btn-force-fetch');
    this.btnExport = document.getElementById('btn-export-feeds');
    this.btnImport = document.getElementById('btn-import-feeds');
    this.importArea = document.getElementById('feed-import-area');
    this.btnImportConfirm = document.getElementById('btn-import-confirm');
    this.excludeList = document.getElementById('exclude-list');
    this.excludeInput = document.getElementById('exclude-input');
    this.btnAddExclude = document.getElementById('btn-add-exclude');

  }

  _bindEvents() {
    this.btnAdd.addEventListener('click', () => this._handleAddFeed());
    this.feedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleAddFeed();
    });

    // Difficulty buttons
    this.difficultySelector.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.dataset.difficulty;
        this.game.setDifficulty(diff);
        this._renderDifficulty();
        this._updateDifficultyDisplay();
      });
    });

    // Max wrong guesses
    this.maxWrongSelect.addEventListener('change', () => {
      this.game.setMaxWrong(this.maxWrongSelect.value);
    });

    // Reset stats
    this.btnResetStats.addEventListener('click', () => {
      if (confirm('Reset all game statistics? This cannot be undone.')) {
        this.game.resetStats();
        this._updateDifficultyDisplay();
      }
    });

    // Force fetch feeds
    this.btnForceFetch.addEventListener('click', () => this._handleForceFetch());

    // Export feeds
    this.btnExport.addEventListener('click', () => this._handleExportFeeds());

    // Import feeds
    this.btnImport.addEventListener('click', () => {
      const isVisible = !this.importArea.classList.contains('hidden');
      this.importArea.classList.toggle('hidden', isVisible);
      this.btnImportConfirm.classList.toggle('hidden', isVisible);
      if (!isVisible) this.importArea.focus();
    });

    this.btnImportConfirm.addEventListener('click', () => this._handleImportFeeds());

    // Exclude strings
    this.btnAddExclude.addEventListener('click', () => this._handleAddExclude());
    this.excludeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleAddExclude();
    });

  }

  render() {
    this._renderFeeds();
    this._renderPresets();
    this._renderDifficulty();
    this._renderExcludeList();
    this.maxWrongSelect.value = this.game.maxWrong;
  }

  _renderFeeds() {
    this.feedList.innerHTML = '';

    if (this.rss.feeds.length === 0) {
      this.feedList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 8px 0;">No feeds added yet.</p>';
      return;
    }

    this.rss.feeds.forEach(feed => {
      const el = document.createElement('div');
      el.className = 'feed-item';
      el.innerHTML = `
        <div class="feed-info">
          <div class="feed-name">${this._escapeHtml(feed.name)}</div>
          <div class="feed-url">${this._escapeHtml(feed.url)}</div>
        </div>
        <span class="feed-count">${feed.headlineCount || '?'} items</span>
        <button class="feed-remove-btn" data-url="${this._escapeHtml(feed.url)}" aria-label="Remove feed">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      `;

      el.querySelector('.feed-remove-btn').addEventListener('click', (e) => {
        const url = e.currentTarget.dataset.url;
        this.rss.removeFeed(url);
        this._renderFeeds();
        this._renderPresets();
        if (this.onFeedsChanged) this.onFeedsChanged();
      });

      this.feedList.appendChild(el);
    });
  }

  _renderPresets() {
    this.presetContainer.innerHTML = '';

    RSSService.PRESET_FEEDS.forEach(preset => {
      const isAdded = this.rss.hasFeed(preset.url);
      const chip = document.createElement('button');
      chip.className = 'preset-chip' + (isAdded ? ' added' : '');
      chip.innerHTML = `<span class="preset-icon">${preset.icon}</span> ${this._escapeHtml(preset.name)}`;

      if (!isAdded) {
        chip.addEventListener('click', async () => {
          chip.classList.add('added');
          chip.style.pointerEvents = 'none';
          await this._addFeedByUrl(preset.url);
        });
      }

      this.presetContainer.appendChild(chip);
    });
  }

  _renderDifficulty() {
    this.difficultySelector.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.difficulty === this.game.difficulty);
    });
  }

  async _handleAddFeed() {
    const url = this.feedInput.value.trim();
    if (!url) {
      this._showStatus('Please enter a feed URL', 'error');
      return;
    }
    await this._addFeedByUrl(url);
    this.feedInput.value = '';
  }

  async _addFeedByUrl(url) {
    this._showStatus('Fetching feed...', 'loading');
    this.btnAdd.disabled = true;

    const result = await this.rss.addFeed(url);

    this.btnAdd.disabled = false;

    if (result.success) {
      this._showStatus(`Added "${result.feedName}" with ${result.headlineCount} headlines`, 'success');
      this._renderFeeds();
      this._renderPresets();
      if (this.onFeedsChanged) this.onFeedsChanged();
    } else {
      this._showStatus(result.error, 'error');
      this._renderPresets(); // reset any preset chip state
    }

    // Auto-hide status after 4s
    setTimeout(() => this._hideStatus(), 4000);
  }

  _showStatus(msg, type) {
    this.feedStatus.textContent = msg;
    this.feedStatus.className = type;
    this.feedStatus.classList.remove('hidden');
  }

  _hideStatus() {
    this.feedStatus.classList.add('hidden');
  }

  _updateDifficultyDisplay() {
    // Update the main game UI elements
    const diffValue = document.getElementById('diff-value');
    const scoreValue = document.getElementById('score-value');
    const streakValue = document.getElementById('streak-value');
    if (diffValue) diffValue.textContent = Game.DIFFICULTY_CONFIG[this.game.difficulty].label;
    if (scoreValue) scoreValue.textContent = this.game.score;
    if (streakValue) streakValue.textContent = this.game.streak;
  }

  async _handleForceFetch() {
    this.btnForceFetch.disabled = true;
    this.btnForceFetch.textContent = '⟳ Fetching…';
    try {
      // Clear cached headlines so we get a completely fresh set
      this.rss.headlines = [];
      localStorage.removeItem('hangman_headlines_cache');
      const headlines = await this.rss.fetchAllHeadlines();
      this.render();
      this._showStatus(`Fetched ${headlines.length} headlines from ${this.rss.feeds.length} feed(s)`, 'success');
      if (this.onFeedsChanged) this.onFeedsChanged();
    } catch (err) {
      this._showStatus('Fetch failed: ' + err.message, 'error');
    } finally {
      this.btnForceFetch.disabled = false;
      this.btnForceFetch.textContent = '⟳ Refresh Feeds';
    }
  }

  _handleExportFeeds() {
    if (this.rss.feeds.length === 0) {
      this._showStatus('No feeds to export', 'error');
      setTimeout(() => this._hideStatus(), 3000);
      return;
    }
    const text = this.rss.feeds.map(f => f.url).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this._showStatus(`Copied ${this.rss.feeds.length} feed URLs to clipboard`, 'success');
    }).catch(() => {
      // Fallback: show in a prompt so user can copy manually
      prompt('Copy these feed URLs:', text);
    });
    setTimeout(() => this._hideStatus(), 3000);
  }

  async _handleImportFeeds() {
    const text = this.importArea.value.trim();
    if (!text) {
      this._showStatus('Paste feed URLs first (one per line)', 'error');
      setTimeout(() => this._hideStatus(), 3000);
      return;
    }

    const urls = text.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) {
      this._showStatus('No valid URLs found', 'error');
      setTimeout(() => this._hideStatus(), 3000);
      return;
    }

    this._showStatus(`Importing ${urls.length} feed(s)...`, 'loading');
    this.btnImportConfirm.disabled = true;

    let added = 0;
    let failed = 0;
    for (const url of urls) {
      const result = await this.rss.addFeed(url);
      if (result.success) added++;
      else failed++;
    }

    this.btnImportConfirm.disabled = false;
    this.importArea.classList.add('hidden');
    this.btnImportConfirm.classList.add('hidden');
    this.importArea.value = '';

    const msg = `Imported ${added} feed(s)` + (failed > 0 ? `, ${failed} failed` : '');
    this._showStatus(msg, added > 0 ? 'success' : 'error');
    setTimeout(() => this._hideStatus(), 4000);

    this._renderFeeds();
    this._renderPresets();
    if (this.onFeedsChanged) this.onFeedsChanged();
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Exclude strings ────────────────────────────────────────────────

  _handleAddExclude() {
    const str = this.excludeInput.value.trim();
    if (!str) return;
    if (this.rss.addExcludeString(str)) {
      this.excludeInput.value = '';
      this._renderExcludeList();
    } else {
      this.excludeInput.select();
    }
  }

  _renderExcludeList() {
    this.excludeList.innerHTML = '';

    if (this.rss.excludeStrings.length === 0) {
      this.excludeList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 4px 0;">No exclusions set.</p>';
      return;
    }

    this.rss.excludeStrings.forEach(str => {
      const el = document.createElement('div');
      el.className = 'feed-item';
      el.innerHTML = `
        <span class="feed-name" style="flex:1">${this._escapeHtml(str)}</span>
        <button class="feed-remove-btn" aria-label="Remove exclusion">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      `;
      el.querySelector('.feed-remove-btn').addEventListener('click', () => {
        this.rss.removeExcludeString(str);
        this._renderExcludeList();
      });
      this.excludeList.appendChild(el);
    });
  }
}

window.Settings = Settings;
