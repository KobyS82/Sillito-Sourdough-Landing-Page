// ── State ────────────────────────────────────────────────────────────────────
let password   = '';
let weeks      = [];
let orders     = [];
let customers  = [];
let modalAction= null; // { orderId, action }

// ── DOM refs ─────────────────────────────────────────────────────────────────
const loginSection  = document.getElementById('login-section');
const dashboard     = document.getElementById('dashboard');
const logoutBtn     = document.getElementById('logout-btn');

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const get = (path)       => api(path);
const post = (path, body)=> api(path, { method: 'POST',  body: JSON.stringify(body) });
const patch= (path, body)=> api(path, { method: 'PATCH', body: JSON.stringify(body) });

// ── Login ─────────────────────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const pw = document.getElementById('pw-input').value.trim();
  if (!pw) return;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-err');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  err.style.display = 'none';

  try {
    // Verify by attempting an admin write with the given password
    await post('/api/availability', { password: pw, weeks: [] });
    password = pw;
    loginSection.style.display = 'none';
    dashboard.style.display    = 'block';
    logoutBtn.style.display    = 'inline';
    loadAll();
  } catch {
    err.textContent   = 'Wrong password.';
    err.style.display = 'block';
    btn.disabled      = false;
    btn.textContent   = 'Log In';
  }
});
document.getElementById('pw-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

logoutBtn.addEventListener('click', () => {
  password = ''; weeks = []; orders = []; customers = [];
  dashboard.style.display    = 'none';
  loginSection.style.display = 'flex';
  document.getElementById('pw-input').value = '';
  logoutBtn.style.display = 'none';
});

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Load everything ───────────────────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadWeeks(), loadOrders(), loadCustomers()]);
}

// ── WEEKS ─────────────────────────────────────────────────────────────────────
async function loadWeeks() {
  try {
    weeks = await get('/api/availability');
    renderSchedule();
    renderWeekFilters();
    renderWaitlistWeekSelect();
  } catch (e) {
    console.error('[admin] loadWeeks:', e.message);
  }
}

function renderSchedule() {
  const list = document.getElementById('week-list');
  list.innerHTML = '';
  if (!weeks.length) {
    list.innerHTML = '<p class="empty-state">No weeks yet. Add one below.</p>';
    return;
  }
  weeks.forEach((w, i) => {
    const orderCount = orders.filter(o => o.week_id === w.id && o.status !== 'cancelled').reduce((s, o) => s + o.loaves, 0);
    const row = document.createElement('div');
    row.className = 'week-row';
    row.innerHTML = `
      <div class="week-label">${w.label}<small>${w.id}</small></div>
      <div class="avail-control">
        <button class="avail-btn" data-i="${i}" data-d="-1">−</button>
        <span class="avail-count">${w.available}</span>
        <button class="avail-btn" data-i="${i}" data-d="1">+</button>
      </div>
      <div class="avail-orders">${orderCount} loaf${orderCount !== 1 ? 'ves' : ''} ordered</div>
      <button class="remove-btn" data-remove="${w.id}" title="Remove week">✕</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('.avail-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      const d = parseInt(btn.dataset.d);
      const newVal = Math.max(0, weeks[i].available + d);
      try {
        await post('/api/availability', {
          password,
          weeks: [{ ...weeks[i], available: newVal }],
        });
        weeks[i].available = newVal;
        renderSchedule();
      } catch (e) { alert(e.message); }
    });
  });

  list.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove ${btn.dataset.remove}? This cannot be undone.`)) return;
      try {
        await fetch('/api/availability', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, id: btn.dataset.remove }),
        });
        weeks = weeks.filter(w => w.id !== btn.dataset.remove);
        renderSchedule();
      } catch (e) { alert(e.message); }
    });
  });
}

// Auto-fill label from date
document.getElementById('new-date').addEventListener('change', function () {
  const [y, m, d] = this.value.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  document.getElementById('new-label').value = `Week of ${label}`;
});

