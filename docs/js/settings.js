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
    this.feedStatus = document.getElementById('toast');
    this.difficultySelector = document.getElementById('difficulty-selector');
    this.maxWrongSelect = document.getElementById('max-wrong');
    this.btnResetStats = document.getElementById('btn-reset-stats');
    this.btnForceFetch = document.getElementById('btn-force-fetch');
    this.btnExport = document.getElementById('btn-export-feeds');
    this.excludeList = document.getElementById('exclude-list');
    this.excludeInput = document.getElementById('exclude-input');
    this.btnAddExclude = document.getElementById('btn-add-exclude');
    this.excludeWrapper = document.getElementById('exclude-list-wrapper');
    this.excludeToggle = document.getElementById('btn-toggle-exclude');
    this.btnExportExclude = document.getElementById('btn-export-exclude');
    this.whitelistList = document.getElementById('whitelist-list');
    this.whitelistInput = document.getElementById('whitelist-input');
    this.btnAddWhitelist = document.getElementById('btn-add-whitelist');
    this.btnResetWhitelist = document.getElementById('btn-reset-whitelist');
    this.whitelistToggle = document.getElementById('btn-toggle-whitelist');
    this.whitelistWrapper = document.getElementById('whitelist-list-wrapper');
    this.btnExportWhitelist = document.getElementById('btn-export-whitelist');
    this.allowSpecialCharsToggle = document.getElementById('allow-special-chars');
    this.proxyUrlInput = document.getElementById('proxy-url');
    this.proxyWarning = document.getElementById('proxy-warning');
    this.proxyInfoModal = document.getElementById('proxy-info-modal');
    this.btnProxyInfo = document.getElementById('btn-proxy-info');
    this.btnCloseProxyModal = document.getElementById('btn-close-proxy-modal');
    this.btnCopyProxyScript = document.getElementById('btn-copy-proxy-script');
    this.proxyScriptCode = document.getElementById('proxy-script-code');

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

    // Exclude strings
    this.btnAddExclude.addEventListener('click', () => this._handleAddExclude());
    this.excludeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleAddExclude();
    });

    // Exclude toggle show all / collapse
    this.excludeToggle.addEventListener('click', () => {
      this._toggleClamp(this.excludeWrapper, this.excludeToggle);
    });

    // Exclude export
    this.btnExportExclude.addEventListener('click', () => this._handleExportWords('exclude'));

    // Whitelist (never-mask) words
    this.btnAddWhitelist.addEventListener('click', () => this._handleAddWhitelist());
    this.whitelistInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleAddWhitelist();
    });
    this.btnResetWhitelist.addEventListener('click', () => {
      if (confirm('Reset never-mask words to defaults?')) {
        this.game.resetWhitelist();
        this._renderWhitelist();
      }
    });

    // Whitelist toggle show all / collapse
    this.whitelistToggle.addEventListener('click', () => {
      this._toggleClamp(this.whitelistWrapper, this.whitelistToggle);
    });

    // Whitelist export
    this.btnExportWhitelist.addEventListener('click', () => this._handleExportWords('whitelist'));

    // Allow special characters toggle
    this.allowSpecialCharsToggle.addEventListener('change', () => {
      this.game.setAllowSpecialChars(this.allowSpecialCharsToggle.checked);
    });

    // Proxy URL — Apply button
    this.btnApplyProxy = document.getElementById('btn-apply-proxy');
    this.btnApplyProxy.addEventListener('click', () => this._applyProxyUrl());
    this.proxyUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._applyProxyUrl(); }
    });

    // Proxy info modal
    this.btnProxyInfo.addEventListener('click', () => {
      this.proxyInfoModal.classList.remove('hidden');
    });
    this.btnCloseProxyModal.addEventListener('click', () => {
      this.proxyInfoModal.classList.add('hidden');
    });
    this.proxyInfoModal.addEventListener('click', (e) => {
      if (e.target === this.proxyInfoModal) this.proxyInfoModal.classList.add('hidden');
    });

    // Copy proxy script
    this.btnCopyProxyScript.addEventListener('click', () => {
      const text = this.proxyScriptCode.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const label = this.btnCopyProxyScript.querySelector('span');
        this.btnCopyProxyScript.classList.add('copied');
        label.textContent = 'Copied!';
        setTimeout(() => {
          this.btnCopyProxyScript.classList.remove('copied');
          label.textContent = 'Copy';
        }, 2000);
      });
    });

  }

  render() {
    this._renderFeeds();
    this._renderDifficulty();
    this._renderExcludeList();
    this._renderWhitelist();
    this.maxWrongSelect.value = this.game.maxWrong;
    this.allowSpecialCharsToggle.checked = this.game.allowSpecialChars;
    this.proxyUrlInput.value = this.rss.proxyUrl || '';
    this._updateProxyWarning();
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
        if (this.onFeedsChanged) this.onFeedsChanged();
      });

      this.feedList.appendChild(el);
    });
  }

  _renderDifficulty() {
    this.difficultySelector.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.difficulty === this.game.difficulty);
    });
  }

  async _handleAddFeed() {
    const raw = this.feedInput.value.trim();
    if (!raw) {
      this._showStatus('Please enter a feed URL', 'error');
      return;
    }
    const urls = raw.split(/[,\s]+/).filter(u => u.length > 0);
    for (const url of urls) {
      await this._addFeedByUrl(url);
    }
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
      if (this.onFeedsChanged) this.onFeedsChanged();
    } else {
      this._showStatus(result.error, 'error');
    }
  }

  _showStatus(msg, type) {
    this.feedStatus.textContent = msg;
    this.feedStatus.className = 'toast ' + type;
    clearTimeout(this._statusTimer);
    if (type !== 'loading') {
      this._statusTimer = setTimeout(() => this._hideStatus(), 4000);
    }
  }

  _hideStatus() {
    this.feedStatus.className = 'toast hidden';
  }

  _updateDifficultyDisplay() {
    // Update the main game UI elements
    const streakValue = document.getElementById('streak-value');
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
      this._showStatus('No feeds to copy', 'error');
      setTimeout(() => this._hideStatus(), 3000);
      return;
    }
    const text = this.rss.feeds.map(f => f.url).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this._showStatus(`Copied ${this.rss.feeds.length} feed URLs to clipboard`, 'success');
    }).catch(() => {
      prompt('Copy these feed URLs:', text);
    });
    setTimeout(() => this._hideStatus(), 3000);
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Exclude strings ────────────────────────────────────────────────

  _handleAddExclude() {
    const raw = this.excludeInput.value.trim();
    if (!raw) return;
    const items = raw.split(/[,\s]+/).map(s => s.trim()).filter(s => s.length > 0);
    let added = 0;
    items.forEach(s => { if (this.rss.addExcludeString(s)) added++; });
    if (added > 0) {
      this.excludeInput.value = '';
      this._renderExcludeList();
    } else {
      this.excludeInput.select();
    }
  }

  _renderExcludeList() {
    this.excludeList.innerHTML = '';

    if (this.rss.excludeStrings.length === 0) {
      this.excludeList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; padding: 4px 0;">No exclusions set.</p>';
      this._updateClampVisibility(this.excludeWrapper, this.excludeToggle);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'word-chip-grid';

    this.rss.excludeStrings.forEach(str => {
      const chip = document.createElement('span');
      chip.className = 'word-chip';
      chip.innerHTML = `${this._escapeHtml(str)}<button aria-label="Remove">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        this.rss.removeExcludeString(str);
        this._renderExcludeList();
      });
      grid.appendChild(chip);
    });

    this.excludeList.appendChild(grid);
    // Check if toggle needed after DOM render
    requestAnimationFrame(() => this._updateClampVisibility(this.excludeWrapper, this.excludeToggle));
  }

  // ── Whitelist (never-mask) words ───────────────────────────────

  _handleAddWhitelist() {
    const raw = this.whitelistInput.value.trim();
    if (!raw) return;
    // Support comma-separated input
    const words = raw.split(/[,\s]+/).filter(w => w.length > 0);
    let added = 0;
    words.forEach(w => { if (this.game.addWhitelistWord(w)) added++; });
    if (added > 0) {
      this.whitelistInput.value = '';
      this._renderWhitelist();
    } else {
      this.whitelistInput.select();
    }
  }

  _renderWhitelist() {
    this.whitelistList.innerHTML = '';

    if (this.game.whitelistWords.size === 0) {
      this.whitelistList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; padding: 4px 0;">No words in list.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'word-chip-grid';

    const sorted = [...this.game.whitelistWords].sort();
    sorted.forEach(word => {
      const chip = document.createElement('span');
      chip.className = 'word-chip';
      chip.innerHTML = `${this._escapeHtml(word)}<button aria-label="Remove">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        this.game.removeWhitelistWord(word);
        this._renderWhitelist();
      });
      grid.appendChild(chip);
    });

    this.whitelistList.appendChild(grid);
    requestAnimationFrame(() => this._updateClampVisibility(this.whitelistWrapper, this.whitelistToggle));
  }

  // ── Shared clamp / toggle helpers ──────────────────────────────

  _toggleClamp(wrapper, btn) {
    const isExpanded = wrapper.classList.contains('expanded');
    wrapper.style.removeProperty('max-height');
    if (isExpanded) {
      wrapper.classList.remove('expanded');
      wrapper.classList.add('clamped');
      btn.textContent = 'Show all';
    } else {
      wrapper.classList.remove('clamped');
      wrapper.classList.add('expanded');
      btn.textContent = 'Show less';
    }
  }

  _updateClampVisibility(wrapper, btn) {
    const inner = wrapper.firstElementChild;
    if (!inner) { btn.classList.add('hidden'); return; }
    // Temporarily remove constraints to measure true content height
    wrapper.style.maxHeight = 'none';
    wrapper.classList.remove('clamped', 'expanded');
    const contentHeight = inner.scrollHeight;
    wrapper.style.removeProperty('max-height');
    const needsClamp = contentHeight > 80;
    if (needsClamp) {
      wrapper.classList.add('clamped');
      btn.textContent = 'Show all';
      btn.classList.remove('hidden');
    } else {
      wrapper.classList.add('expanded');
      btn.classList.add('hidden');
    }
  }

  // ── Export / Import words ──────────────────────────────────────

  _handleExportWords(type) {
    let words;
    if (type === 'exclude') {
      words = this.rss.excludeStrings;
    } else {
      words = [...this.game.whitelistWords].sort();
    }
    if (words.length === 0) return;
    const text = words.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this._showStatus(`Copied ${words.length} ${type === 'exclude' ? 'exclusion' : 'whitelist'} word(s) to clipboard`, 'success');
    }).catch(() => {
      prompt('Copy these words:', text);
    });
    setTimeout(() => this._hideStatus(), 3000);
  }

  _updateProxyWarning() {
    const url = this.rss.proxyUrl;
    const isValid = url && /^https?:\/\/.+/.test(url);
    this.proxyWarning.classList.toggle('hidden', isValid);
  }

  async _applyProxyUrl() {
    const url = this.proxyUrlInput.value.trim();
    this.rss.setProxyUrl(url);
    this._updateProxyWarning();

    if (!url) {
      this._showStatus('Proxy URL cleared', 'warning');
      return;
    }

    if (this.rss.feeds.length === 0) {
      this._showStatus('Proxy URL saved', 'success');
      return;
    }

    this._showStatus('Proxy URL saved — refreshing feeds…', 'success');
    try {
      await this.rss.fetchAllHeadlines();
      this._showStatus('Feeds refreshed successfully', 'success');
      this.onFeedsChanged();
    } catch {
      this._showStatus('Proxy saved but feed refresh failed', 'error');
    }
  }
}

window.Settings = Settings;
