const { select, upsert, update, del } = require('../lib/db');
const ADMIN_PW = process.env.ADMIN_PASSWORD;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Public: list upcoming weeks
  if (req.method === 'GET') {
    try {
      const weeks = await select('weeks', '?order=id.asc');
      return res.status(200).json(weeks || []);
    } catch (e) {
      console.error('[availability] GET error:', e.message);
      return res.status(200).json([]);
    }
  }

  // Admin: upsert a batch of weeks
  if (req.method === 'POST') {
    const { password, weeks } = req.body || {};
    if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
    try {
      for (const w of (weeks || [])) {
        await upsert('weeks', w);
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Admin: update a single week's available count
  if (req.method === 'PATCH') {
    const { password, id, available } = req.body || {};
    if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const [updated] = await update('weeks', `id=eq.${id}`, { available });
      return res.status(200).json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Admin: delete a week
  if (req.method === 'DELETE') {
    const { password, id } = req.body || {};
    if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
    try {
      await del('weeks', `id=eq.${id}`);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
