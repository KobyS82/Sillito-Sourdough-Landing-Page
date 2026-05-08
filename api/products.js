const { select, update } = require('../lib/db');
const ADMIN_PW = process.env.ADMIN_PASSWORD;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { password } = req.query || {};
    const isAdmin = password === ADMIN_PW;
    try {
      const filter = isAdmin
        ? '?order=sort_order.asc'
        : '?active=eq.true&order=sort_order.asc';
      const products = await select('products', filter);
      return res.status(200).json(products || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PATCH') {
    const { password, id, ...updates } = req.body || {};
    if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
    if (!id) return res.status(400).json({ error: 'id required' });
    const allowed = ['name', 'description', 'price_each_cents', 'deal_qty', 'deal_price_cents', 'active', 'sort_order'];
    const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    try {
      const [updated] = await update('products', `id=eq.${id}`, safe);
      return res.status(200).json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