document.getElementById('add-week-btn').addEventListener('click', async () => {
  const id    = document.getElementById('new-date').value;
  const label = document.getElementById('new-label').value.trim() || `Week of ${id}`;
  const count = parseInt(document.getElementById('new-count').value, 10);
  if (!id) { alert('Select a date first.'); return; }
  if (weeks.find(w => w.id === id)) { alert('That week already exists.'); return; }
  const newWeek = { id, label, available: isNaN(count) ? 4 : count, total_capacity: isNaN(count) ? 4 : count };
  try {
    await post('/api/availability', { password, weeks: [newWeek] });
    weeks.push(newWeek);
    weeks.sort((a, b) => a.id.localeCompare(b.id));
    renderSchedule();
    renderWeekFilters();
    renderWaitlistWeekSelect();
    document.getElementById('new-date').value  = '';
    document.getElementById('new-label').value = '';
    document.getElementById('new-count').value = '4';
  } catch (e) { alert(e.message); }
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
document.getElementById('refresh-orders-btn').addEventListener('click', loadOrders);

async function loadOrders() {
  try {
    orders = await get(`/api/orders?password=${encodeURIComponent(password)}`);
    renderOrders();
    renderOrderStats();
  } catch (e) {
    document.getElementById('order-list').innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

function filteredOrders() {
  const week   = document.getElementById('filter-week').value;
  const status = document.getElementById('filter-status').value;
  return orders.filter(o =>
    (!week   || o.week_id === week) &&
    (!status || o.status  === status)
  );
}

document.getElementById('filter-week').addEventListener('change', renderOrders);
document.getElementById('filter-status').addEventListener('change', renderOrders);

function renderOrderStats() {
  const active = orders.filter(o => o.status !== 'cancelled');
  const stats = [
    { num: orders.filter(o => o.status === 'pending').length,   label: 'Pending' },
    { num: orders.filter(o => o.status === 'confirmed').length, label: 'Confirmed' },
    { num: orders.filter(o => o.status === 'completed').length, label: 'Completed' },
    { num: active.reduce((s, o) => s + o.loaves, 0),           label: 'Total loaves' },
  ];
  document.getElementById('order-stats').innerHTML = stats.map(s =>
    `<div class="stat-card"><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`
  ).join('');
}

function renderWeekFilters() {
  const sel = document.getElementById('filter-week');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All weeks</option>';
  weeks.forEach(w => sel.appendChild(new Option(w.label, w.id)));
  if (cur) sel.value = cur;
}

function renderWaitlistWeekSelect() {
  const sel = document.getElementById('waitlist-week-select');
  sel.innerHTML = '<option value="">Select week</option>';
  weeks.forEach(w => sel.appendChild(new Option(w.label, w.id)));
}

function renderOrders() {
  const list = document.getElementById('order-list');
  const fo   = filteredOrders();
  if (!fo.length) {
    list.innerHTML = '<div class="empty-state">No orders match the current filter.</div>';
    return;
  }
  list.innerHTML = fo.map(order => {
    const c    = order.customers || {};
    const w    = order.weeks    || {};
    const badge= `badge-${order.status}`;
    const pBadge = `badge-${order.payment_status}`;
    return `
    <div class="order-card" id="order-${order.id}">
      <div class="order-card-top">
        <div>
          <div class="order-name">${c.first_name || ''} ${c.last_name || ''}</div>
          <div class="order-meta">
            ${c.email || ''}${c.phone ? ' &bull; ' + c.phone : ''}
          </div>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
          <span class="badge ${badge}">${order.status}</span>
          <span class="badge ${pBadge}">${order.payment_status}</span>
        </div>
      </div>
      <div class="order-detail-row">
        <span class="order-pill"><strong>Week:</strong> ${w.label || order.week_id || '—'}</span>
        <span class="order-pill"><strong>Loaves:</strong> ${order.loaves}</span>
        <span class="order-pill"><strong>Ordered:</strong> ${fmtDate(order.created_at)}</span>
        ${c.sms_opt_in ? '<span class="order-pill" style="color:#047857">SMS ✓</span>' : ''}
        ${c.recurring_preferences?.length ? '<span class="order-pill" style="color:#5c3d2e">Recurring</span>' : ''}
      </div>
      ${order.notes ? `<div class="order-notes">Notes: ${order.notes}</div>` : ''}
      ${order.pickup_details ? `<div class="pickup-info">Pickup: ${order.pickup_details}</div>` : ''}
      <div class="order-actions">
        ${order.status === 'pending' ? `
          <button class="btn btn-sm btn-green" onclick="openModal('${order.id}','confirm')">Confirm + Send Pickup</button>
          <button class="btn btn-sm btn-outline" onclick="openModal('${order.id}','sendPickup')">Send Pickup Info</button>
          <button class="btn btn-sm btn-danger" onclick="doAction('${order.id}','cancel')">Cancel</button>
        ` : ''}
        ${order.status === 'confirmed' ? `
          <button class="btn btn-sm btn-outline" onclick="openModal('${order.id}','sendPickup')">Update Pickup</button>
          <button class="btn btn-sm btn-green" onclick="doAction('${order.id}','complete')">Mark Complete</button>
          <button class="btn btn-sm btn-danger" onclick="doAction('${order.id}','cancel')">Cancel</button>
        ` : ''}
        ${order.payment_status === 'unpaid' && order.status !== 'cancelled' ? `
          <button class="btn btn-sm btn-outline" onclick="markPaid('${order.id}','cash')">Mark Paid (Cash)</button>
          <button class="btn btn-sm btn-outline" onclick="markPaid('${order.id}','venmo')">Mark Paid (Venmo)</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

async function doAction(orderId, action) {
  if (action === 'cancel' && !confirm('Cancel this order? The customer will be notified.')) return;
  try {
    const updated = await post('/api/orders', { adminAction: true, password, action, orderId });
    // Update local state
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) Object.assign(orders[idx], updated);
    renderOrders();
    renderOrderStats();
  } catch (e) { alert(e.message); }
}

async function markPaid(orderId, method) {
  try {
    const updated = await post('/api/orders', {
      adminAction: true, password, action: 'markPaid', orderId, payload: { method },
    });
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) Object.assign(orders[idx], updated);
    renderOrders();
  } catch (e) { alert(e.message); }
}

// ── Modal (confirm / send pickup) ─────────────────────────────────────────────
const backdrop = document.getElementById('modal-backdrop');

function openModal(orderId, action) {
  modalAction = { orderId, action };
  const order = orders.find(o => o.id === orderId);
  document.getElementById('modal-title').textContent =
    action === 'confirm' ? 'Confirm Order + Send Pickup Details' : 'Send Pickup Details';
  document.getElementById('modal-pickup').value = order?.pickup_details || '';
  backdrop.style.display = 'flex';
  document.getElementById('modal-pickup').focus();
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  backdrop.style.display = 'none';
  modalAction = null;
});

backdrop.addEventListener('click', e => {
  if (e.target === backdrop) { backdrop.style.display = 'none'; modalAction = null; }
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
  const pickup = document.getElementById('modal-pickup').value.trim();
  if (!pickup) { alert('Please enter pickup details.'); return; }
  const { orderId, action } = modalAction;
  backdrop.style.display = 'none';
  try {
    const updated = await post('/api/orders', {
      adminAction: true, password, action, orderId, payload: { pickupDetails: pickup },
    });
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) Object.assign(orders[idx], updated);
    renderOrders();
    renderOrderStats();
  } catch (e) { alert(e.message); }
  modalAction = null;
});

// ── Export CSV ────────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  const fo = filteredOrders();
  const rows = [
    ['Name', 'Email', 'Phone', 'Week', 'Loaves', 'Status', 'Payment', 'Notes', 'Ordered'],
    ...fo.map(o => [
      `${o.customers?.first_name || ''} ${o.customers?.last_name || ''}`.trim(),
      o.customers?.email || '',
      o.customers?.phone || '',
      o.weeks?.label || o.week_id || '',
      o.loaves,
      o.status,
      o.payment_status,
      (o.notes || '').replace(/,/g, ';'),
      fmtDate(o.created_at),
    ]),
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a   = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `sillito-orders-${new Date().toISOString().slice(0,10)}.csv`,
  });
  a.click();
});

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
document.getElementById('refresh-customers-btn').addEventListener('click', loadCustomers);

