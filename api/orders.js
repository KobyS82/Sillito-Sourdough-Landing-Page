const { select, insert, upsert, update } = require('../lib/db');
const { sendEmail, templates } = require('../lib/email');
const { sendSMS } = require('../lib/sms');

const ADMIN_PW    = process.env.ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function calcItemPrice(qty, product) {
  if (!product.price_each_cents) return 0;
  if (!product.deal_qty || !product.deal_price_cents) return qty * product.price_each_cents;
  return Math.floor(qty / product.deal_qty) * product.deal_price_cents +
         (qty % product.deal_qty) * product.price_each_cents;
}

// ── Admin: list orders ───────────────────────────────────────────────────────
async function listOrders(req, res) {
  const { password, status, location_id } = req.query || {};
  if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });
  try {
    let filter = '?select=*,customers(*),pickup_slots(*,locations(*)),order_items(*,products(*)),weeks(*)&order=created_at.desc';
    if (status)      filter += `&status=eq.${status}`;
    // Note: filtering by slot location requires a join filter — load all and filter client-side in admin
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
    const [order] = await select('orders',
      `?id=eq.${orderId}&select=*,customers(*),pickup_slots(*,locations(*)),order_items(*,products(*)),weeks(*)`);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const customer = order.customers;
    const slot     = order.pickup_slots;  // null for old orders
    const items    = order.order_items || [];
    const week     = order.weeks;         // null for new orders
    let updates    = {};

    if (action === 'confirm') {
      const pickupDetails = payload?.pickupDetails || '';
      updates = { status: 'confirmed', pickup_details: pickupDetails };

      await sendEmail({
        to: customer.email,
        subject: 'Your Sillito Sourdough order is confirmed!',
        html: templates.orderConfirmed(
          customer,
          slot || week,
          items,
          { ...order, pickup_details: pickupDetails }
        ),
      });

      if (customer.sms_opt_in && customer.phone) {
        const itemSummary = items.length
          ? items.map(i => `${i.quantity}× ${i.products?.name || i.product_id}`).join(', ')
          : `${order.loaves || 1} loaf${order.loaves !== 1 ? 'ves' : ''}`;
        await sendSMS({
          to: customer.phone,
          message: `Your Sillito Sourdough order is confirmed! ${itemSummary}.` +
                   (pickupDetails ? ` Pickup: ${pickupDetails}` : ''),
        });
      }
    } else if (action === 'cancel') {
      updates = { status: 'cancelled' };

      // Restore slot capacity for each item
      if (slot && items.length) {
        for (const item of items) {
          const [sp] = await select('slot_products',
            `?slot_id=eq.${slot.id}&product_id=eq.${item.product_id}`);
          if (sp) {
            await update('slot_products',
              `slot_id=eq.${slot.id}&product_id=eq.${item.product_id}`,
              { booked: Math.max(0, sp.booked - item.quantity) });
          }
        }
      } else if (order.week_id && order.loaves) {
        // Legacy: restore week availability
        const [w] = await select('weeks', `?id=eq.${order.week_id}`);
        if (w) await update('weeks', `id=eq.${order.week_id}`, { available: w.available + order.loaves });
      }

      await sendEmail({
        to: customer.email,
        subject: 'Your Sillito Sourdough order update',
        html: templates.orderCancelled(customer, slot || week, order),
      });
      if (customer.sms_opt_in && customer.phone) {
        await sendSMS({
          to: customer.phone,
          message: `Hi ${customer.first_name}, your Sillito Sourdough order was cancelled. Reply to your confirmation email with any questions.`,
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
        html: templates.orderConfirmed(
          customer, slot || week, items, { ...order, pickup_details: pickupDetails }
        ),
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
  const { first_name, last_name, email, phone, slot_id, items,
          notes, sms_opt_in, email_opt_in, recurring } = body;

  if (!first_name || !last_name || !email || !slot_id || !items?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Upsert customer
    const [customer] = await upsert('customers', {
      email:        email.toLowerCase().trim(),
      first_name:   first_name.trim(),
      last_name:    last_name.trim(),
      phone:        phone?.trim() || null,
      sms_opt_in:   !!sms_opt_in,
      email_opt_in: email_opt_in !== false,
    }, 'email');

    // Load slot with products and location
    const [slot] = await select('pickup_slots',
      `?id=eq.${slot_id}&select=*,slot_products(*,products(*)),locations(*)`);
    if (!slot)          return res.status(400).json({ error: 'Invalid pickup slot' });
    if (slot.cancelled) return res.status(409).json({ error: 'That slot has been cancelled. Please choose another date.' });

    // Validate capacity for each item
    const spMap = Object.fromEntries((slot.slot_products || []).map(sp => [sp.product_id, sp]));
    for (const item of items) {
      const sp = spMap[item.product_id];
      if (!sp) {
        return res.status(409).json({
          error: `${item.product_id} is not available for that pickup slot. Please choose a different date.`,
        });
      }
      if (sp.total_capacity !== null && (sp.booked + item.quantity) > sp.total_capacity) {
        const remaining = sp.total_capacity - sp.booked;
        return res.status(409).json({
          error: `Only ${remaining} left for that slot. Please adjust your quantity or choose a different date.`,
        });
      }
    }

    // Create order
    const [order] = await insert('orders', {
      customer_id: customer.id,
      slot_id,
      notes: notes?.trim() || null,
    });

    // Insert order_items and update booked counts
    const orderItems = [];
    for (const item of items) {
      const product         = spMap[item.product_id]?.products || {};
      const unit_price_cents  = product.price_each_cents || null;
      const total_price_cents = unit_price_cents ? calcItemPrice(item.quantity, product) : null;

      const [oi] = await insert('order_items', {
        order_id:           order.id,
        product_id:         item.product_id,
        quantity:           item.quantity,
        unit_price_cents,
        total_price_cents,
      });
      orderItems.push({ ...oi, products: product });

      // Increment booked count
      const sp = spMap[item.product_id];
      await update('slot_products',
        `slot_id=eq.${slot_id}&product_id=eq.${item.product_id}`,
        { booked: sp.booked + item.quantity });
    }

    // Update order total (for items with known prices)
    const totalCents = orderItems.reduce((s, oi) => s + (oi.total_price_cents || 0), 0);
    if (totalCents > 0) await update('orders', `id=eq.${order.id}`, { total_price_cents: totalCents });

    // Save recurring preference
    if (recurring) {
      await upsert('recurring_preferences', {
        customer_id: customer.id,
        loaves:      1,
        active:      true,
      }, 'customer_id');
    }

    // Notifications (fire-and-forget)
    Promise.all([
      sendEmail({
        to: customer.email,
        subject: `You're in the queue! — Sillito Sourdough`,
        html: templates.orderReceived(customer, slot, orderItems, order),
      }),
      ADMIN_EMAIL && sendEmail({
        to: ADMIN_EMAIL,
        subject: `New order: ${customer.first_name} ${customer.last_name}`,
        html: templates.adminNewOrder(customer, slot, orderItems, order),
      }),
      customer.sms_opt_in && customer.phone && sendSMS({
        to: customer.phone,
        message: `You're in the queue at Sillito Sourdough! I'll text pickup details soon.`,
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
