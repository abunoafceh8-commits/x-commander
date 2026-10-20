const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, url } = body;
  const target = username || url;
  if (!target) return res.status(400).json({ error: 'Username required' });
  
  const cleanUser = target.replace('@', '').replace(/https?:\/\/(www\.)?(twitter|x)\.com\//, '').split('/')[0].trim();
  
  try {
    // Method 1: Syndication API
    let tweets = [];
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000)
      });
      const html = await r.text();
      
      // Extract tweet data
      const tweetBlocks = html.match(/data-tweet-id="(\d+)"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi);
      if (tweetBlocks) {
        tweetBlocks.forEach(block => {
          const idMatch = block.match(/data-tweet-id="(\d+)"/);
          const textMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
          if (idMatch) {
            tweets.push({
              id: idMatch[1],
              text: textMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '',
              url: `https://x.com/${cleanUser}/status/${idMatch[1]}`,
              date: null
            });
          }
        });
      }
    } catch {}

    // Method 2: Try Nitter instances
    if (tweets.length === 0) {
      const nitters = ['https://nitter.privacydev.net', 'https://nitter.poast.org'];
      for (const nitter of nitters) {
        try {
          const r = await fetch(`${nitter}/${cleanUser}`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(8000)
          });
          const html = await r.text();
          const items = html.match(/class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
          if (items) {
            items.slice(0, 20).forEach((item, i) => {
              const text = item.replace(/<[^>]+>/g, '').trim();
              if (text) {
                tweets.push({
                  id: `nitter_${i}_${Date.now()}`,
                  text,
                  url: `https://x.com/${cleanUser}`,
                  date: null,
                  source: nitter
                });
              }
            });
          }
          if (tweets.length > 0) break;
        } catch {}
      }
    }

    // Method 3: Wayback Machine CDX
    try {
      const cdxR = await fetch(`https://web.archive.org/cdx/search/cdx?url=twitter.com/${cleanUser}/status/*&output=json&limit=50&fl=timestamp,original,statuscode&collapse=urlkey`, {
        signal: AbortSignal.timeout(10000)
      });
      const cdxData = await cdxR.json();
      const [, ...rows] = cdxData;
      rows.filter(r => r[2] === '200').forEach(row => {
        const tweetId = row[1].match(/\/status\/(\d+)/)?.[1];
        if (tweetId && !tweets.find(t => t.id === tweetId)) {
          tweets.push({
            id: tweetId,
            text: '',
            url: row[1],
            archiveUrl: `https://web.archive.org/web/${row[0]}/${row[1]}`,
            date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
            archived: true
          });
        }
      });
    } catch {}

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ username: cleanUser, tweets: tweets.slice(0, 100), total: tweets.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, tweets: [], total: 0 });
  }
}
