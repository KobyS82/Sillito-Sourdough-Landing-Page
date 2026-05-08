const KEY  = () => process.env.RESEND_API_KEY;
const FROM = () => process.env.EMAIL_FROM || 'Sillito Sourdough <hello@sillitosourdough.com>';

async function sendEmail({ to, subject, html }) {
  if (!KEY()) { console.warn('[Email] RESEND_API_KEY not set — skipping'); return null; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to, subject, html }),
  });
  if (!res.ok) console.error('[Email] Resend error:', await res.text());
  return res.json().catch(() => null);
}

// ── Shared chrome ────────────────────────────────────────────────────────────
function wrap(content) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:#f5f0e8;font-family:Georgia,'Times New Roman',serif}</style>
</head><body>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr><td style="padding:40px 16px;">
<table width="560" align="center" cellpadding="0" cellspacing="0"
  style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#3b2418;padding:28px 32px;text-align:center;">
    <h1 style="color:#f5f0e8;font-family:Georgia,serif;font-size:24px;font-weight:bold;margin:0;letter-spacing:.02em">Sillito Sourdough</h1>
    <p style="color:#c8b89a;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:6px 0 0">Austin, TX</p>
  </td></tr>
  <tr><td style="padding:32px 32px 28px">${content}</td></tr>
  <tr><td style="background:#3b2418;padding:16px 32px;text-align:center;">
    <p style="color:#c8b89a;font-size:12px;margin:0">Sillito Sourdough &bull; Austin, TX &bull; Made with love</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function detailBox(rows) {
  const items = rows.map(([k, v]) => v
    ? `<tr><td style="padding:5px 0;color:#5c3d2e;font-size:14px;vertical-align:top"><strong>${k}:</strong></td>
       <td style="padding:5px 0 5px 12px;color:#2e1f14;font-size:14px">${v}</td></tr>`
    : '').join('');
  return `<table cellpadding="0" cellspacing="0" width="100%"
    style="background:#f5f0e8;border-radius:6px;padding:16px 20px;margin:20px 0">
    <tbody>${items}</tbody></table>`;
}

function btn(text, url) {
  return `<p style="text-align:center;margin:24px 0 0">
    <a href="${url}" style="display:inline-block;background:#5c3d2e;color:#fff;text-decoration:none;
      padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;
      font-weight:bold;letter-spacing:.06em;text-transform:uppercase">${text}</a></p>`;
}

function p(text) {
  return `<p style="color:#5c3d2e;font-size:15px;line-height:1.75;margin:0 0 16px">${text}</p>`;
}

function h2(text) {
  return `<h2 style="color:#3b2418;font-family:Georgia,serif;font-size:20px;margin:0 0 14px">${text}</h2>`;
}

// ── Helpers for new slot-based schema ────────────────────────────────────────
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}

function fmtSlotOrWeek(slotOrWeek) {
  if (!slotOrWeek) return 'your order';
  // New slot format has slot_date
  if (slotOrWeek.slot_date) {
    const loc  = slotOrWeek.locations?.name || slotOrWeek.location_id || '';
    const d    = new Date(slotOrWeek.slot_date + 'T12:00:00');
    const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return `${loc} &mdash; ${date}, ${fmtTime(slotOrWeek.window_start)}&ndash;${fmtTime(slotOrWeek.window_end)}`;
  }
  return slotOrWeek.label || 'your week';
}

function fmtItems(items, order) {
  if (items?.length) {
    return items.map(item => {
      const p   = item.products || {};
      const qty = item.quantity;
      const name = p.name || item.product_id;
      if (item.total_price_cents) {
        return `${qty}&times; ${name} &mdash; $${(item.total_price_cents / 100).toFixed(2)}`;
      }
      return `${qty}&times; ${name}`;
    }).join('<br>');
  }
  // Legacy fallback for old loaves-based orders
  if (order?.loaves) return `${order.loaves} sourdough loaf${order.loaves !== 1 ? 'ves' : ''}`;
  return 'your order';
}

// ── Templates ────────────────────────────────────────────────────────────────