async function loadCustomers() {
  try {
    customers = await get(`/api/customers?password=${encodeURIComponent(password)}`);
    renderCustomers();
    renderCustomerStats();
  } catch (e) {
    document.getElementById('customer-tbody').innerHTML =
      `<tr><td colspan="8" class="empty-state">${e.message}</td></tr>`;
  }
}

function renderCustomerStats() {
  const stats = [
    { num: customers.length,                                      label: 'Total customers' },
    { num: customers.filter(c => c.email_opt_in).length,         label: 'Email subscribers' },
    { num: customers.filter(c => c.sms_opt_in && c.phone).length,label: 'SMS subscribers' },
    { num: customers.filter(c => c.recurring_preferences?.some(r => r.active)).length, label: 'Recurring' },
  ];
  document.getElementById('customer-stats').innerHTML = stats.map(s =>
    `<div class="stat-card"><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`
  ).join('');
}

function renderCustomers() {
  const tbody = document.getElementById('customer-tbody');
  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No customers yet.</td></tr>';
    return;
  }
  tbody.innerHTML = customers.map(c => {
    const orderCount  = c.orders?.filter(o => o.status !== 'cancelled').length || 0;
    const totalLoaves = c.orders?.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.loaves, 0) || 0;
    const rec         = c.recurring_preferences?.find(r => r.active);
    return `<tr>
      <td><strong>${c.first_name} ${c.last_name}</strong></td>
      <td class="email-cell">${c.email}</td>
      <td class="email-cell">${c.phone || '—'}</td>
      <td>${orderCount} order${orderCount !== 1 ? 's' : ''} (${totalLoaves} loaves)</td>
      <td>${rec ? `${rec.loaves} loaf${rec.loaves !== 1 ? 'ves' : ''}/wk` : '—'}</td>
      <td>${c.email_opt_in ? '✓' : '—'}</td>
      <td>${c.sms_opt_in ? '✓' : '—'}</td>
      <td class="email-cell">${fmtDate(c.created_at)}</td>
    </tr>`;
  }).join('');
}

