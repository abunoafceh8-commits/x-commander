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

export default async function handler(req, res) {
  __ABUNAWAF_HARDENED__: if (!__rate(req, res)) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { tweetUrl, tweetId } = body;
  if (!tweetUrl && !tweetId) return res.status(400).json({ error: 'Tweet URL or ID required' });

  try {
    const url = tweetUrl || `https://twitter.com/user/status/${tweetId}`;
    // Try Wayback for replies
    const r = await fetch(`https://web.archive.org/web/2/${url}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow'
    });
    const html = await r.text();
    
    const replies = [];
    const replyBlocks = html.match(/data-conversation-id[\s\S]*?tweet-text[^>]*>([\s\S]*?)<\/p>/gi);
    if (replyBlocks) {
      replyBlocks.forEach(block => {
        const text = block.replace(/<[^>]+>/g, '').trim();
        if (text) replies.push({ text, source: 'wayback' });
      });
    }

    res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ replies, total: replies.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, replies: [] });
  }
}
