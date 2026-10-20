/* AbuNawaf hardened — © 2026 أبو نواف · MIT */
const __RL = new Map();
function __rate(req, res, max = 90, win = 60_000) {
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'x';
    const key = ip + ':' + (req.url || '');
    const now = Date.now();
    const b = __RL.get(key);
    if (!b || now > b.r) { __RL.set(key, { n: 1, r: now + win }); if (__RL.size > 4000) __RL.clear(); return true; }
    b.n++;
    if (b.n > max) { res.setHeader('Retry-After', String(Math.ceil((b.r - now) / 1000))); res.status(429).json({ error: 'rate_limited', message: 'تم تجاوز الحد المسموح — أعد المحاولة بعد قليل' }); return false; }
    return true;
  } catch { return true; }
}
const __origin = (req) => {
  const o = req.headers.origin || '';
  if (!o) return '*';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  if (/^https?:\/\/[a-z0-9-]+\.(vercel|arcada)\.app$/.test(o)) return o;
  try { if (o === 'https://' + req.headers.host) return o; } catch {}
  return 'null';
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  __ABUNAWAF_HARDENED__: if (!__rate(req, res)) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const cleanUser = username.replace('@', '').trim();

  try {
    const tweets = [];
    
    // Check multiple Wayback CDX queries
    const queries = [
      `twitter.com/${cleanUser}/status/*`,
      `x.com/${cleanUser}/status/*`,
      `mobile.twitter.com/${cleanUser}/status/*`
    ];

    for (const q of queries) {
      try {
        const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${q}&output=json&limit=500&fl=timestamp,original,statuscode&collapse=urlkey`, {
          signal: AbortSignal.timeout(15000)
        });
        const data = await r.json();
        const [, ...rows] = data;
        rows.forEach(row => {
          if (row[2] === '200') {
            const tweetId = row[1].match(/\/status\/(\d+)/)?.[1];
            if (tweetId && !tweets.find(t => t.id === tweetId)) {
              tweets.push({
                id: tweetId, url: row[1],
                archiveUrl: `https://web.archive.org/web/${row[0]}/${row[1]}`,
                date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
                status: 'archived'
              });
            }
          }
        });
      } catch {}
    }

    // Syndication API for live tweets
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
      });
      const html = await r.text();
      const blocks = html.match(/data-tweet-id="(\d+)"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi);
      if (blocks) {
        blocks.forEach(block => {
          const idM = block.match(/data-tweet-id="(\d+)"/);
          const txtM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
          if (idM && !tweets.find(t => t.id === idM[1])) {
            tweets.push({
              id: idM[1],
              text: txtM?.[1]?.replace(/<[^>]+>/g, '').trim() || '',
              url: `https://x.com/${cleanUser}/status/${idM[1]}`,
              status: 'live'
            });
          }
        });
      }
    } catch {}

    tweets.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ username: cleanUser, tweets, total: tweets.length, archived: tweets.filter(t => t.status === 'archived').length, live: tweets.filter(t => t.status === 'live').length });
  } catch (e) {
    return res.status(500).json({ error: e.message, tweets: [] });
  }
}
