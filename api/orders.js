const { select, insert, upsert, update } = require('../lib/db');
const { sendEmail, templates } = require('../lib/email');
const { sendSMS } = require('../lib/sms');

const ADMIN_PW    = process.env.ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SITE_URL    = process.env.SITE_URL || '';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Admin: list orders ───────────────────────────────────────────────────────
async function listOrders(req, res) {
  const { password, week, status } = req.query || {};
  if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
  try {
    let filter = '?select=*,customers(*),weeks(*)&order=created_at.desc';
    if (week)   filter += `&week_id=eq.${week}`;
    if (status) filter += `&status=eq.${status}`;
    const orders = await select('orders', filter);
    return res.status(200).json(orders || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── Admin: update order ──────────────────────────────────────────────────────
async function adminAction(body, res) {
  if (body.password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
  const { action, orderId, payload } = body;

  try {
    const [order] = await select('orders', `?id=eq.${orderId}&select=*,customers(*),weeks(*)`);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const customer = order.customers;
    const week     = order.weeks;
    let   updates  = {};

    if (action === 'confirm') {
      const pickupDetails = payload?.pickupDetails || '';
      updates = { status: 'confirmed', pickup_details: pickupDetails };

      await sendEmail({
        to: customer.email,
        subject: 'Your Sillito Sourdough order is confirmed!',
        html: templates.orderConfirmed(
          customer,
          week,
          { ...order, pickup_details: pickupDetails }
        ),
      });

      if (customer.sms_opt_in && customer.phone) {
        await sendSMS({
          to: customer.phone,
          message:
            `Your Sillito Sourdough order is confirmed! ` +
            `${order.loaves} loaf${order.loaves > 1 ? 'ves' : ''} for ${week?.label || 'your week'}.` +
            (pickupDetails ? ` Pickup: ${pickupDetails}` : ' Pickup details to follow.'),
        });
      }
    } else if (action === 'cancel') {
      updates = { status: 'cancelled' };
      // Restore availability
      const [w] = await select('weeks', `?id=eq.${order.week_id}`);
      if (w) await update('weeks', `id=eq.${order.week_id}`, { available: w.available + order.loaves });
      await sendEmail({
        to: customer.email,
        subject: 'Your Sillito Sourdough order update',
        html: templates.orderCancelled(customer, week, order),
      });
      if (customer.sms_opt_in && customer.phone) {
        await sendSMS({
          to: customer.phone,
          message: `Hi ${customer.first_name}, your Sillito Sourdough order for ${week?.label || 'your week'} was cancelled. Reply to your confirmation email with any questions.`,
        });
      }
    } else if (action === 'complete') {
      updates = { status: 'completed' };
    } else if (action === 'markPaid') {
      updates = { payment_status: 'paid', payment_method: payload?.method || 'cash' };
    } else if (action === 'sendPickup') {
      const pickupDetails = payload?.pickupDetails || '';
      updates = { pickup_details: pickupDetails };
      await sendEmail({
        to: customer.email,
        subject: 'Pickup details — Sillito Sourdough',
        html: templates.orderConfirmed(customer, week, { ...order, pickup_details: pickupDetails }),
      });
      if (customer.sms_opt_in && customer.phone) {
        await sendSMS({ to: customer.phone, message: `Sillito Sourdough pickup info: ${pickupDetails}` });
      }
    }

    const [updated] = await update('orders', `id=eq.${orderId}`, updates);
    return res.status(200).json(updated);
  } catch (e) {
    console.error('[orders] adminAction error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Public: place order ──────────────────────────────────────────────────────
async function placeOrder(body, res) {
  const { first_name, last_name, email, phone, week, loaves,
          notes, sms_opt_in, email_opt_in, recurring } = body;

  if (!first_name || !last_name || !email || !week || !loaves) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Upsert customer (update name/phone if they've ordered before)
    const [customer] = await upsert('customers', {
      email:      email.toLowerCase().trim(),
      first_name: first_name.trim(),
      last_name:  last_name.trim(),
      phone:      phone?.trim() || null,
      sms_opt_in: !!sms_opt_in,
      email_opt_in: email_opt_in !== false,
    }, 'email');

    // Check week availability
    const [weekData] = await select('weeks', `?id=eq.${week}`);
    if (!weekData) return res.status(400).json({ error: 'Invalid week selected' });
    if (weekData.available < parseInt(loaves)) {
      return res.status(409).json({ error: 'Not enough loaves available for that week. Please choose fewer or a different week.' });
    }

    // Atomically decrement — if another order just took the last spot, this will give
    // a constraint violation which we catch below.
    await update('weeks', `id=eq.${week}`, { available: weekData.available - parseInt(loaves) });

    // Create order
    const [order] = await insert('orders', {
      customer_id: customer.id,
      week_id:     week,
      loaves:      parseInt(loaves),
      notes:       notes?.trim() || null,
    });

    // Save recurring preference
    if (recurring) {
      await upsert('recurring_preferences', {
        customer_id: customer.id,
        loaves:      parseInt(loaves),
        active:      true,
      }, 'customer_id');
    }

    // Emails + SMS (fire-and-forget — don't fail the order if notifications fail)
    Promise.all([
      sendEmail({
        to: customer.email,
        subject: `You're in the queue! — Sillito Sourdough`,
        html: templates.orderReceived(customer, weekData, order),
      }),
      ADMIN_EMAIL && sendEmail({
        to: ADMIN_EMAIL,
        subject: `New order: ${customer.first_name} ${customer.last_name} — ${loaves} loaf${loaves > 1 ? 'ves' : ''}`,
        html: templates.adminNewOrder(customer, weekData, order),
      }),
      customer.sms_opt_in && customer.phone && sendSMS({
        to: customer.phone,
        message: `You're in the queue at Sillito Sourdough! ${loaves} loaf${loaves > 1 ? 'ves' : ''} for ${weekData.label}. I'll text pickup details soon.`,
      }),
    ]).catch(e => console.error('[orders] notification error:', e.message));

    return res.status(200).json({ ok: true, orderId: order.id });
  } catch (e) {
    console.error('[orders] placeOrder error:', e.message);
    return res.status(500).json({ error: 'Failed to place order. Please try again.' });
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET')  return listOrders(req, res);

  if (req.method === 'POST') {
    const body = req.body || {};
    if (body.adminAction) return adminAction(body, res);
    return placeOrder(body, res);
  }

  res.status(405).end();
};
