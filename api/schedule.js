const { select, insert, update, del } = require('../lib/db');
const ADMIN_PW = process.env.ADMIN_PASSWORD;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Admin: list templates
  if (req.method === 'GET') {
    const { password } = req.query || {};
    if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const templates = await select('schedule_templates',
        '?select=*,locations(name)&order=location_id.asc,day_of_week.asc');
      return res.status(200).json(templates || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (body.password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
    const { action } = body;

    try {
      if (action === 'createTemplate') {
        const { location_id, day_of_week, window_start, window_end, valid_from, valid_until, note } = body;
        if (!location_id || day_of_week == null || !window_start || !window_end) {
          return res.status(400).json({ error: 'location_id, day_of_week, window_start, window_end required' });
        }
        const [tmpl] = await insert('schedule_templates', {
          location_id,
          day_of_week: parseInt(day_of_week),
          window_start,
          window_end,
          valid_from:  valid_from  || null,
          valid_until: valid_until || null,
          note: note || null,
          active: true,
        });
        return res.status(200).json(tmpl);
      }

      if (action === 'toggleTemplate') {
        const [tmpl] = await select('schedule_templates', `?id=eq.${body.template_id}`);
        if (!tmpl) return res.status(404).json({ error: 'Not found' });
        const [updated] = await update('schedule_templates', `id=eq.${body.template_id}`, { active: !tmpl.active });
        return res.status(200).json(updated);
      }

      if (action === 'deleteTemplate') {
        await del('schedule_templates', `id=eq.${body.template_id}`);
        return res.status(200).json({ ok: true });
      }

      if (action === 'generateSlots') {
        const { from_date, to_date, default_capacities } = body;
        if (!from_date || !to_date) {
          return res.status(400).json({ error: 'from_date and to_date required' });
        }
        const templates = await select('schedule_templates', '?active=eq.true');
        if (!templates?.length) return res.status(200).json({ created: 0, skipped: 0 });

        const from = new Date(from_date + 'T00:00:00');
        const to   = new Date(to_date   + 'T00:00:00');
        let created = 0, skipped = 0;

        for (const tmpl of templates) {
          // Skip if template validity doesn't overlap the date range
          if (tmpl.valid_from  && new Date(tmpl.valid_from  + 'T00:00:00') > to)   continue;
          if (tmpl.valid_until && new Date(tmpl.valid_until + 'T00:00:00') < from)  continue;

          const d = new Date(from);
          while (d <= to) {
            if (d.getDay() === tmpl.day_of_week) {
              const dayStr = d.toISOString().slice(0, 10);
              // Respect template valid window at the individual day level
              if (tmpl.valid_from  && dayStr < tmpl.valid_from)  { d.setDate(d.getDate() + 1); continue; }
              if (tmpl.valid_until && dayStr > tmpl.valid_until)  { d.setDate(d.getDate() + 1); continue; }

              // Skip if slot already exists for this location + date + start time
              const existing = await select('pickup_slots',
                `?location_id=eq.${tmpl.location_id}&slot_date=eq.${dayStr}&window_start=eq.${tmpl.window_start}`);
              if (existing?.length) { skipped++; d.setDate(d.getDate() + 1); continue; }

              const [slot] = await insert('pickup_slots', {
                location_id:    tmpl.location_id,
                slot_date:      dayStr,
                window_start:   tmpl.window_start,
                window_end:     tmpl.window_end,
                generated_from: tmpl.id,
                note:           tmpl.note || null,
                cancelled:      false,
              });

              if (default_capacities?.length) {
                for (const dc of default_capacities) {
                  await insert('slot_products', {
                    slot_id:        slot.id,
                    product_id:     dc.product_id,
                    total_capacity: dc.total_capacity != null ? dc.total_capacity : null,
                    booked:         0,
                  });
                }
              }
              created++;
            }
            d.setDate(d.getDate() + 1);
          }
        }

        return res.status(200).json({ created, skipped });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      console.error('[schedule] POST error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
