// Thin wrapper around Supabase PostgREST REST API — no npm package needed.
const BASE = () => `${process.env.SUPABASE_URL}/rest/v1`;
const KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function h(prefer = 'return=representation') {
  return {
    apikey: KEY(),
    Authorization: `Bearer ${KEY()}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

async function q(path, method = 'GET', body = null, prefer) {
  if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL not configured');
  const res = await fetch(BASE() + path, {
    method,
    headers: h(prefer),
    ...(body !== null && { body: JSON.stringify(body) }),
  });
  const txt = await res.text();
  if (!res.ok) throw Object.assign(new Error(txt), { status: res.status });
  return txt ? JSON.parse(txt) : null;
}

module.exports = {
  // select('orders', '?week_id=eq.2026-05-03&select=*,customers(*)')
  select: (table, filter = '') => q(`/${table}${filter}`),

  insert: (table, data) => q(`/${table}`, 'POST', data),

  // upsert on a specific unique column, e.g. upsert('customers', data, 'email')
  upsert: (table, data, onConflict = '') =>
    q(`/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`,
      'POST', data, 'return=representation,resolution=merge-duplicates'),

  // update('orders', 'id=eq.<uuid>', { status: 'confirmed' })
  update: (table, filter, data) => q(`/${table}?${filter}`, 'PATCH', data),

  del: (table, filter) => q(`/${table}?${filter}`, 'DELETE', null, ''),
};
