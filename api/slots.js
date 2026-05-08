const { select, insert, update } = require('../lib/db');
const ADMIN_PW = process.env.ADMIN_PASSWORD;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function bufferDate() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { location_id, password: pw } = req.query || {};
    const isAdmin = pw === ADMIN_PW;
    try {
      let filter = '?select=*,slot_products(*,products(*)),locations(*)&cancelled=eq.false&order=slot_date.asc,window_start.asc';
      if (!isAdmin) filter += `&slot_date=gte.${bufferDate()}`;
      if (location_id) filter += `&location_id=eq.${location_id}`;
      const slots = await select('pickup_slots', filter);
      return res.status(200).json(slots || []);
    } catch (e) {
      console.error('[slots] GET error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (body.password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
    const { action } = body;

    try {
      if (action === 'createSlot') {
        const { location_id, slot_date, window_start, window_end, note, products: caps } = body;
        if (!location_id || !slot_date || !window_start || !window_end) {
          return res.status(400).json({ error: 'location_id, slot_date, window_start, window_end required' });
        }
        const [slot] = await insert('pickup_slots', {
          location_id, slot_date, window_start, window_end,
          note: note || null, cancelled: false,
        });
        if (caps?.length) {
          for (const c of caps) {
            await insert('slot_products', {
              slot_id: slot.id,
              product_id: c.product_id,
              total_capacity: c.total_capacity != null ? c.total_capacity : null,
              booked: 0,
            });
          }
        }
        return res.status(200).json(slot);
      }

      if (action === 'cancelSlot') {
        const [updated] = await update('pickup_slots', `id=eq.${body.slot_id}`, { cancelled: true });
        return res.status(200).json(updated);
      }

      if (action === 'updateCapacity') {
        const { slot_id, product_id, total_capacity } = body;
        const existing = await select('slot_products', `?slot_id=eq.${slot_id}&product_id=eq.${product_id}`);
        if (existing?.length) {
          await update('slot_products',
            `slot_id=eq.${slot_id}&product_id=eq.${product_id}`,
            { total_capacity: total_capacity != null ? total_capacity : null });
        } else {
          await insert('slot_products', { slot_id, product_id, total_capacity, booked: 0 });
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      console.error('[slots] POST error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
