const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ADMIN_PW = process.env.ADMIN_PASSWORD;

async function kvGet(key) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
  });
  const { result } = await r.json();
  return result ? JSON.parse(result) : null;
}

async function kvSet(key, value) {
  await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify(value)]),
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const weeks = (await kvGet('weeks')) ?? [];
      return res.status(200).json(weeks);
    } catch {
      return res.status(200).json([]);
    }
  }

  if (req.method === 'POST') {
    const { password, weeks } = req.body ?? {};
    if (!ADMIN_PW || password !== ADMIN_PW) {
      return res.status(401).json({ error: 'Wrong password' });
    }
    await kvSet('weeks', weeks);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
};
