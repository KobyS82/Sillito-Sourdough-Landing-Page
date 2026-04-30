const { select, update, del } = require('../lib/db');
const ADMIN_PW = process.env.ADMIN_PASSWORD;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pw = req.query?.password || req.body?.password;
  if (pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    try {
      const customers = await select(
        'customers',
        '?select=*,orders(id,loaves,status,week_id),recurring_preferences(loaves,active)&order=created_at.desc'
      );
      return res.status(200).json(customers || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PATCH') {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
      const allowed = ['email_opt_in', 'sms_opt_in', 'notes'];
      const patch = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
      const [updated] = await update('customers', `id=eq.${id}`, patch);
      return res.status(200).json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
