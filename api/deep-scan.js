const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, existing_tweet_ids = [], max_scan = 50 } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const cleanUser = username.replace('@', '').trim();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tweets = [];
  const existing = new Set(existing_tweet_ids);

  try {
    // Wayback CDX
    for (const domain of ['twitter.com', 'x.com', 'mobile.twitter.com']) {
      try {
        const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}/${cleanUser}/status/*&output=json&limit=${max_scan}&fl=timestamp,original,statuscode&collapse=urlkey&statuscode=200`, {
          signal: AbortSignal.timeout(8000)
        });
        const data = await r.json();
        const [, ...rows] = data;
        rows.forEach(row => {
          const tid = row[1]?.match(/\/status\/(\d+)/)?.[1];
          if (tid && !existing.has(tid) && !tweets.find(t => t.tweet_id === tid)) {
            tweets.push({
              tweet_id: tid, id: tid,
              url: row[1],
              original_url: row[1],
              archived_url: `https://web.archive.org/web/${row[0]}/${row[1]}`,
              date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
              status: 'archived',
              is_new: true
            });
          }
        });
      } catch {}
    }

    // Syndication
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
      });
      const html = await r.text();
      const ids = [...html.matchAll(/data-tweet-id="(\d+)"/g)];
      const texts = [...html.matchAll(/<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g)];
      ids.forEach((m, i) => {
        if (!existing.has(m[1]) && !tweets.find(t => t.tweet_id === m[1])) {
          tweets.push({
            tweet_id: m[1], id: m[1],
            url: `https://x.com/${cleanUser}/status/${m[1]}`,
            text: texts[i]?.[2]?.replace(/<[^>]+>/g, '').trim() || '',
            status: 'live',
            is_new: true
          });
        }
      });
    } catch {}

    return res.json({
      username: cleanUser,
      tweets,
      total: tweets.length,
      new_count: tweets.filter(t => t.is_new).length,
      skipped: existing.size
    });
  } catch (e) {
    return res.json({ error: e.message, tweets: [], total: 0 });
  }
}
