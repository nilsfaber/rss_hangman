/**
 * Cloudflare Worker — RSS CORS Proxy
 *
 * Proxies RSS feed requests, adding CORS headers so the PWA can fetch
 * feeds from any origin. Only allows XML/RSS content types through.
 *
 * Deploy:
 *   1. Sign up at https://dash.cloudflare.com (free)
 *   2. Install Wrangler CLI:  npm i -g wrangler
 *   3. Auth:                  wrangler login
 *   4. From the worker/ dir:  wrangler deploy
 *
 * Then set your worker URL in public/js/rss.js → RSSService.PROXY_URL
 */

const ALLOWED_ORIGINS = [
  'https://nilsfaber.github.io',  // ← change this to the GitHub Pages URL you are using
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://0.0.0.0:8080',
];

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const feedUrl = url.searchParams.get('url');

    if (!feedUrl) {
      return handleCORS(request, new Response(
        JSON.stringify({ error: 'Missing ?url= parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ));
    }

    // Validate URL
    let parsed;
    try {
      parsed = new URL(feedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      return handleCORS(request, new Response(
        JSON.stringify({ error: 'Invalid URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ));
    }

    try {
      const resp = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'RSS-Hangman/1.0 (Cloudflare Worker)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        redirect: 'follow',
      });

      // Pass through the response with CORS headers
      const body = await resp.text();
      return handleCORS(request, new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': resp.headers.get('Content-Type') || 'text/xml',
          'Cache-Control': 'public, max-age=300', // cache 5 min at edge
        },
      }));
    } catch (err) {
      return handleCORS(request, new Response(
        JSON.stringify({ error: 'Fetch failed: ' + err.message }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      ));
    }
  },
};

function handleCORS(request, response) {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers(response.headers);

  // Allow configured origins, or all in development
  if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost')) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }

  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Accept');
  headers.set('Access-Control-Max-Age', '86400');

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
