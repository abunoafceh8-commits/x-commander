export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const cleanUser = username.replace('@', '').trim();

  try {
    const tweets = [];
    // Check deleted tweet databases
    const sources = [
      { name: 'Wayback', url: `https://web.archive.org/cdx/search/cdx?url=twitter.com/${cleanUser}/status/*&output=json&limit=500&fl=timestamp,original,statuscode&collapse=urlkey` },
      { name: 'Wayback-X', url: `https://web.archive.org/cdx/search/cdx?url=x.com/${cleanUser}/status/*&output=json&limit=500&fl=timestamp,original,statuscode&collapse=urlkey` }
    ];

    for (const src of sources) {
      try {
        const r = await fetch(src.url, { signal: AbortSignal.timeout(15000) });
        const data = await r.json();
        const [, ...rows] = data;
        rows.forEach(row => {
          if (row[2] === '200' || row[2] === '301' || row[2] === '302') {
            const tweetId = row[1].match(/\/status\/(\d+)/)?.[1];
            if (tweetId && !tweets.find(t => t.id === tweetId)) {
              tweets.push({
                id: tweetId, originalUrl: row[1],
                archiveUrl: `https://web.archive.org/web/${row[0]}/${row[1]}`,
                date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
                source: src.name
              });
            }
          }
        });
      } catch {}
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ username: cleanUser, tweets, total: tweets.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, tweets: [] });
  }
}
