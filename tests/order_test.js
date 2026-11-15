// Offline test of the order path. Run from the repo folder:   node tests/order_test.js
// It swaps in a fake database and a fake fetch, so it reads no .env, touches no Supabase,
// and sends no email or text. "All good." = pass. Run it after any change to api/orders.js,
// lib/email.js or lib/sms.js, before pushing (a push to master deploys to the live site).
const path = require('path');
const ROOT = path.join(__dirname, '..');
const assert = require('assert');

process.env.RESEND_API_KEY = 'test-key';
process.env.ADMIN_EMAIL = 'admin@example.test';
delete process.env.ADMIN_PASSWORD;

const SLOT = '11111111-2222-3333-4444-555555555555';
const calls = { fetch: [], update: [], insert: [], select: [] };
let failDetailedOrders = false;
let fetchMode = 'slow-ok';

global.fetch = async (url, opts) => {
  if (fetchMode === 'throw') throw new Error('network down');
  await new Promise(r => setTimeout(r, 150));          // a send that takes a moment
  calls.fetch.push({ url, body: JSON.parse(opts.body), done: true });
  return { ok: true, status: 200, json: async () => ({ id: 'x' }), text: async () => '' };
};

const dbPath = path.join(ROOT, 'lib', 'db.js');
require.cache[require.resolve(dbPath)] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  select: async (table, filter = '') => {
    calls.select.push([table, filter]);
    if (table === 'customers') {
      return [{ id: 'cust-1', first_name: 'Ann', last_name: 'Lee', email: 'ann@example.test',
                email_opt_in: true, sms_opt_in: false }];
    }
    if (table === 'orders') {
      if (failDetailedOrders && filter.includes('order_items(')) throw new Error('column does not exist');
      return [{ status: 'pending', created_at: '2026-12-01T10:00:00Z' }];
    }
    return table === 'pickup_slots' ? [{
    id: SLOT, cancelled: false, slot_date: '2026-12-05', window_start: '10:00', window_end: '12:00',
    locations: { name: 'Porch' },
    slot_products: [{ product_id: 'loaf', booked: 2, total_capacity: 10,
                      products: { name: 'Sourdough', price_each_cents: 1000 } }],
    }] : [];
  },
  insert: async (table, row) => { calls.insert.push([table, row]); return [{ id: 'new-' + table, ...row }]; },
  upsert: async (table, row) => [{ id: 'cust-1', ...row }],
  update: async (table, filter, row) => { calls.update.push([table, filter, row]); return [row]; },
  del: async () => [],
} };

const orders = require(path.join(ROOT, 'api', 'orders.js'));
const { templates, esc } = require(path.join(ROOT, 'lib', 'email.js'));

function call(method, body, query) {
  return new Promise(resolve => {
    const res = { code: 0, setHeader() {}, status(c) { this.code = c; return this; },
                  json(j) { resolve({ code: this.code, json: j }); }, end() { resolve({ code: this.code }); } };
    orders({ method, body, query }, res);
  });
}
const good = () => ({ first_name: 'Ann <b>', last_name: 'Lee', email: 'ANN@example.test', slot_id: SLOT,
                      items: [{ product_id: 'loaf', quantity: 2 }], notes: '<script>x</script>' });