// ── ANNOUNCE ──────────────────────────────────────────────────────────────────
document.querySelectorAll('input[name="blast-type"]').forEach(r => {
  r.addEventListener('change', () => {
    const isSMS = r.value === 'sms';
    document.getElementById('subject-group').style.display = isSMS ? 'none' : 'block';
    document.getElementById('sms-count').style.display     = isSMS || r.value === 'both' ? 'block' : 'none';
    updateSmsCount();
  });
});

document.getElementById('blast-message').addEventListener('input', updateSmsCount);

function updateSmsCount() {
  const msg = document.getElementById('blast-message').value;
  const el  = document.getElementById('sms-count');
  const segs = Math.ceil(msg.length / 160) || 1;
  el.textContent = `${msg.length} chars / ~${segs} SMS segment${segs !== 1 ? 's' : ''}`;
}

document.getElementById('preview-btn').addEventListener('click', () => {
  const box = document.getElementById('announce-preview');
  const msg = document.getElementById('blast-message').value.trim();
  const sub = document.getElementById('blast-subject').value.trim();
  box.style.display = 'block';
  box.textContent   = sub ? `Subject: ${sub}\n\n${msg}` : msg;
});

document.getElementById('send-blast-btn').addEventListener('click', async () => {
  const type    = document.querySelector('input[name="blast-type"]:checked').value;
  const subject = document.getElementById('blast-subject').value.trim();
  const message = document.getElementById('blast-message').value.trim();
  const ctaUrl  = document.getElementById('blast-cta').value.trim();

  if (!message) { alert('Message is required.'); return; }
  if ((type === 'email' || type === 'both') && !subject) { alert('Subject is required for email.'); return; }

  const emailCount = customers.filter(c => c.email_opt_in).length;
  const smsCount   = customers.filter(c => c.sms_opt_in && c.phone).length;
  const confirm_msg = type === 'both'
    ? `Send to ${emailCount} email + ${smsCount} SMS subscribers?`
    : type === 'email'
      ? `Send to ${emailCount} email subscribers?`
      : `Send SMS to ${smsCount} subscribers?`;

  if (!confirm(confirm_msg)) return;

  const btn    = document.getElementById('send-blast-btn');
  const status = document.getElementById('blast-status');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  status.style.display = 'none';

  try {
    const result = await post('/api/notify', { password, type, subject, message, ctaUrl });
    status.className    = 'status ok';
    status.textContent  = `Done! Emails sent: ${result.emailsSent}, SMS sent: ${result.smsSent}`;
    status.style.display= 'block';
  } catch (e) {
    status.className    = 'status err';
    status.textContent  = e.message;
    status.style.display= 'block';
  }
  btn.disabled    = false;
  btn.textContent = 'Send to all subscribers';
});

document.getElementById('notify-waitlist-btn').addEventListener('click', async () => {
  const weekId = document.getElementById('waitlist-week-select').value;
  if (!weekId) { alert('Select a week first.'); return; }
  const btn    = document.getElementById('notify-waitlist-btn');
  const status = document.getElementById('waitlist-status');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  status.style.display = 'none';

  try {
    const result = await post('/api/notify', { password, notifyWaitlist: weekId });
    status.className    = 'status ok';
    status.textContent  = `Notified ${result.waitlistNotified} waitlist customer${result.waitlistNotified !== 1 ? 's' : ''}.`;
    status.style.display= 'block';
  } catch (e) {
    status.className    = 'status err';
    status.textContent  = e.message;
    status.style.display= 'block';
  }
  btn.disabled    = false;
  btn.textContent = 'Notify Waitlist';
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
