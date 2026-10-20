export default async function handler(req, res) {
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ replies, total: replies.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, replies: [] });
  }
}
