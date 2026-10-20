const accounts = [];
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const existing = accounts.find(a => a.username === body.username);
    if (!existing) {
      accounts.unshift({ id: Date.now().toString(), ...body, addedAt: new Date().toISOString() });
      if (accounts.length > 100) accounts.pop();
    }
    return res.json({ success: true });
  }
  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const idx = accounts.findIndex(a => a.id === body.id);
    if (idx >= 0) accounts.splice(idx, 1);
    return res.json({ success: true });
  }
  return res.json(accounts);
}
