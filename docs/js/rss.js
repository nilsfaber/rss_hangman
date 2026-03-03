/**
 * RSSService - Manages RSS feed URLs and fetches/parses headlines entirely
 * client-side using the browser's built-in DOMParser for XML parsing.
 *
 * Feeds are fetched through a self-hosted Cloudflare Worker CORS proxy.
 * Set the worker URL in RSSService.PROXY_URL below after deploying.
 */
class RSSService {
  /** Fetch timeout in ms */
  static FETCH_TIMEOUT = 8000;

  /**
   * Cloudflare Worker proxy URL.
   * After deploying the worker, replace this with your worker URL, e.g.:
   *   'https://rss-hangman-proxy.<your-subdomain>.workers.dev'
   */
  static PROXY_URL = 'https://rss-hangman-proxy.rss-hangman.workers.dev';

  constructor() {
    this.feeds = [];       // [{ url, name, headlineCount }]
    this.headlines = [];   // cached headlines
    this.excludeStrings = []; // strings to exclude from headlines
    this._loadFeeds();
    this._loadExcludeStrings();
  }

  static get PRESET_FEEDS() {
    return [
      { name: 'Reuters Top News', url: 'https://feeds.reuters.com/reuters/topNews', icon: '🌍' },
      { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', icon: '📺' },
      { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', icon: '📻' },
      { name: 'CNN Top Stories', url: 'http://rss.cnn.com/rss/edition.rss', icon: '📰' },
      { name: 'NY Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', icon: '🗞️' },
      { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', icon: '🇬🇧' },
      { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', icon: '💻' },
      { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', icon: '🔬' },
      { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', icon: '⚽' },
    ];
  }

  // ── Fetching ───────────────────────────────────────────────────

  /**
   * Fetch and parse headlines from a feed URL via the CORS proxy.
   * Falls back to direct fetch if the proxy URL is not set.
   * Returns { feedTitle, headlines[] }
   */
  async _fetchAndParse(url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), RSSService.FETCH_TIMEOUT);
    try {
      // Route through the CORS proxy worker
      const fetchUrl = RSSService.PROXY_URL
        ? `${RSSService.PROXY_URL}?url=${encodeURIComponent(url)}`
        : url;

      const resp = await fetch(fetchUrl, {
        signal: ac.signal,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' }
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      if (!text.includes('<') || text.length < 50) throw new Error('Response does not look like XML');
      return this._parseXML(text);
    } catch (err) {
      clearTimeout(timer);
      throw new Error('Failed to fetch feed: ' + err.message);
    }
  }

  // ── XML parsing with DOMParser ─────────────────────────────────────

  /** Decode HTML entities like &amp;quot; &amp;amp; &amp;#39; etc. */
  _decodeEntities(str) {
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  }

  /**
   * Parse RSS / Atom / RDF XML text and extract headlines.
   * Returns { feedTitle, headlines[] }
   */
  _parseXML(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid XML: ' + (parseError.textContent || '').slice(0, 100));
    }

    let feedTitle = '';
    let headlines = [];

    // RSS 2.0
    const rssChannel = doc.querySelector('channel');
    if (rssChannel) {
      feedTitle = this._getChildText(rssChannel, 'title') || 'Unknown Feed';
      doc.querySelectorAll('item').forEach(item => {
        const t = this._getChildText(item, 'title');
        const l = this._getChildText(item, 'link') || '';
        if (t) headlines.push({ title: t, link: l });
      });
    }

    // Atom (if no RSS items found)
    if (headlines.length === 0) {
      const atomFeed = doc.querySelector('feed');
      if (atomFeed) {
        feedTitle = this._getChildText(atomFeed, 'title') || 'Unknown Feed';
        doc.querySelectorAll('entry').forEach(entry => {
          const t = this._getChildText(entry, 'title');
          // Atom uses <link href="..."/> attribute
          const linkEl = entry.querySelector('link');
          const l = linkEl ? (linkEl.getAttribute('href') || '') : '';
          if (t) headlines.push({ title: t, link: l });
        });
      }
    }

    // RDF / RSS 1.0 fallback
    if (headlines.length === 0) {
      const items = doc.querySelectorAll('item');
      if (items.length > 0) {
        const ch = doc.querySelector('channel');
        feedTitle = ch ? (this._getChildText(ch, 'title') || 'Unknown Feed') : 'Unknown Feed';
        items.forEach(item => {
          const t = this._getChildText(item, 'title');
          const l = this._getChildText(item, 'link') || '';
          if (t) headlines.push({ title: t, link: l });
        });
      }
    }

    // Clean up — attach source (feedTitle) to each headline
    headlines = headlines
      .map(h => ({
        title: this._decodeEntities(h.title.replace(/<[^>]*>/g, '').trim()),
        link: h.link.trim(),
        source: feedTitle
      }))
      .filter(h => h.title.length >= 10 && h.title.length <= 150);

    return { feedTitle, headlines };
  }

  /** Get text content of the first direct child matching tagName. */
  _getChildText(parent, tagName) {
    for (const child of parent.children) {
      if (child.localName === tagName) {
        return child.textContent.trim();
      }
    }
    return null;
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Add a feed URL — validates by fetching + parsing it.
   * Returns { success, feedName, headlineCount, error }
   */
  async addFeed(url) {
    url = url.trim();
    if (!url.match(/^https?:\/\//)) {
      url = 'https://' + url;
    }

    if (this.feeds.some(f => f.url === url)) {
      return { success: false, error: 'Feed already added' };
    }

    try {
      const { feedTitle, headlines } = await this._fetchAndParse(url);

      if (headlines.length === 0) {
        return { success: false, error: 'No valid headlines found in feed' };
      }

      const feed = { url, name: feedTitle || url, headlineCount: headlines.length };
      this.feeds.push(feed);
      this.headlines.push(...headlines);
      this._saveFeeds();
      this._cacheHeadlines(this.headlines);

      return { success: true, feedName: feed.name, headlineCount: headlines.length };
    } catch (err) {
      return { success: false, error: 'Failed to fetch feed: ' + err.message };
    }
  }

  removeFeed(url) {
    this.feeds = this.feeds.filter(f => f.url !== url);
    this._saveFeeds();
  }

  /**
   * Fetch all headlines from every configured feed.
   */
  async fetchAllHeadlines() {
    if (this.feeds.length === 0) {
      this.headlines = [];
      return [];
    }

    const allHeadlines = [];
    const errors = [];

    await Promise.allSettled(
      this.feeds.map(async (feed) => {
        try {
          const { feedTitle, headlines } = await this._fetchAndParse(feed.url);
          feed.name = feedTitle || feed.name;
          feed.headlineCount = headlines.length;
          feed.error = null;
          allHeadlines.push(...headlines);
        } catch (err) {
          feed.error = err.message;
          errors.push({ url: feed.url, error: err.message });
        }
      })
    );

    if (allHeadlines.length > 0) {
      this.headlines = allHeadlines;
      this._cacheHeadlines(allHeadlines);
      this._saveFeeds();
      return allHeadlines;
    }

    // Fall back to cached headlines
    const cached = this._getCachedHeadlines();
    if (cached.length > 0) {
      this.headlines = cached;
      return cached;
    }

    if (errors.length > 0) {
      throw new Error('Failed to fetch feeds: ' + errors.map(e => e.error).join('; '));
    }
    return [];
  }

  hasFeed(url) {
    return this.feeds.some(f => f.url === url);
  }

  // ── Exclude strings ────────────────────────────────────────────

  addExcludeString(str) {
    str = str.trim();
    if (!str) return false;
    const lower = str.toLowerCase();
    if (this.excludeStrings.some(s => s.toLowerCase() === lower)) return false;
    this.excludeStrings.push(str);
    this._saveExcludeStrings();
    return true;
  }

  removeExcludeString(str) {
    this.excludeStrings = this.excludeStrings.filter(s => s !== str);
    this._saveExcludeStrings();
  }

  /** Returns true if the headline title matches any exclude string. */
  isExcluded(title) {
    if (this.excludeStrings.length === 0) return false;
    const lower = title.toLowerCase();
    return this.excludeStrings.some(s => lower.includes(s.toLowerCase()));
  }

  _saveExcludeStrings() {
    localStorage.setItem('hangman_exclude', JSON.stringify(this.excludeStrings));
  }

  _loadExcludeStrings() {
    try {
      const data = JSON.parse(localStorage.getItem('hangman_exclude'));
      if (Array.isArray(data)) this.excludeStrings = data;
    } catch (e) { /* ignore */ }
  }

  // ── Persistence ────────────────────────────────────────────────────

  _getCachedHeadlines() {
    try { return JSON.parse(localStorage.getItem('hangman_headlines_cache')) || []; }
    catch (e) { return []; }
  }

  _cacheHeadlines(headlines) {
    try { localStorage.setItem('hangman_headlines_cache', JSON.stringify(headlines)); }
    catch (e) { /* quota exceeded */ }
  }

  _saveFeeds() {
    localStorage.setItem('hangman_feeds', JSON.stringify(this.feeds));
  }

  _loadFeeds() {
    try {
      const feeds = JSON.parse(localStorage.getItem('hangman_feeds'));
      if (Array.isArray(feeds)) this.feeds = feeds;
    } catch (e) { /* ignore */ }
    this.headlines = this._getCachedHeadlines();
  }
}

window.RSSService = RSSService;