function orderReceived(customer, slotOrWeek, items, order) {
  const slotLabel = fmtSlotOrWeek(slotOrWeek);
  const itemsStr  = fmtItems(items, order);
  return wrap(`
    ${h2('You&#8217;re in the queue!')}
    ${p(`Hi ${customer.first_name}, thanks for ordering from Sillito Sourdough. Here&#8217;s what I have for you:`)}
    ${detailBox([
      ['Order',   itemsStr],
      ['Pickup',  slotLabel],
      ['Status',  'Pending confirmation'],
      ['Notes',   order?.notes],
    ])}
    ${p("I&#8217;ll follow up with pickup details soon. No payment until pickup &mdash; cash or Venmo both work.")}
    ${p('Questions? Just reply to this email.')}
  `);
}

function orderConfirmed(customer, slotOrWeek, items, order) {
  // Handle legacy 3-arg call: orderConfirmed(customer, week, order)
  let itemsArr = items;
  let orderObj = order;
  if (!Array.isArray(items)) { itemsArr = []; orderObj = items; }

  const slotLabel  = fmtSlotOrWeek(slotOrWeek);
  const itemsStr   = fmtItems(itemsArr, orderObj);
  const pickupInfo = orderObj?.pickup_details || 'Details coming soon';

  return wrap(`
    ${h2('Your order is confirmed!')}
    ${p(`Great news, ${customer.first_name} &mdash; your order is locked in.`)}
    ${detailBox([
      ['Order',        itemsStr],
      ['Pickup',       slotLabel],
      ['Pickup info',  pickupInfo],
      ['Payment',      'Cash or Venmo at pickup'],
    ])}
    ${p('See you at pickup!')}
  `);
}

function orderCancelled(customer, slotOrWeek, order) {
  const slotLabel = fmtSlotOrWeek(slotOrWeek);
  return wrap(`
    ${h2('Order update')}
    ${p(`Hi ${customer.first_name}, your Sillito Sourdough order (${slotLabel}) has been cancelled. Sorry about that!`)}
    ${p('If you have questions or want to re-order, just reply to this email or head back to the site.')}
  `);
}

function adminNewOrder(customer, slotOrWeek, items, order) {
  // Handle legacy 3-arg call
  let itemsArr = items;
  let orderObj = order;
  if (!Array.isArray(items)) { itemsArr = []; orderObj = items; }

  const slotLabel = fmtSlotOrWeek(slotOrWeek);
  const itemsStr  = fmtItems(itemsArr, orderObj);

  return wrap(`
    ${h2('New order!')}
    ${detailBox([
      ['Name',      `${customer.first_name} ${customer.last_name}`],
      ['Email',     customer.email],
      ['Phone',     customer.phone || '&mdash;'],
      ['Order',     itemsStr],
      ['Pickup',    slotLabel],
      ['Notes',     orderObj?.notes || '&mdash;'],
      ['SMS opt-in', customer.sms_opt_in ? 'Yes' : 'No'],
    ])}
  `);
}

function magicLink(customer, link) {
  return wrap(`
    ${h2('View your orders')}
    ${p(`Hi ${customer.first_name}! Here&#8217;s your secure link to view your Sillito Sourdough orders:`)}
    ${btn('View My Orders', link)}
    ${p('<small style="color:#888;font-size:13px">This link expires in 24 hours. If you didn&#8217;t request it, just ignore this email.</small>')}
  `);
}

function blast(customer, subject, message, ctaUrl) {
  const ctaSection = ctaUrl ? btn('Order Now', ctaUrl) : '';
  return wrap(`
    ${h2(subject)}
    ${p(message.replace(/\n/g, '<br>'))}
    ${ctaSection}
    ${p('<small style="color:#aaa;font-size:12px">You&#8217;re receiving this because you opted in to emails from Sillito Sourdough.</small>')}
  `);
}

function waitlistNotification(customer, week, siteUrl) {
  return wrap(`
    ${h2('Loaves available!')}
    ${p(`Hi ${customer.first_name}, good news &mdash; a spot just opened up for ${week.label} at Sillito Sourdough.`)}
    ${p('Head to the site to grab your loaf before they&#8217;re gone:')}
    ${btn('Reserve My Spot', siteUrl)}
  `);
}

module.exports = {
  sendEmail,
  templates: {
    orderReceived,
    orderConfirmed,
    orderCancelled,
    adminNewOrder,
    magicLink,
    blast,
    waitlistNotification,
  },
};
