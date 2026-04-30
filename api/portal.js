const crypto = require('crypto');
const { select, upsert } = require('../lib/db');
const { sendEmail, templates } = require('../lib/email');

const SECRET   = () => process.env.PORTAL_SECRET || 'change-me-please';
const SITE_URL = () => process.env.SITE_URL || '';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function makeToken(email) {
  const exp  = Date.now() + 24 * 3600 * 1000;
  const data = `${email}|${exp}`;
  const sig  = crypto.createHmac('sha256', SECRET()).update(data).digest('hex');
  return Buffer.from(`${data}|${sig}`).toString('base64url');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const lastPipe = decoded.lastIndexOf('|');
    const data     = decoded.slice(0, lastPipe);
    const sig      = decoded.slice(lastPipe + 1);
    const expected = crypto.createHmac('sha256', SECRET()).update(data).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    const [email, exp] = data.split('|');
    if (Date.now() > parseInt(exp)) return null;
    return email;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/portal?token=xxx  →  return customer + orders
  if (req.method === 'GET') {
    const { token } = req.query || {};
    if (!token) return res.status(400).json({ error: 'No token' });
    const email = verifyToken(token);
    if (!email) return res.status(401).json({ error: 'Invalid or expired link' });

    try {
      const [customer] = await select('customers', `?email=eq.${encodeURIComponent(email)}&select=*,recurring_preferences(loaves,active)`);
      if (!customer) return res.status(404).json({ error: 'No account found for that email' });

      const orders = await select('orders', `?customer_id=eq.${customer.id}&select=*,weeks(id,label)&order=created_at.desc`);
      return res.status(200).json({ customer, orders: orders || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST /api/portal  →  send magic link to email
  if (req.method === 'POST') {
    const { email, joinWaitlist, loaves } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
      const [customer] = await select('customers', `?email=eq.${encodeURIComponent(email.toLowerCase().trim())}`);

      if (joinWaitlist && customer) {
        await upsert('waitlist', { customer_id: customer.id, requested_loaves: loaves || 1, notified: false }, 'customer_id');
        return res.status(200).json({ ok: true, action: 'waitlisted' });
      }

      if (!customer) {
        // Not a known customer — don't reveal this, just say "if an account exists..."
        return res.status(200).json({ ok: true });
      }

      const token = makeToken(customer.email);
      const link  = `${SITE_URL()}/portal.html?token=${token}`;

      await sendEmail({
        to: customer.email,
        subject: 'Your Sillito Sourdough orders',
        html: templates.magicLink(customer, link),
      });

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[portal] error:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  res.status(405).end();
};