(async () => {
  // 1. emails are finished BEFORE the customer gets the answer
  let r = await call('POST', good());
  assert.strictEqual(r.code, 200);
  assert.strictEqual(calls.fetch.length, 2, 'customer + admin email must both be sent before the response');
  const adminMail = calls.fetch.find(c => c.body.to === 'admin@example.test').body.html;
  assert(!adminMail.includes('<script>') && adminMail.includes('&lt;script&gt;'), 'notes must be escaped');
  assert(!adminMail.includes('Ann <b>'), 'name must be escaped');
  assert.deepStrictEqual(calls.update.find(u => u[0] === 'slot_products')[2], { booked: 4 });

  // 2. a dead email service does not fail the order
  fetchMode = 'throw';
  r = await call('POST', good());
  assert.strictEqual(r.code, 200, 'order must still succeed when email is down');
  fetchMode = 'slow-ok';

  // 3. bad input is refused before anything is written
  const before = calls.insert.length;
  for (const bad of [
    { ...good(), items: [{ product_id: 'loaf', quantity: -5 }] },
    { ...good(), items: [{ product_id: 'loaf', quantity: '2x' }] },
    { ...good(), items: [{ product_id: 'loaf', quantity: 1.5 }] },
    { ...good(), items: [{ product_id: 'loaf', quantity: 1000 }] },
    { ...good(), items: 'loaf' },
    { ...good(), slot_id: SLOT + '&select=*' },
    { ...good(), slot_id: '5' },
  ]) {
    r = await call('POST', bad);
    assert.strictEqual(r.code, 400, 'should refuse ' + JSON.stringify(bad.items) + ' ' + bad.slot_id);
  }
  assert.strictEqual(calls.insert.length, before, 'refused orders must write nothing');
  r = await call('POST', { ...good(), items: [{ product_id: 'loaf', quantity: '3' }] });
  assert.strictEqual(r.code, 200, 'a numeric string quantity is accepted as a number');
  r = await call('POST', { ...good(), items: [{ product_id: 'loaf', quantity: 9 }] });
  assert.strictEqual(r.code, 409, 'over capacity is still refused');

  // 4. with ADMIN_PASSWORD unset, the admin API is closed to everyone
  for (const q of [{}, { password: undefined }, { password: '' }, { password: 'undefined' }, { password: null }]) {
    r = await call('GET', undefined, q);
    assert.strictEqual(r.code, 401, 'admin list must be closed for ' + JSON.stringify(q));
  }
  r = await call('POST', { adminAction: true, action: 'complete', orderId: 'x' });
  assert.strictEqual(r.code, 401);
  for (const f of ['availability', 'customers', 'notify', 'products', 'schedule', 'slots']) {
    const src = require('fs').readFileSync(path.join(ROOT, 'api', f + '.js'), 'utf8');
    assert(src.includes("|| Symbol('ADMIN_PASSWORD is not set')"), f + ' is not guarded');
    assert(!/[!=]== process\.env\.ADMIN_PASSWORD/.test(src), f + ' still compares against the raw env var');
  }

  // 5. templates still render, and escape
  assert.strictEqual(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  const c = { first_name: 'Bo', last_name: 'Li', email: 'b@example.test' };
  const slot = { slot_date: '2026-12-05', window_start: '10:00', window_end: '12:30', locations: { name: 'Porch' } };
  for (const html of [templates.orderReceived(c, slot, [], {}), templates.orderConfirmed(c, slot, [], { pickup_details: 'Gate <2>' }),
                      templates.orderCancelled(c, slot, {}), templates.adminNewOrder(c, slot, [], {}),
                      templates.magicLink(c, 'https://example.test/x'), templates.waitlistNotification(c, { label: 'wk' }, 'https://example.test')]) {
    assert(html.includes('Sillito Sourdough') && !html.includes('undefined'), 'template broke');
  }
  assert(templates.orderConfirmed(c, slot, [], { pickup_details: 'Gate <2>' }).includes('Gate &lt;2&gt;'));
  // 6. order text fields: must be text, a sane length, and a real-looking email
  const before6 = calls.insert.length;
  for (const bad of [
    { ...good(), first_name: 'x'.repeat(81) },
    { ...good(), notes: 'x'.repeat(1001) },
    { ...good(), notes: { $gt: '' } },
    { ...good(), phone: 5125550100 },
    { ...good(), email: 'not-an-email' },
    { ...good(), email: 'a@b' },
  ]) {
    r = await call('POST', bad);
    assert.strictEqual(r.code, 400, 'should refuse ' + JSON.stringify(bad).slice(0, 80));
  }
  assert.strictEqual(calls.insert.length, before6, 'refused orders must write nothing');

  // 7. public slot list: the location filter cannot carry extra query parts
  const run = (handler, req) => new Promise(resolve => {
    const res = { code: 0, setHeader() {}, status(c) { this.code = c; return this; },
                  json(j) { resolve({ code: this.code, json: j }); }, end() { resolve({ code: this.code }); } };
    handler(req, res);
  });
  const slots = require(path.join(ROOT, 'api', 'slots.js'));
  for (const bad of ['x&select=*,orders(*,customers(*))', 'a b', 'x,y', '(', 'x'.repeat(65), '']) {
    const n = calls.select.length;
    r = await run(slots, { method: 'GET', query: { location_id: bad } });
    assert.strictEqual(r.code, 400, 'slots must refuse location_id ' + JSON.stringify(bad));
    assert.strictEqual(calls.select.length, n, 'a refused location must not reach the database');
  }
  r = await run(slots, { method: 'GET', query: { location_id: 'rabadi-bjj' } });
  assert.strictEqual(r.code, 200);
  assert(calls.select.at(-1)[1].endsWith('&location_id=eq.rabadi-bjj'));
  r = await run(slots, { method: 'GET', query: {} });
  assert.strictEqual(r.code, 200, 'no location filter is fine');

  // 8. portal: no secret -> nothing verifies and no link is made; with one, a link works for 24 h
  const crypto = require('crypto');
  const portal = require(path.join(ROOT, 'api', 'portal.js'));
  const sign = (secret, email, exp) => {
    const data = `${email}|${exp}`;
    return Buffer.from(`${data}|${crypto.createHmac('sha256', secret).update(data).digest('hex')}`).toString('base64url');
  };
  delete process.env.PORTAL_SECRET;
  r = await run(portal, { method: 'GET', query: { token: sign('change-me-please', 'ann@example.test', Date.now() + 1e6) } });
  assert.strictEqual(r.code, 401, 'the old placeholder secret must not open the portal');
  let sentBefore = calls.fetch.length;
  r = await run(portal, { method: 'POST', body: { email: 'ann@example.test' } });
  assert.strictEqual(r.code, 500);
  assert.strictEqual(calls.fetch.length, sentBefore, 'no link email without a secret');

  process.env.PORTAL_SECRET = 'test-secret';
  process.env.SITE_URL = 'https://example.test';
  r = await run(portal, { method: 'POST', body: { email: 'Ann@Example.test' } });
  assert.strictEqual(r.code, 200);
  const link = calls.fetch.at(-1).body.html.match(/portal\.html\?token=([\w-]+)/);
  assert(link, 'the email must carry the link');
  r = await run(portal, { method: 'GET', query: { token: link[1] } });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.json.customer.email, 'ann@example.test');
  assert(!('id' in r.json.customer), 'the internal customer id stays on the server');
  const custQuery = calls.select.filter(c => c[0] === 'customers').at(-1)[1];
  assert(!custQuery.includes('select=*'), 'the portal must name its customer columns (the table holds private notes)');
  assert(calls.select.at(-1)[1].includes('order_items(') && calls.select.at(-1)[1].includes('pickup_slots('));
  for (const bad of [sign('wrong', 'ann@example.test', Date.now() + 1e6), sign('test-secret', 'ann@example.test', Date.now() - 1),
                     sign('test-secret', 'ann@example.test', 'soon'), link[1].slice(0, -2), 'x', ['a', 'b']]) {
    r = await run(portal, { method: 'GET', query: { token: bad } });
    assert.strictEqual(r.code, 401, 'bad or expired link must be refused');
  }
  failDetailedOrders = true;
  r = await run(portal, { method: 'GET', query: { token: link[1] } });
  assert.strictEqual(r.code, 200, 'a refused detailed query falls back to the plain one');
  failDetailedOrders = false;
  r = await run(portal, { method: 'POST', body: { email: { $ne: '' } } });
  assert.strictEqual(r.code, 400);

  // 9. announcements: an email that did not go out is not counted as sent
  process.env.ADMIN_PASSWORD = 'admin-test-pw';
  for (const f of ['notify.js']) delete require.cache[require.resolve(path.join(ROOT, 'api', f))];
  const notify = require(path.join(ROOT, 'api', 'notify.js'));
  r = await run(notify, { method: 'POST', body: { password: 'admin-test-pw', type: 'email', subject: 'Hi', message: 'Bread' } });
  assert.deepStrictEqual([r.code, r.json.emailsSent, r.json.errors.length], [200, 1, 0]);
  fetchMode = 'throw';
  r = await run(notify, { method: 'POST', body: { password: 'admin-test-pw', type: 'email', subject: 'Hi', message: 'Bread' } });
  assert.deepStrictEqual([r.code, r.json.emailsSent, r.json.errors.length], [200, 0, 1]);
  fetchMode = 'slow-ok';
  r = await run(notify, { method: 'POST', body: { password: 'wrong', type: 'email', subject: 'Hi', message: 'Bread' } });
  assert.strictEqual(r.code, 401);
  delete process.env.ADMIN_PASSWORD;

  // 10. pages that build HTML from customer-typed text must escape it
  const adminJs = require('fs').readFileSync(path.join(ROOT, 'admin.js'), 'utf8');
  const portalHtml = require('fs').readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
  for (const [name, src] of [['admin.js', adminJs], ['portal.html', portalHtml]]) {
    // .textContent is safe (the browser treats it as text), so only innerHTML templates are checked
    const html = src.split('\n').filter((l, i, a) => !l.includes('textContent') && !(a[i - 1] || '').includes('textContent =')).join('\n');
    const raw = html.match(/\$\{\s*(?:c|order|customer)\??\.(?:first_name|last_name|email|phone|notes|pickup_details)\s*(?:\|\|[^}]*)?\}/g) || [];
    assert.deepStrictEqual(raw, [], name + ' puts customer text into HTML without esc(): ' + raw.join(' '));
  }
  assert(adminJs.includes('function esc(') && portalHtml.includes('const esc ='));

  console.log('All good.');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
